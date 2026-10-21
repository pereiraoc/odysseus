"""Cotacoes historicas para somar moedas em reais (custo zero).

Fonte: taxas de referencia do Banco Central Europeu via frankfurter.dev (gratis, sem chave, desde 1999,
dias uteis). Cobre BRL e todas as moedas do Wise (ILS, HUF, CZK, PLN, RON, CHF, GBP, USD, AUD).
Moeda X -> BRL = (BRL por EUR) / (X por EUR), cotacao do proprio dia ou do ultimo dia util anterior.
Cada resposta da API e guardada em raw/ (fonte 'fx/...'); a tabela fx_rates e derivada dela.
"""
from __future__ import annotations

import json
from bisect import bisect_right
from datetime import date, timedelta
from decimal import Decimal

import httpx

from src.finance.store import Store, now

API = "https://api.frankfurter.dev/v1"
SOURCE = "BCE (frankfurter.dev)"


def _ensure_table(store: Store) -> None:
    store.db.execute("CREATE TABLE IF NOT EXISTS fx_rates (date TEXT NOT NULL, currency TEXT NOT NULL, brl TEXT NOT NULL,"
                     " source TEXT NOT NULL, PRIMARY KEY (date, currency))")


def currencies_in_use(store: Store) -> list[str]:
    return sorted({r[0] for r in store.db.execute("SELECT DISTINCT currency FROM accounts") if r[0] != "BRL"})


def update(store: Store, start: str | None = None, end: str | None = None) -> dict:
    """Baixa o que falta (do ultimo dia guardado ate hoje). Idempotente; falha de rede nao derruba nada."""
    _ensure_table(store)
    curs = currencies_in_use(store)
    if not curs:
        return {"currencies": [], "fetched": 0}
    first_tx = store.db.execute("SELECT min(date) FROM transactions").fetchone()[0] or date.today().isoformat()
    last = store.db.execute("SELECT max(date) FROM fx_rates").fetchone()[0]
    start = start or (last if last else (date.fromisoformat(first_tx) - timedelta(days=10)).isoformat())
    end = end or date.today().isoformat()
    want = sorted(set(curs) | {"BRL"} - {"EUR"})
    fetched = 0
    y0, y1 = int(start[:4]), int(end[:4])
    with httpx.Client(timeout=60) as client:
        for y in range(y0, y1 + 1):  # um pedido por ano (respostas pequenas, faceis de guardar)
            a, b = max(start, f"{y}-01-01"), min(end, f"{y}-12-31")
            r = client.get(f"{API}/{a}..{b}", params={"from": "EUR", "to": ",".join(c for c in want if c != "EUR")})
            r.raise_for_status()
            body = r.json()
            store.put_blob(f"fx/ecb-{a}_{b}.json", json.dumps(body, sort_keys=True).encode())
            for day, rates in body.get("rates", {}).items():
                brl = Decimal(str(rates["BRL"]))
                store.db.execute("INSERT OR REPLACE INTO fx_rates VALUES (?,?,?,?)", (day, "EUR", str(brl), SOURCE))
                for cur, v in rates.items():
                    if cur != "BRL":
                        store.db.execute("INSERT OR REPLACE INTO fx_rates VALUES (?,?,?,?)",
                                         (day, cur, str(brl / Decimal(str(v))), SOURCE))
                fetched += 1
    store.db.commit()
    return {"currencies": curs, "fetched": fetched, "from": start, "to": end, "at": now()}


class Converter:
    """converter.to_brl(centavos, moeda, data) com a cotacao do dia (ou ultimo dia util anterior)."""

    def __init__(self, store: Store):
        _ensure_table(store)
        self.series: dict[str, tuple[list[str], list[Decimal]]] = {}
        rows = store.db.execute("SELECT currency, date, brl FROM fx_rates ORDER BY currency, date").fetchall()
        for r in rows:
            d, v = self.series.setdefault(r["currency"], ([], []))
            d.append(r["date"])
            v.append(Decimal(r["brl"]))
        self.missing: set[str] = set()

    def rate(self, currency: str, day: str) -> Decimal | None:
        if currency == "BRL":
            return Decimal(1)
        s = self.series.get(currency)
        if not s:
            self.missing.add(currency)
            return None
        i = bisect_right(s[0], day)
        if i == 0:
            return s[1][0] if s[0] and (date.fromisoformat(s[0][0]) - date.fromisoformat(day)).days <= 7 else None
        return s[1][i - 1]

    def to_brl(self, cents: int, currency: str, day: str) -> int | None:
        r = self.rate(currency, day)
        return None if r is None else int((Decimal(cents) * r).to_integral_value())
