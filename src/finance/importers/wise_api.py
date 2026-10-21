"""Blobs JSON gravados por src/finance/wise_api.py (respostas da API do Wise)."""
from __future__ import annotations

import json

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.money import parse_decimal

NAME = "wise_api"
VERSION = 1


def sniff(name: str, head: bytes) -> bool:
    return head.lstrip().startswith(b"{") and b'"_source": "wise_api"' in head


def _cents(v) -> int:
    return parse_decimal(f"{v:.2f}" if isinstance(v, float) else str(v))


def parse_multi(name: str, data: bytes) -> list[ParsedFile]:
    doc = json.loads(data)
    kind, payload = doc["kind"], doc["data"]
    day = doc["fetched_at"][:10]
    if kind == "balances":
        out = []
        for b in payload:
            acc = AccountRef("wise", "wallet", str(b["id"]), b["currency"], f"Wise {b['currency']}")
            amount = b.get("amount", {}).get("value", 0)
            out.append(ParsedFile(NAME, VERSION, acc, [], [Checkpoint(day, _cents(amount), "closing", "Wise API saldo atual")],
                                  period_start=day, period_end=day))
        return out
    if kind == "statement":
        acc = AccountRef("wise", "wallet", str(doc["balance_id"]), doc["currency"], f"Wise {doc['currency']}")
        records = []
        for t in payload.get("transactions", []):
            cents = _cents(t["amount"]["value"])
            ref = t.get("referenceNumber") or ""
            records.append(Record(t["date"][:10], cents, (t.get("details") or {}).get("description", ""),
                                  f"{ref}:{cents}" if ref else None, (t.get("details") or {}).get("type", ""), {}))
        cps = []
        end = (payload.get("endOfStatementBalance") or {}).get("value")
        query = payload.get("query") or {}
        if end is not None and query.get("intervalEnd"):
            cps.append(Checkpoint(query["intervalEnd"][:10], _cents(end), "closing", "Wise API fim do statement"))
        return [ParsedFile(NAME, VERSION, acc, records, cps)]
    if kind == "activities":
        raise ParseError("activities guardado bruto; parser so depois de ver a forma real da resposta")
    raise ParseError(f"tipo de blob wise_api desconhecido: {kind!r}")
