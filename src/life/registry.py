"""Fontes ativas do Life, na ordem em que aparecem no rodapé "Sources". Novas fases acrescentam aqui."""
from __future__ import annotations

from src.life.money import MoneyProvider
from src.life.takeout import TakeoutProvider
from src.life.work import WorkProvider


def providers() -> list:
    return [TakeoutProvider(), MoneyProvider(), WorkProvider()]
