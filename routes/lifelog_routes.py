"""Fork-local (ver LOCAL_CHANGES.md §11): API do painel "Life" — linha do tempo unificada.

Spec: docs/superpowers/specs/2026-11-06-life-timeline-design.md. Lê, SOMENTE LEITURA, o lifelog.sqlite do NAS (Takeout,
bind /data/lifelog:/app/lifelog:ro), as Finanças (data/finance) e o Uso de IA (/app/ai-usage), pelos provedores de
src/life. Todas as rotas exigem admin.

  GET /api/lifelog/meta        hoje (UTC-3), intervalo coberto e estado das fontes
  GET /api/lifelog/day         página do dia montada no servidor (src/life/assemble.py) + dias vizinhos se vazio
  GET /api/lifelog/month       valores por dia de um mês (YYYY-MM)
  GET /api/lifelog/year        valores por dia/mês de um ano, métricas e faixas fixas
  GET /api/lifelog/onthisday   o mesmo dia em anos anteriores (±3 dias)
  GET /api/lifelog/search      busca em todas as fontes, agrupada por dia
  GET /api/lifelog/sources     estado de cada fonte
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.middleware import require_admin
from src.life import registry
from src.life.assemble import assemble_day
from src.life.common import safe_status, today
from src.life.views import month_view, nearest_days, on_this_day, search_all, year_view

DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


def _date(v: Optional[str], name: str) -> Optional[date]:
    if not v:
        return None
    try:
        if not DAY_RE.match(v):
            raise ValueError(v)
        return date.fromisoformat(v)
    except ValueError:
        raise HTTPException(400, f"invalid {name} (YYYY-MM-DD)")


def setup_lifelog_routes() -> APIRouter:
    r = APIRouter(prefix="/api/lifelog", tags=["lifelog"], dependencies=[Depends(require_admin)])

    @r.get("/meta")
    def meta():
        sources = [safe_status(p) for p in registry.providers()]
        froms = [s["from"] for s in sources if s.get("from")]
        tos = [s["to"] for s in sources if s.get("to")]
        return {"today": today().isoformat(), "sources": sources,
                "range": {"from": min(froms) if froms else None, "to": max(tos) if tos else None}}

    @r.get("/day")
    def day(d: str):
        dd = _date(d, "d")
        if dd is None:
            raise HTTPException(400, "d is required")
        ps = registry.providers()
        out = assemble_day(dd, ps)
        out["nearest"] = None if (out["blocks"] or out["all_day"]) else nearest_days(dd, ps)
        return out

    @r.get("/month")
    def month(m: str):
        mm = MONTH_RE.match(m or "")
        if not mm or not 1 <= int(mm.group(2)) <= 12:
            raise HTTPException(400, "invalid m (YYYY-MM)")
        return month_view(int(mm.group(1)), int(mm.group(2)), registry.providers())

    @r.get("/year")
    def year(y: str):
        if not re.fullmatch(r"\d{4}", y or ""):
            raise HTTPException(400, "invalid y (YYYY)")
        return year_view(int(y), registry.providers())

    @r.get("/onthisday")
    def onthisday(d: str):
        dd = _date(d, "d")
        if dd is None:
            raise HTTPException(400, "d is required")
        return on_this_day(dd, registry.providers())

    @r.get("/search")
    def search(q: str = "", kinds: str = "", frm: Optional[str] = Query(None, alias="from"),
               to: Optional[str] = None, limit: int = 300):
        q = q.strip()
        if len(q) < 2:
            raise HTTPException(400, "query too short (min 2 characters)")
        a, b = _date(frm, "from"), _date(to, "to")
        ks = {k for k in kinds.split(",") if k} or None
        return search_all(q, registry.providers(), kinds=ks, frm=a.isoformat() if a else None,
                          to=b.isoformat() if b else None, limit=max(1, min(limit, 1000)))

    @r.get("/sources")
    def sources():
        return [safe_status(p) for p in registry.providers()]

    return r
