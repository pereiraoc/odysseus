"""Formatação dos textos do Life (UI em inglês)."""
from __future__ import annotations

SYMBOLS = {"BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£"}


def money(cents: int, currency: str) -> str:
    v = abs(cents) / 100
    sym = SYMBOLS.get(currency, currency)
    return f"{sym} {v:,.0f}" if v >= 100 else f"{sym} {v:,.2f}"


def compact(n) -> str:
    n = float(n)
    for div, suf in ((1e6, "M"), (1e3, "k")):
        if abs(n) >= div:
            return f"{n / div:.1f}".rstrip("0").rstrip(".") + suf
    return f"{n:.0f}"


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"
