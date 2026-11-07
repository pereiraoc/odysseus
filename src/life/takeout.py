"""Provedor do Google Takeout para o Life: lê o lifelog.sqlite do nas-lifelog-export (só leitura).

Atividade digital (Minha atividade) vira `digital` com título limpo (src/life/clean.py); treinos do Fit viram `health`;
notas do Keep criadas/editadas no dia viram `note`. O Fit diário alimenta os números do dia."""
from __future__ import annotations

from datetime import date
from typing import Optional
from urllib.parse import quote_plus

from src.life.clean import NOISE_SOURCES, clean_event
from src.life.common import Provider, local_day, make_item, parse_ts, ro, status

GOOGLE_SEARCH = "https://www.google.com/search?q="
CONTEXT_HITS = 100  # acertos da busca que ganham vizinhos de contexto


def event_item(r, day: str) -> dict:
    c = clean_event(r["source"], r["title"], r["url"], r["detail"])
    open_url = r["url"]
    if not open_url and r["source"] == "search" and c["action"] == "searched":
        open_url = GOOGLE_SEARCH + quote_plus(c["title"])
    return make_item(id=f"tk:{r['id']}", kind="digital", source=r["source"], ts=parse_ts(r["ts"]), title=c["title"],
                     subtitle=c["subtitle"], url=r["url"], open_url=open_url, day=day, group=c["group"],
                     action=c["action"], unavailable=c["unavailable"], noise=c["noise"], key=c["key"])


def _note_title(r) -> str:
    t = (r["title"] or "").strip()
    if t:
        return t
    first = next((ln.strip() for ln in (r["text"] or "").splitlines() if ln.strip()), "")
    return first[:80] or "Untitled note"


