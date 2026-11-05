"""Fork-local (ver LOCAL_CHANGES.md): painel "Life log" (linha da vida).

Le, SOMENTE LEITURA, o banco gerado no NAS pelo `nas-lifelog-export` (nas-nixos services/lifelog) a partir do Google
Takeout: pesquisas, YouTube, Maps, Play, Assistente etc. (events), Fit por dia e treinos, notas do Keep e lugares salvos.
O PC puxa a copia diaria para /data/lifelog (caelestia-arch-setup scripts/tools/lifelog-sync); no Docker chega pelo bind
`/data/lifelog:/app/lifelog:ro` (docker/pereiraoc.yml). Env LIFELOG_DB sobrescreve.

Rotas (todas exigem usuario):
  GET /api/lifelog/meta     intervalo, fontes com contagem, quando o banco foi gerado
  GET /api/lifelog/series   contagem por mes (ou ano) e fonte
  GET /api/lifelog/day      tudo de um dia: eventos, Fit, treinos, notas criadas/editadas
  GET /api/lifelog/search   busca por texto (titulo/detalhe), com fonte e periodo
  GET /api/lifelog/fit      metricas diarias do Fit num periodo
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from src.auth_helpers import require_user

CANDIDATES = [os.environ.get("LIFELOG_DB", ""), "/app/lifelog/lifelog.sqlite", "/data/lifelog/lifelog.sqlite"]
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _db_path() -> Optional[Path]:
    env = os.environ.get("LIFELOG_DB", "")
    for c in ([env] if env else []) + CANDIDATES:
        if c and Path(c).is_file():
            return Path(c)
    return None


def _con() -> sqlite3.Connection:
    p = _db_path()
    if not p:
        raise HTTPException(404, "lifelog database not found (run nas-lifelog-export on the NAS and lifelog-sync on the PC)")
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def _day(v: Optional[str], name: str) -> Optional[str]:
    if v is None or v == "":
        return None
    if not DAY_RE.match(v):
        raise HTTPException(400, f"invalid {name} (YYYY-MM-DD)")
    return v


def setup_lifelog_routes() -> APIRouter:
    r = APIRouter(prefix="/api/lifelog", tags=["lifelog"])

    @r.get("/meta")
    def meta(user: str = Depends(require_user)):
        with _con() as con:
            rng = con.execute("select min(day) a, max(day) b from events").fetchone()
            src = [{"source": s, "count": n} for s, n in
                   con.execute("select source, count(*) from events group by source order by 2 desc")]
            m = dict(con.execute("select key, value from meta").fetchall())
        return {"range": {"from": rng["a"], "to": rng["b"]}, "sources": src, "built_at": m.get("built_at")}

    @r.get("/series")
    def series(bucket: str = "month", user: str = Depends(require_user)):
        b = {"month": "substr(day,1,7)", "year": "substr(day,1,4)"}.get(bucket)
        if not b:
            raise HTTPException(400, "bucket must be month or year")
        with _con() as con:
            return [{"bucket": k, "source": s, "count": n} for k, s, n in
                    con.execute(f"select {b}, source, count(*) from events group by 1, 2 order by 1, 2")]

    @r.get("/day")
    def day(d: str, user: str = Depends(require_user)):
        d = _day(d, "d")
        with _con() as con:
            ev = [dict(x) for x in con.execute(
                "select ts, source, title, url, detail from events where day=? order by ts", (d,))]
            fit = con.execute("select * from fit_daily where day=?", (d,)).fetchone()
            ses = [dict(x) for x in con.execute(
                "select * from fit_sessions where substr(start,1,10) between date(?, '-1 day') and ? order by start", (d, d))
                   if x["start"]]
            notes = [dict(x) for x in con.execute(
                "select id, title, text, labels, created, edited from notes where trashed=0 and "
                "(substr(created,1,10)=? or substr(edited,1,10)=?) order by coalesce(edited, created)", (d, d))]
        return {"day": d, "events": ev, "fit": dict(fit) if fit else None, "sessions": ses, "notes": notes}

    @r.get("/search")
    def search(q: str = "", source: str = "", frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
               limit: int = 200, user: str = Depends(require_user)):
        limit = max(1, min(limit, 1000))
        where, args = [], []
        if q.strip():
            where.append("(title like ? or detail like ?)"); args += [f"%{q.strip()}%"] * 2
        if source:
            where.append("source = ?"); args.append(source)
        if _day(frm, "from"):
            where.append("day >= ?"); args.append(frm)
        if _day(to, "to"):
            where.append("day <= ?"); args.append(to)
        sql = "select ts, day, source, title, url from events" + (" where " + " and ".join(where) if where else "")
        with _con() as con:
            return [dict(x) for x in con.execute(sql + " order by ts desc limit ?", (*args, limit))]

    @r.get("/fit")
    def fit(frm: Optional[str] = Query(None, alias="from"), to: Optional[str] = None, user: str = Depends(require_user)):
        a, b = _day(frm, "from") or "0000-01-01", _day(to, "to") or "9999-12-31"
        with _con() as con:
            return [dict(x) for x in con.execute("select * from fit_daily where day between ? and ? order by day", (a, b))]

    return r
