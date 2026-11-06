"""Provedor de Finanças para o Life: lê data/finance/finance.sqlite SÓ LEITURA (nunca pelo Store()).

As linhas vêm da view `tx_lines` (uma por transação × categoria, respeitando divisões). Categorias neutras
(transferência interna, câmbio, investimento, ajustes… — src/finance/analytics.py) aparecem no dia, mas não somam
como gasto nem renda. Finanças só têm data: os itens vão para a faixa "All day"."""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Optional

from src.finance.analytics import NEUTRAL_PREFIXES
from src.life.common import Provider, find_db, make_item, ro, status

SQL = ("select l.id, l.date, l.amount_cents, l.description, l.category, a.currency, a.institution, a.name acc "
       "from tx_lines l join accounts a on a.key = l.account_key ")


def _cat_label(cat: str) -> str:
    last = (cat or "").split(":")[-1].replace("-", " ").replace("_", " ").strip()
    return last[:1].upper() + last[1:] if last else ""


def _neutral(cat: Optional[str]) -> bool:
    return any((cat or "").startswith(p) for p in NEUTRAL_PREFIXES)


class MoneyProvider(Provider):
    name, label = "money", "Finances"
    env = "LIFE_FINANCE_DB"
    candidates = ("/app/data/finance/finance.sqlite", "data/finance/finance.sqlite")

    def path(self) -> Optional[Path]:
        root = os.environ.get("FINANCE_DATA_DIR", "")
        return find_db(self.env, ([f"{root}/finance.sqlite"] if root else []) + list(self.candidates))

    def status(self) -> dict:
        p = self.path()
        if not p:
            return status(self.name, self.label, "missing", detail="no finance archive yet")
        with ro(p) as con:
            a, b = con.execute("select min(date), max(date) from transactions").fetchone()
        return status(self.name, self.label, "ok", coverage={"spent": [a, b]}, **{"from": a, "to": b})

    def _item(self, r) -> dict:
        cat = r["category"] or ""
        return make_item(id=f"tx:{r['id']}:{cat}", kind="money", source="finance", title=r["description"].strip(),
                         subtitle=" · ".join(x for x in (_cat_label(cat), r["acc"] or r["institution"]) if x) or None,
                         day=r["date"], amount_cents=r["amount_cents"], currency=r["currency"], category=cat or None,
                         neutral=_neutral(cat))

    def day(self, d: date) -> list[dict]:
        p = self.path()
        if not p:
            return []
        with ro(p) as con:
            return [self._item(r) for r in con.execute(SQL + "where l.date=? order by l.amount_cents", (d.isoformat(),))]

    def stats(self, d: date) -> dict:
        spent: dict = {}
        income: dict = {}
        for it in self.day(d):
            m = it["meta"]
            if m["neutral"] or not m["amount_cents"]:
                continue
            bucket = spent if m["amount_cents"] < 0 else income
            bucket[m["currency"]] = bucket.get(m["currency"], 0) + abs(m["amount_cents"])
        return {k: v for k, v in (("spent", spent), ("income", income)) if v}

    def counts(self, a: date, b: date) -> dict:
        p = self.path()
        if not p:
            return {}
        out: dict = {}
        with ro(p) as con:
            for r in con.execute(SQL + "where l.date between ? and ? and a.currency='BRL' and l.amount_cents < 0",
                                 (a.isoformat(), b.isoformat())):
                if _neutral(r["category"]):
                    continue
                day = out.setdefault(r["date"], {"spent": 0})
                day["spent"] += -r["amount_cents"]
        return out

    def search(self, q: str, limit: int) -> list[dict]:
        p = self.path()
        if not p:
            return []
        with ro(p) as con:
            return [self._item(r) for r in con.execute(SQL + "where l.description like ? order by l.date desc limit ?",
                                                        (f"%{q}%", limit))]
