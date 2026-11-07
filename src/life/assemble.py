"""Monta a página do dia do Life no servidor; a UI só desenha.

Fase 1 (sem lugares): a espinha são os blocos do dia (Night 0–6, Morning 6–12, Afternoon 12–18, Evening 18–24),
só os que têm itens. Itens sem hora (finanças) vão para a faixa "All day". Corridas de itens digitais viram um
grupo "Digital · 6 searches, 2 videos (3 views)" — a corrida quebra num item não digital ou numa lacuna > 60 min."""
from __future__ import annotations

from collections import Counter
from datetime import date

from src.life.clean import GROUP_LABELS, GROUP_ORDER, count_phrase
from src.life.common import safe_status
from src.life.fmt import compact, money, plural

PERIODS = (("night", "Night", 0, 6), ("morning", "Morning", 6, 12), ("afternoon", "Afternoon", 12, 18),
           ("evening", "Evening", 18, 24))
RUN_GAP_MIN = 60


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def digital_group(items: list[dict]) -> dict:
    by_group: dict = {}
    for it in items:
        m = it["meta"]
        rows = by_group.setdefault(m["group"], {})
        row = rows.get(m["key"])
        if row:
            row["times"].append(it["time"])
            row["count"] += 1
            row["ids"].append(it["id"])
        else:
            rows[m["key"]] = {"id": it["id"], "title": it["title"], "subtitle": it["subtitle"], "url": it["url"],
                              "open_url": it["open_url"], "action": m["action"], "unavailable": m["unavailable"],
                              "times": [it["time"]], "count": 1, "ids": [it["id"]]}
    sources, parts = [], []
    for g in GROUP_ORDER:
        if g not in by_group:
            continue
        rows = sorted(by_group[g].values(), key=lambda r: (r["unavailable"], r["times"][0]))
        n, views = len(rows), sum(r["count"] for r in rows)
        parts.append(count_phrase(g, n) + (f" ({views} views)" if g == "video" and views != n else ""))
        sources.append({"group": g, "label": GROUP_LABELS[g][2], "count": n, "views": views,
                        "unavailable": sum(1 for r in rows if r["unavailable"]), "items": rows})
    return {"kind": "digital_group", "id": "dg:" + items[0]["id"], "time": items[0]["time"],
            "end_time": items[-1]["time"], "total": sum(s["count"] for s in sources), "summary": ", ".join(parts),
            "unavailable": sum(s["unavailable"] for s in sources), "sources": sources}


def entries_for(items: list[dict]) -> list[dict]:
    out: list = []
    run: list = []
    for it in items:
        if it["kind"] == "digital":
            if run and _minutes(it["time"]) - _minutes(run[-1]["time"]) > RUN_GAP_MIN:
                out.append(digital_group(run))
                run = []
            run.append(it)
        else:
            if run:
                out.append(digital_group(run))
                run = []
            out.append(it)
    if run:
        out.append(digital_group(run))
    return out


def summary(counts: Counter, stats: dict) -> dict:
    parts = []
    if stats.get("spent"):
        parts.append({"kind": "money", "text": " + ".join(money(c, cur) for cur, c in stats["spent"].items()) + " spent"})
    if stats.get("steps"):
        parts.append({"kind": "health", "text": f"{compact(stats['steps'])} steps"})
    if counts.get("work"):
        parts.append({"kind": "work", "text": plural(counts["work"], "AI session")})
    if counts.get("note"):
        parts.append({"kind": "note", "text": plural(counts["note"], "note")})
    if counts.get("digital"):
        parts.append({"kind": "digital", "text": f"{counts['digital']} digital"})
    return {"text": " · ".join(p["text"] for p in parts), "parts": parts}


def stat_rows(stats: dict, counts: Counter) -> list[dict]:
    rows: list = []

    def add(key, label, value):
        if value:
            rows.append({"key": key, "label": label, "value": value})

    add("steps", "Steps", f"{stats['steps']:,}" if stats.get("steps") else None)
    add("distance", "Distance", f"{stats['distance_km']:.1f} km" if stats.get("distance_km") else None)
    add("move", "Active", f"{stats['move_minutes']} min" if stats.get("move_minutes") else None)
    for cur, c in (stats.get("spent") or {}).items():
        add("spent", "Spent", money(c, cur))
    for cur, c in (stats.get("income") or {}).items():
        add("income", "Received", money(c, cur))
    add("ai", "AI sessions", str(stats["ai_sessions"]) if stats.get("ai_sessions") else None)
    add("tokens", "AI tokens", compact(stats["ai_tokens"]) if stats.get("ai_tokens") else None)
    add("digital", "Digital items", str(counts["digital"]) if counts.get("digital") else None)
    return rows


def assemble_day(d: date, providers) -> dict:
    items: list = []
    stats: dict = {}
    sources: list = []
    for p in providers:
        st = safe_status(p)
        if st["state"] == "ok":
            try:
                items += p.day(d)
                stats.update(p.stats(d))
            except Exception as e:  # uma fonte quebrada não derruba o dia
                st = {**st, "state": "error", "detail": str(e)[:200]}
        sources.append(st)
    items = [i for i in items if not i["meta"].get("noise")]
    all_day = [i for i in items if not i["time"]]
    timed = sorted((i for i in items if i["time"]), key=lambda i: i["ts"])
    blocks = []
    for key, label, h0, h1 in PERIODS:
        its = [i for i in timed if h0 * 60 <= _minutes(i["time"]) < h1 * 60]
        if its:
            blocks.append({"kind": "period", "key": key, "label": label, "start": f"{h0:02d}:00",
                           "end": f"{h1:02d}:00", "entries": entries_for(its)})
    counts = Counter(i["kind"] for i in items)
    return {"day": d.isoformat(), "weekday": d.strftime("%A"), "summary": summary(counts, stats), "all_day": all_day,
            "blocks": blocks, "counts_by_kind": dict(counts), "stats": stat_rows(stats, counts), "trip": None,
            "sources": sources}
