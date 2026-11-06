"""Provedor de Uso de IA para o Life: sessões de IA do dia (banco do ai-usage-export, só leitura)."""
from __future__ import annotations

import os
from datetime import date

from src.life.common import Provider, make_item, parse_ts, ro, status

SOURCE_LABELS = {"claude": "Claude Code", "claude.ai": "Claude.ai", "claude-design": "Claude Design", "codex": "Codex",
                 "chatgpt": "ChatGPT", "copilot": "Copilot", "copilot-cli": "Copilot CLI", "cursor": "Cursor",
                 "cursor-official": "Cursor", "cline": "Cline", "odysseus": "Odysseus"}
SQL = ("select e.day d, e.session_key k, min(e.ts) a, max(e.ts) b, count(*) calls, coalesce(sum(e.total),0) tokens, "
       "coalesce(sum(e.cost_usd),0) cost, max(s.source) source, max(coalesce(nullif(s.ai_title,''), s.title)) title, "
       "max(s.cwd) cwd from events e left join sessions s on s.key = e.session_key "
       "where coalesce(e.superseded,0)=0 and {where} group by e.session_key, e.day")


class WorkProvider(Provider):
    name, label = "work", "AI usage"
    env = "AI_USAGE_DB"
    candidates = ("/app/ai-usage/ai-usage.sqlite", "/data/ai-usage/ai-usage.sqlite")

    def status(self) -> dict:
        p = self.path()
        if not p:
            return status(self.name, self.label, "missing", detail="run ai-usage-export on the PC")
        with ro(p) as con:
            a, b = con.execute("select min(day), max(day) from events").fetchone()
        return status(self.name, self.label, "ok", coverage={"work": [a, b]}, **{"from": a, "to": b})

    @staticmethod
    def _item(r) -> dict:
        project = os.path.basename((r["cwd"] or "").rstrip("/")) or None
        title = (r["title"] or "").strip() or (f"Session in {project}" if project else "AI session")
        src = SOURCE_LABELS.get(r["source"] or "", r["source"] or "AI")
        sub = " · ".join(x for x in (src, project, f"{r['calls']} calls") if x)
        return make_item(id=f"ai:{r['k']}:{r['d']}", kind="work", source="ai-usage", ts=parse_ts(r["a"]),
                         end_ts=parse_ts(r["b"]), title=title, subtitle=sub, day=r["d"], tokens=r["tokens"],
                         cost_usd=round(r["cost"], 4), calls=r["calls"])

    def day(self, d: date) -> list[dict]:
        p = self.path()
        if not p:
            return []
        with ro(p) as con:
            rows = con.execute(SQL.format(where="e.day = ?") + " order by a", (d.isoformat(),)).fetchall()
        return [self._item(r) for r in rows]

    def stats(self, d: date) -> dict:
        items = self.day(d)
        vals = {"ai_sessions": len(items), "ai_tokens": sum(i["meta"]["tokens"] for i in items),
                "ai_cost_usd": round(sum(i["meta"]["cost_usd"] for i in items), 4)}
        return {k: v for k, v in vals.items() if v}

    def counts(self, a: date, b: date) -> dict:
        p = self.path()
        if not p:
            return {}
        with ro(p) as con:
            return {day: {"work": n} for day, n in con.execute(
                "select day, count(distinct session_key) from events where day between ? and ? "
                "and coalesce(superseded,0)=0 group by day", (a.isoformat(), b.isoformat()))}

    def search(self, q: str, limit: int) -> list[dict]:
        p = self.path()
        if not p:
            return []
        like = f"%{q}%"
        with ro(p) as con:
            rows = con.execute(SQL.format(where="(s.title like ? or s.ai_title like ? or s.cwd like ?)")
                               + " order by a desc limit ?", (like, like, like, limit)).fetchall()
        return [self._item(r) for r in rows]
