"""Extrato CSV do Wise (um arquivo por moeda: statement_<balanceId>_<MOEDA>_<de>_<ate>.csv).

Linhas vem da mais nova para a mais antiga; 'Running Balance' e o saldo apos a linha,
entao a primeira linha de cada dia no arquivo da o saldo de fechamento daquele dia.
"""
from __future__ import annotations

import csv
import io
import re

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.money import parse_decimal

NAME = "wise_csv"
VERSION = 2

_FNAME = re.compile(r"statement_(\d+)_([A-Z]{3})_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})", re.I)


def sniff(name: str, head: bytes) -> bool:
    return head.lstrip(b"\xef\xbb\xbf").startswith(b'"TransferWise ID"')


def _date(v: str) -> str:
    d, m, y = v.strip().split("-")
    return f"{y}-{m}-{d}"


def parse(name: str, data: bytes) -> ParsedFile:
    m = _FNAME.search(name)
    if not m:
        raise ParseError(f"nome de extrato Wise inesperado: {name!r} (preciso do balanceId e da moeda)")
    balance_id, currency, start, end = m.groups()
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    records: list[Record] = []
    checkpoints: list[Checkpoint] = []
    seen_ids: dict[str, int] = {}
    seen_dates: set[str] = set()
    for row in rows:
        if row["Currency"] != currency:
            raise ParseError(f"linha em {row['Currency']} num extrato {currency}")
        date = _date(row["Date"])
        # o mesmo ID volta com valor oposto (cobranca em um ano, estorno no outro): id+valor e a identidade
        tid = row["TransferWise ID"].strip()
        amount = parse_decimal(row["Amount"])
        ident = f"{tid}:{amount}"
        n = seen_ids.get(ident, 0)
        seen_ids[ident] = n + 1
        extra = {k: row[k] for k in ("Payment Reference", "Exchange From", "Exchange To", "Exchange Rate", "Payer Name",
                                     "Payee Name", "Merchant", "Card Last Four Digits", "Total fees", "Exchange To Amount", "Note")
                 if row.get(k)}
        records.append(Record(
            date=date,
            amount_cents=amount,
            description=row["Description"].strip(),
            native_id=ident if n == 0 else f"{ident}#{n}",
            kind=tid.split("-", 1)[0],
            extra=extra,
        ))
        if date not in seen_dates and row.get("Running Balance", "").strip():
            seen_dates.add(date)
            checkpoints.append(Checkpoint(date, parse_decimal(row["Running Balance"]), "closing", "Wise Running Balance"))
    return ParsedFile(
        importer=NAME, parse_version=VERSION,
        account=AccountRef("wise", "wallet", balance_id, currency, f"Wise {currency}"),
        records=records, checkpoints=checkpoints, period_start=start, period_end=end,
    )