class TakeoutProvider(Provider):
    name, label = "takeout", "Google Takeout"
    env = "LIFELOG_DB"
    candidates = ("/app/lifelog/lifelog.sqlite", "/data/lifelog/lifelog.sqlite")

    def status(self) -> dict:
        p = self.path()
        if not p:
            return status(self.name, self.label, "missing",
                          detail="run nas-lifelog-export on the NAS and lifelog-sync on the PC")
        with ro(p) as con:
            a, b = con.execute("select min(day), max(day) from events").fetchone()
            fa, fb = con.execute("select min(day), max(day) from fit_daily").fetchone()
            na, nb = con.execute("select min(substr(coalesce(edited, created),1,10)), "
                                 "max(substr(coalesce(edited, created),1,10)) from notes where trashed=0").fetchone()
            built = dict(con.execute("select key, value from meta").fetchall()).get("built_at")
        return status(self.name, self.label, "ok", built_at=built,
                      coverage={"digital": [a, b], "steps": [fa, fb], "notes": [na, nb]}, **{"from": a, "to": b})

    def day(self, d: date) -> list[dict]:
        p = self.path()
        if not p:
            return []
        ds, out = d.isoformat(), []
        with ro(p) as con:
            out += [event_item(r, ds) for r in con.execute(
                "select id, ts, source, title, url, detail from events where day=? order by ts", (ds,))]
            for r in con.execute("select start, end, activity, distance_m, duration_s from fit_sessions "
                                 "where substr(start,1,10) between date(?,'-1 day') and date(?,'+1 day') order by start",
                                 (ds, ds)):
                st = parse_ts(r["start"])
                if not st or local_day(st) != ds:
                    continue
                mins, km = round((r["duration_s"] or 0) / 60), (r["distance_m"] or 0) / 1000
                sub = " · ".join(x for x in (f"{mins} min" if mins else "", f"{km:.1f} km" if km >= 0.05 else "") if x)
                out.append(make_item(id=f"fit:{r['start']}:{r['activity']}", kind="health", source="fit", ts=st,
                                     end_ts=parse_ts(r["end"]),
                                     title=(r["activity"] or "workout").replace("_", " ").capitalize(),
                                     subtitle=sub or None, day=ds))
            for r in con.execute("select id, title, text, created, edited from notes where trashed=0 and ("
                                 "substr(created,1,10) between date(?,'-1 day') and date(?,'+1 day') or "
                                 "substr(edited,1,10) between date(?,'-1 day') and date(?,'+1 day'))", (ds,) * 4):
                cr, ed = parse_ts(r["created"]), parse_ts(r["edited"])
                if cr and local_day(cr) == ds:
                    when, verb = cr, "created"
                elif ed and local_day(ed) == ds:
                    when, verb = ed, "edited"
                else:
                    continue
                out.append(make_item(id=f"keep:{r['id']}", kind="note", source="keep", ts=when, title=_note_title(r),
                                     subtitle=f"Keep · {verb}", day=ds))
        return out

    def stats(self, d: date) -> dict:
        p = self.path()
        if not p:
            return {}
        with ro(p) as con:
            r = con.execute("select steps, distance_m, move_minutes, calories from fit_daily where day=?",
                            (d.isoformat(),)).fetchone()
        if not r:
            return {}
        vals = {"steps": r["steps"], "distance_km": round((r["distance_m"] or 0) / 1000, 1),
                "move_minutes": r["move_minutes"], "calories": round(r["calories"]) if r["calories"] else None}
        return {k: v for k, v in vals.items() if v}

    def counts(self, a: date, b: date) -> dict:
        p = self.path()
        if not p:
            return {}
        out: dict = {}
        noise = tuple(sorted(NOISE_SOURCES))
        span = (a.isoformat(), b.isoformat())
        with ro(p) as con:
            for day, n in con.execute(f"select day, count(*) from events where day between ? and ? and source not in "
                                      f"({','.join('?' * len(noise))}) group by day", (*span, *noise)):
                out.setdefault(day, {})["digital"] = n
            for day, steps in con.execute("select day, steps from fit_daily where day between ? and ? and steps > 0", span):
                out.setdefault(day, {})["steps"] = steps
            # mesma regra do day(): a nota conta no dia local da criação e no dia local da edição (uma vez por dia)
            for r in con.execute("select created, edited from notes where trashed=0 and ("
                                 "substr(created,1,10) between date(?,'-1 day') and date(?,'+1 day') or "
                                 "substr(edited,1,10) between date(?,'-1 day') and date(?,'+1 day'))", (*span,) * 2):
                days = {local_day(x) for x in (parse_ts(r["created"]), parse_ts(r["edited"])) if x}
                for day in days:
                    if span[0] <= day <= span[1]:
                        out.setdefault(day, {})["notes"] = out.get(day, {}).get("notes", 0) + 1
        return out

    def search(self, q: str, limit: int, frm: Optional[str] = None, to: Optional[str] = None) -> list[dict]:
        p = self.path()
        if not p:
            return []
        like, out = f"%{q}%", []
        with ro(p) as con:
            rows = con.execute("select id, ts, day, source, title, url, detail from events "
                               "where (title like ? or detail like ?) and day between coalesce(?, '0000-01-01') "
                               "and coalesce(?, '9999-12-31') order by ts desc limit ?",
                               (like, like, frm, to, limit)).fetchall()
            for i, r in enumerate(rows):
                it = event_item(r, r["day"])
                if i < CONTEXT_HITS:
                    it["meta"]["context"] = self._context(con, r)
                out.append(it)
            for r in con.execute("select id, title, text, created, edited from notes where trashed=0 and "
                                 "(title like ? or text like ?) and substr(coalesce(edited, created), 1, 10) between "
                                 "coalesce(?, '0000-01-01') and coalesce(?, '9999-12-31') "
                                 "order by coalesce(edited, created) desc limit ?",
                                 (like, like, frm, to, limit)):
                out.append(make_item(id=f"keep:{r['id']}", kind="note", source="keep",
                                     ts=parse_ts(r["edited"]) or parse_ts(r["created"]), title=_note_title(r),
                                     subtitle="Keep"))
        return out

    @staticmethod
    def _context(con, r) -> list[dict]:
        out = []
        noise = tuple(sorted(NOISE_SOURCES))  # telemetria fica fora do dia e também do contexto da busca
        for rel, op, order in (("before", "<", "desc"), ("after", ">", "asc")):
            n = con.execute(f"select id, ts, source, title, url, detail from events where day=? and ts {op} ? "
                            f"and source not in ({','.join('?' * len(noise))}) "
                            f"order by ts {order} limit 1", (r["day"], r["ts"], *noise)).fetchone()
            if n:
                it = event_item(n, r["day"])
                out.append({"rel": rel, "time": it["time"], "title": it["title"], "group": it["meta"]["group"]})
        return out
