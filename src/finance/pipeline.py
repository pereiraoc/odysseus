"""Tudo que vem depois de entrar dado novo, sempre na mesma ordem."""
from __future__ import annotations

from src.finance import dedup, rules
from src.finance.ledger import export
from src.finance.store import Store


def refresh(store: Store, commit_ledger: bool = True) -> dict:
    out = {"rebuild": dedup.rebuild(store)}
    out["categories"] = rules.categorize(store)
    out["transfers"] = rules.pair_transfers(store)
    out["ledger"] = export(store, commit=commit_ledger)
    return out
