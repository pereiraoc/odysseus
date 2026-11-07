"""Visões de resumo do Life: mês, ano, "On this day", busca e dias vizinhos com dados.

`values[métrica]` é None fora da cobertura da fonte (sem dado) e 0 dentro dela — o mapa de calor separa os dois.
Faixas fixas por métrica (nunca relativas a um dia extremo): ver docs/superpowers/research/…referencias-ui-life-log.md."""
from __future__ import annotations

import logging
from collections import Counter
from datetime import date, timedelta
from typing import Iterator, Optional

from src.life.common import safe_status
from src.life.fmt import compact, money, plural

logger = logging.getLogger(__name__)

MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December")
METRICS = (  # chave, rótulo, limite inferior dos níveis 1..4, unidade
    ("digital", "Digital", (1, 20, 60, 120), "items"),
    ("spent", "Spent", (1, 5000, 20000, 50000), "cents"),
    ("steps", "Steps", (1, 3000, 7000, 12000), "steps"),
    ("work", "AI sessions", (1, 2, 4, 8), "sessions"),
    ("notes", "Notes", (1, 2, 4, 8), "notes"),
)
KEYS = tuple(m[0] for m in METRICS)


def metrics_meta() -> list[dict]:
    return [{"key": k, "label": label, "bands": list(b), "unit": u} for k, label, b, u in METRICS]


def _span(a: date, b: date) -> Iterator[date]:
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


def _collect(providers, a: date, b: date):
    days: dict = {}
    coverage: dict = {}
    for p in providers:
        st = safe_status(p)
        if st["state"] != "ok":
            continue
        try:
            got = p.counts(a, b)
        except Exception as e:
            logger.warning("life: %s.counts falhou: %s", p.name, e)
            continue
        coverage.update(st.get("coverage") or {})
        for ds, vals in got.items():
            days.setdefault(ds, {}).update(vals)
    return days, coverage


def _values(ds: str, raw: dict, coverage: dict) -> dict:
    out = {}
    for k in KEYS:
        span = coverage.get(k)
        covered = bool(span and span[0] and span[1] and span[0] <= ds <= span[1])
        out[k] = raw.get(k, 0) if covered else raw.get(k)
    return out


def counts_summary(v: dict) -> str:
    parts = []
    if v.get("spent"):
        parts.append(money(v["spent"], "BRL") + " spent")
    if v.get("steps"):
        parts.append(compact(v["steps"]) + " steps")
    if v.get("work"):
        parts.append(plural(v["work"], "AI session"))
    if v.get("notes"):
        parts.append(plural(v["notes"], "note"))
    if v.get("digital"):
        parts.append(f"{v['digital']} digital")
    return " · ".join(parts)


def month_view(y: int, m: int, providers) -> dict:
    first = date(y, m, 1)
    last = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    raw, cov = _collect(providers, first, last)
    days = [{"day": d.isoformat(), "dom": d.day, "weekday": d.isoweekday(),
             "values": _values(d.isoformat(), raw.get(d.isoformat(), {}), cov)} for d in _span(first, last)]
    totals = {}
    for k in KEYS:
        vals = [x["values"][k] for x in days]
        totals[k] = sum(v or 0 for v in vals) if any(v is not None for v in vals) else None
    return {"month": f"{y:04d}-{m:02d}", "label": f"{MONTHS[m - 1]} {y}", "first_weekday": first.isoweekday(),
            "days": days, "totals": totals, "metrics": metrics_meta()}


def year_view(y: int, providers) -> dict:
    first, last = date(y, 1, 1), date(y, 12, 31)
    raw, cov = _collect(providers, first, last)
    days = {d.isoformat(): _values(d.isoformat(), raw.get(d.isoformat(), {}), cov) for d in _span(first, last)}
    months = []
    for m in range(1, 13):
        vals = [v for ds, v in days.items() if ds.startswith(f"{y:04d}-{m:02d}")]
        row = {"month": f"{y:04d}-{m:02d}", "label": MONTHS[m - 1][:3]}
        for k in KEYS:
            row[k] = sum(v[k] or 0 for v in vals) if any(v[k] is not None for v in vals) else None
        months.append(row)
    return {"year": y, "first_weekday": first.isoweekday(), "days": days, "months": months, "metrics": metrics_meta()}


def on_this_day(d: date, providers, max_years: int = 20) -> list[dict]:
    froms = [s["from"] for s in (safe_status(p) for p in providers) if s.get("state") == "ok" and s.get("from")]
    earliest = int(min(froms)[:4]) if froms else d.year
    out = []
    for k in range(1, max_years + 1):
        y = d.year - k
        if y < earliest:
            break
        try:
            t = d.replace(year=y)
        except ValueError:  # 29/02
            t = d.replace(year=y, day=28)
        raw, _ = _collect(providers, t - timedelta(days=3), t + timedelta(days=3))
        for off in (0, -1, 1, -2, 2, -3, 3):
            ds = (t + timedelta(days=off)).isoformat()
            vals = raw.get(ds) or {}
            if any(vals.values()):
                out.append({"day": ds, "years_ago": k, "offset": off, "values": vals, "summary": counts_summary(vals)})
                break
    return out


def nearest_days(d: date, providers, window: int = 120) -> dict:
    raw, _ = _collect(providers, d - timedelta(days=window), d + timedelta(days=window))
    ds = d.isoformat()
    filled = sorted(k for k, v in raw.items() if any(v.values()))
    prev = [k for k in filled if k < ds]
    nxt = [k for k in filled if k > ds]
    return {"prev": prev[-1] if prev else None, "next": nxt[0] if nxt else None}


def search_all(q: str, providers, kinds: Optional[set] = None, frm: Optional[str] = None, to: Optional[str] = None,
               limit: int = 300) -> dict:
    hits: list = []
    capped = False
    for p in providers:
        if safe_status(p)["state"] != "ok":
            continue
        try:
            got = p.search(q, limit + 1, frm, to)  # um a mais: detecta corte mesmo quando a fonte já limita
        except Exception as e:
            logger.warning("life: %s.search falhou: %s", p.name, e)
            continue
        if len(got) > limit:
            capped = True
        hits += got
    if frm:
        hits = [h for h in hits if (h["day"] or "") >= frm]
    if to:
        hits = [h for h in hits if (h["day"] or "") <= to]
    kinds_count = dict(Counter(h["kind"] for h in hits))
    if kinds:
        hits = [h for h in hits if h["kind"] in kinds]
    hits.sort(key=lambda h: (h["day"] or "", h["ts"] or ""), reverse=True)
    truncated = capped or len(hits) > limit
    hits = hits[:limit]
    days: list = []
    for h in hits:
        if not days or days[-1]["day"] != h["day"]:
            days.append({"day": h["day"], "items": []})
        days[-1]["items"].append(h)
    return {"q": q, "total": len(hits), "truncated": truncated, "kinds": kinds_count, "days": days}
