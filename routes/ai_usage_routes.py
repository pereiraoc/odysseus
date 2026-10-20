"""Fork-local (ver LOCAL_CHANGES.md): painel "Uso de IA".

Le, SOMENTE LEITURA, o banco gerado no host pelo `ai-usage-export`
(caelestia-arch-setup/scripts/tools/ai-usage-export.py, timer diario): tokens
por chamada de Claude Code, Codex, Cursor, Copilot, Cline e do proprio Odysseus,
com dia, sessao, MODELO e categoria de atividade. No Docker o banco chega pelo
bind `/data/ai-usage:/app/ai-usage:ro` (docker/pereiraoc.yml); fora dele, pelo
caminho do host. Env AI_USAGE_DB sobrescreve.

Rotas (todas exigem usuario):
  GET /api/ai-usage/meta        intervalo, fontes, categorias, modelos, maquinas, ultima coleta
  GET /api/ai-usage/series      serie temporal agrupada (dia/semana/mes x categoria/modelo/fonte/maquina)
  GET /api/ai-usage/breakdown   totais por dimensao
  GET /api/ai-usage/sessions    sessoes agregadas (busca, ordenacao)
  GET /api/ai-usage/session     detalhe de uma sessao (dias x modelo, ferramentas)
  GET /api/ai-usage/heatmap     valor por dia (calendario)
  GET /api/ai-usage/hours       distribuicao por hora do dia
  GET /api/ai-usage/tools       ferramentas mais chamadas
  GET /api/ai-usage/limits      limites do plano do Codex ao longo do tempo
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from src.auth_helpers import require_user

CANDIDATES = [os.environ.get("AI_USAGE_DB", ""), "/app/ai-usage/ai-usage.sqlite", "/data/ai-usage/ai-usage.sqlite"]

DIMS = {"category": "category", "model": "model", "source": "source", "machine": "machine", "session": "session_key"}
METRICS = {
    "total": "sum(total)", "output": "sum(output)", "input": "sum(input)", "cache_read": "sum(cache_read)",
    "cache_write": "sum(cache_write)", "calls": "sum(calls)", "cost_usd": "coalesce(sum(cost_usd),0)",
    "reasoning": "sum(reasoning)",
}
BUCKETS = {"day": "day", "week": "strftime('%Y-W%W', day)", "month": "substr(day,1,7)"}


def _db_path() -> Optional[Path]:
    for c in CANDIDATES:
        if c and Path(c).is_file():
            return Path(c)
    return None


def _con() -> sqlite3.Connection:
    p = _db_path()
    if not p:
        raise HTTPException(404, "banco do ai-usage-export nao encontrado (rode o exportador no host)")
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=10)
    con.row_factory = sqlite3.Row
    return con


DAILY_COLS = {"day": "day", "source": "source", "category": "category", "model": "model", "machine": "machine",
              "estimated": "estimated"}
EVENT_COLS = {"day": "e.day", "source": "e.source", "category": "coalesce(dc.category, s.category)",
              "model": "e.model", "machine": "e.machine", "estimated": "e.estimated"}


class Filters:
    def __init__(self, frm, to, sources, categories, models, machines, estimated):
        self.frm, self.to, self.estimated = frm, to, estimated
        self.lists = {k: [v for v in (x or "").split(",") if v != ""]
                      for k, x in (("source", sources), ("category", categories), ("model", models), ("machine", machines))}

    def sql(self, cols: dict = DAILY_COLS) -> tuple[str, list]:
        where, args = ["1=1"], []
        if self.frm:
            where.append(f"{cols['day']} >= ?"); args.append(self.frm)
        if self.to:
            where.append(f"{cols['day']} <= ?"); args.append(self.to)
        for k, vals in self.lists.items():
            if vals:
                where.append(f"{cols[k]} in ({','.join('?' * len(vals))})"); args += vals
        if not self.estimated:
            where.append(f"{cols['estimated']} = 0")
        return " and ".join(where), args


def _common(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, sources: Optional[str] = None,
            categories: Optional[str] = None, models: Optional[str] = None, machines: Optional[str] = None,
            estimated: bool = True) -> Filters:
    return Filters(frm, to, sources, categories, models, machines, estimated)


def setup_ai_usage_routes() -> APIRouter:
    r = APIRouter(prefix="/api/ai-usage", tags=["ai-usage"])

    @r.get("/meta")
    def meta(user: str = Depends(require_user)):
        p = _db_path()
        if not p:
            return {"available": False, "hint": "rode `ai-usage-export` no host (timer ai-usage-export.timer)"}
        con = _con()
        try:
            rng = con.execute("select min(day) a, max(day) b, sum(total) t, sum(output) o, count(distinct session_key) s, "
                              "count(distinct day) d, sum(case when estimated=1 then total else 0 end) e from daily").fetchone()
            dim = lambda c: [dict(x) for x in con.execute(
                f"select {c} as key, sum(total) total, count(distinct session_key) sessions from daily group by {c} order by total desc")]
            last = con.execute("select ts, summary from runs order by ts desc limit 1").fetchone()
            return {"available": True, "db": str(p), "mtime": p.stat().st_mtime,
                    "day_min": rng["a"], "day_max": rng["b"], "total": rng["t"] or 0, "output": rng["o"] or 0,
                    "sessions": rng["s"] or 0, "days": rng["d"] or 0, "estimated_total": rng["e"] or 0,
                    "sources": dim("source"), "categories": dim("category"), "models": dim("model"),
                    "machines": dim("machine"),
                    "last_run": {"ts": last["ts"], **json.loads(last["summary"] or "{}")} if last else None}
        finally:
            con.close()

    @r.get("/series")
    def series(bucket: str = "day", by: str = "category", metric: str = "total", top: int = 12,
               flt=Depends(_common), user: str = Depends(require_user)):
        if bucket not in BUCKETS or by not in DIMS or metric not in METRICS:
            raise HTTPException(400, "bucket/by/metric invalido")
        where, args = flt.sql()
        b, d, m = BUCKETS[bucket], DIMS[by], METRICS[metric]
        con = _con()
        try:
            tops = [x[0] for x in con.execute(f"select {d} k, {m} v from daily where {where} group by k order by v desc limit ?",
                                              args + [max(1, min(top, 40))])]
            rows = con.execute(f"select {b} bk, {d} k, {m} v from daily where {where} group by bk, k order by bk", args).fetchall()
        finally:
            con.close()
        buckets = sorted({x["bk"] for x in rows})
        idx = {bk: i for i, bk in enumerate(buckets)}
        series_ = {k: [0] * len(buckets) for k in tops}
        other = [0] * len(buckets)
        for x in rows:
            (series_[x["k"]] if x["k"] in series_ else other)[idx[x["bk"]]] += x["v"] or 0
        out = [{"key": k if k not in (None, "") else "(sem)", "values": v} for k, v in series_.items()]
        if any(other):
            out.append({"key": "Outros (resto)", "values": other})
        return {"buckets": buckets, "series": out, "metric": metric, "by": by, "bucket": bucket}

    @r.get("/breakdown")
    def breakdown(by: str = "category", metric: str = "total", flt=Depends(_common), user: str = Depends(require_user)):
        if by not in DIMS or metric not in METRICS:
            raise HTTPException(400, "by/metric invalido")
        where, args = flt.sql()
        d = DIMS[by]
        con = _con()
        try:
            rows = con.execute(
                f"select {d} key, {METRICS[metric]} value, sum(total) total, sum(output) output, sum(input) input, "
                f"sum(cache_read) cache_read, sum(cache_write) cache_write, sum(calls) calls, "
                f"coalesce(sum(cost_usd),0) cost_usd, count(distinct session_key) sessions, count(distinct day) days, "
                f"min(day) first_day, max(day) last_day, max(estimated) estimated, group_concat(distinct source) sources "
                f"from daily where {where} group by {d} order by value desc limit 300", args).fetchall()
            return [dict(x) for x in rows]
        finally:
            con.close()

    @r.get("/sessions")
    def sessions(q: str = "", sort: str = "total", limit: int = 300, flt=Depends(_common), user: str = Depends(require_user)):
        where, args = flt.sql()
        order = {"total": "total", "output": "output", "calls": "calls", "last": "last_day", "first": "first_day",
                 "days": "days"}.get(sort, "total")
        if q:
            where += " and (title like ? or cwd like ? or session_key like ?)"
            args = args + [f"%{q}%"] * 3
        con = _con()
        try:
            rows = con.execute(
                f"select session_key, source, machine, max(title) title, max(cwd) cwd, group_concat(distinct model) models, "
                f"group_concat(distinct category) categories, min(day) first_day, max(day) last_day, count(distinct day) days, "
                f"sum(calls) calls, sum(total) total, sum(output) output, sum(cache_read) cache_read, "
                f"coalesce(sum(cost_usd),0) cost_usd, max(estimated) estimated "
                f"from daily where {where} group by session_key order by {order} desc limit ?",
                args + [max(1, min(limit, 2000))]).fetchall()
            return [dict(x) for x in rows]
        finally:
            con.close()

    @r.get("/session")
    def session(key: str, user: str = Depends(require_user)):
        con = _con()
        try:
            s = con.execute("select * from sessions where key=?", (key,)).fetchone()
            if not s:
                raise HTTPException(404, "sessao nao encontrada")
            days = con.execute("select day, model, category, calls, total, output, cache_read, input, cache_write "
                               "from daily where session_key=? order by day", (key,)).fetchall()
            tools = con.execute("select tool, count(*) n from tool_calls where session_key=? group by tool order by n desc limit 25",
                                (key,)).fetchall()
            extra = con.execute("select sum(web_search) ws, sum(web_fetch) wf, sum(reasoning) reasoning, "
                                "group_concat(distinct effort) efforts, group_concat(distinct entrypoint) entrypoints, "
                                "avg(nullif(latency_ms,0)) latency from events where session_key=?", (key,)).fetchone()
            prompts = con.execute("select count(*) n, sum(chars) chars from prompts where session_key=?", (key,)).fetchone()
            return {"session": dict(s), "days": [dict(x) for x in days], "tools": [dict(x) for x in tools],
                    "extra": dict(extra), "prompts": dict(prompts)}
        finally:
            con.close()

    @r.get("/heatmap")
    def heatmap(metric: str = "total", flt=Depends(_common), user: str = Depends(require_user)):
        if metric not in METRICS:
            raise HTTPException(400, "metric invalido")
        where, args = flt.sql()
        con = _con()
        try:
            return [dict(x) for x in con.execute(
                f"select day, {METRICS[metric]} value, count(distinct session_key) sessions from daily where {where} "
                f"group by day order by day", args)]
        finally:
            con.close()

    @r.get("/hours")
    def hours(metric: str = "total", flt=Depends(_common), user: str = Depends(require_user)):
        w, args = flt.sql(EVENT_COLS)
        col = metric if metric in ("total", "output", "input", "cache_read", "cache_write", "reasoning") else "total"
        m = "count(*)" if metric == "calls" else f"sum(e.{col})"
        con = _con()
        try:
            return [dict(x) for x in con.execute(
                f"select e.hour hour, {m} value from events e left join sessions s on s.key=e.session_key "
                f"left join day_category dc on dc.session_key=e.session_key and dc.day=e.day where {w} "
                f"group by e.hour order by e.hour", args)]
        finally:
            con.close()

    @r.get("/tools")
    def tools(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, sources: Optional[str] = None,
              user: str = Depends(require_user)):
        where, args = ["1=1"], []
        if frm:
            where.append("day >= ?"); args.append(frm)
        if to:
            where.append("day <= ?"); args.append(to)
        if sources:
            v = sources.split(",")
            where.append(f"source in ({','.join('?' * len(v))})"); args += v
        con = _con()
        try:
            return [dict(x) for x in con.execute(
                f"select source, tool, count(*) calls, count(distinct session_key) sessions from tool_calls "
                f"where {' and '.join(where)} group by source, tool order by calls desc limit 60", args)]
        finally:
            con.close()

    @r.get("/limits")
    def limits(user: str = Depends(require_user)):
        con = _con()
        try:
            return [dict(x) for x in con.execute(
                "select day, limit_name, window_minutes, max(used_percent) used_percent, max(plan) plan "
                "from rate_limits group by day, limit_name order by day")]
        finally:
            con.close()

    def _range(frm, to):
        where, args = ["1=1"], []
        if frm:
            where.append("day >= ?"); args.append(frm)
        if to:
            where.append("day <= ?"); args.append(to)
        return " and ".join(where), args

    def _has(con, table):
        return con.execute("select 1 from sqlite_master where name=?", (table,)).fetchone() is not None

    @r.get("/web")
    def web(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
            user: str = Depends(require_user)):
        """Chats de IA no navegador (historico): sem tokens, so visitas e conversas."""
        con = _con()
        try:
            if not _has(con, "web_visits"):
                return {"days": [], "sites": [], "conversations": []}
            w, a = _range(frm, to)
            days = [dict(x) for x in con.execute(
                f"select day, site, count(*) visits, count(distinct nullif(conversation,'')) conversations "
                f"from web_visits where {w} group by day, site order by day", a)]
            sites = [dict(x) for x in con.execute(
                f"select site, count(*) visits, count(distinct nullif(conversation,'')) conversations, "
                f"count(distinct day) days, min(day) first_day, max(day) last_day, group_concat(distinct browser) browsers "
                f"from web_visits where {w} group by site order by visits desc", a)]
            convs = [dict(x) for x in con.execute(
                f"select site, conversation, max(title) title, count(*) visits, min(day) first_day, max(day) last_day "
                f"from web_visits where {w} and conversation <> '' group by site, conversation "
                f"order by visits desc limit 150", a)]
            return {"days": days, "sites": sites, "conversations": convs}
        finally:
            con.close()

    @r.get("/ai-code")
    def ai_code(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                user: str = Depends(require_user)):
        """Codigo gerado por IA no Cursor (ai-code-tracking): blocos por modelo e placar por commit."""
        con = _con()
        try:
            if not _has(con, "ai_code"):
                return {"days": [], "models": [], "commits": []}
            w, a = _range(frm, to)
            days = [dict(x) for x in con.execute(
                f"select day, coalesce(nullif(model,''),'(sem modelo)') model, count(*) blocks "
                f"from ai_code where {w} group by day, model order by day", a)]
            models = [dict(x) for x in con.execute(
                f"select coalesce(nullif(model,''),'(sem modelo)') model, kind, count(*) blocks, "
                f"count(distinct session_key) conversations, min(day) first_day, max(day) last_day "
                f"from ai_code where {w} group by model, kind order by blocks desc", a)]
            commits = [dict(x) for x in con.execute(
                f"select day, branch, commit_hash, lines_added, lines_deleted, tab_added + composer_added ai_added, "
                f"human_added, ai_percent from ai_commits where {w} order by ts desc limit 300", a)]
            return {"days": days, "models": models, "commits": commits}
        finally:
            con.close()

    return r
