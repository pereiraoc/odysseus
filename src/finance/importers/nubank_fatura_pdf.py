"""Fatura do cartao Nubank em PDF (2019+).

Cartao e conta de passivo: compra = negativo, pagamento/estorno/credito = positivo.
Checkpoints: saldo do cartao = -(Fatura anterior) na abertura e -(Total a pagar) no
fechamento. Validacao: Fatura anterior + itens == Total a pagar (tolerancia de 2
centavos, arredondamento do proprio Nubank). Fora disso entra com warning.
"""
from __future__ import annotations

import re

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.importers.pdf_text import pdf_text
from src.finance.money import parse_brl

NAME = "nubank_fatura_pdf"
VERSION = 1
TOLERANCE_CENTS = 2

_MON = {"JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6, "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12}
_AMT = r"\d{1,3}(?:\.\d{3})*,\d{2}"
_FATURA = re.compile(r"FATURA (\d\d) ([A-Z]{3}) (\d{4})")
_PERIOD = re.compile(r"TRANSAÇÕES\s+DE (\d\d) ([A-Z]{3}) A (\d\d) ([A-Z]{3})")
_ITEM = re.compile(rf"^\s+(\d\d) ([A-Z]{{3}})\s{{2,}}(.+?)\s{{2,}}({_AMT})\s*$")
_CREDIT = re.compile(r"^(Pagamento|Crédito de|Estorno|Desconto)")
_INSTALLMENT = re.compile(r"\s-\s(\d{1,2})/(\d{1,2})$")


def matches_text(text: str) -> bool:
    return "Nu Pagamentos" in text and "RESUMO DA FATURA ATUAL" in text


def _summary(text: str, label: str) -> int | None:
    block = text[text.find("RESUMO DA FATURA ATUAL"):]
    block = block[: block.find("\n", block.find("Total a pagar"))]
    m = re.search(rf"{label}.*?\s({_AMT})\s*$", block, re.M)
    return parse_brl(m.group(1)) if m else None


def parse(name: str, data: bytes, text: str | None = None) -> ParsedFile:
    text = text if text is not None else pdf_text(data)
    f = _FATURA.search(text)
    p = _PERIOD.search(text)
    if not f or not p:
        raise ParseError("fatura Nubank sem cabecalho FATURA/TRANSAÇÕES")
    due_year, due_month = int(f.group(3)), _MON[f.group(2)]
    end_month = _MON[p.group(4)]
    end_year = due_year if end_month <= due_month else due_year - 1

    def ymd(dd: str, mon: str) -> str:
        mth = _MON[mon]
        y = end_year if mth <= end_month else end_year - 1
        return f"{y:04d}-{mth:02d}-{int(dd):02d}"

    previous = _summary(text, "Fatura anterior")
    total = _summary(text, "Total a pagar")
    if previous is None or total is None:
        raise ParseError("resumo da fatura sem 'Fatura anterior' ou 'Total a pagar'")

    records: list[Record] = []
    section = text[text.find("TRANSAÇÕES"):]
    for line in section.splitlines():
        m = _ITEM.match(line)
        if m:
            desc = " ".join(m.group(3).split())
            value = parse_brl(m.group(4))
            credit = bool(_CREDIT.match(desc))
            extra = {}
            inst = _INSTALLMENT.search(desc)
            if inst:
                extra = {"installment": int(inst.group(1)), "installments": int(inst.group(2))}
            kind = "PAYMENT" if desc.startswith("Pagamento") else "CREDIT" if credit else "IOF" if desc.startswith("IOF") else "PURCHASE"
            records.append(Record(ymd(m.group(1), m.group(2)), value if credit else -value, desc, None, kind, extra))
        elif records and re.match(r"^\s{20,}(BRL|USD|EUR|GBP|Conversão)", line):
            records[-1].extra.setdefault("fx", []).append(" ".join(line.split()))

    warnings = []
    diff = -total - (-previous + sum(r.amount_cents for r in records))
    if abs(diff) > TOLERANCE_CENTS:
        warnings.append(f"fatura nao fecha: anterior {previous} + itens != total {total} (diferenca {diff} centavos)")
    start = ymd(p.group(1), p.group(2))
    end = ymd(p.group(3), p.group(4))
    return ParsedFile(
        importer=NAME, parse_version=VERSION,
        account=AccountRef("nubank", "credit_card", "principal", "BRL", "Nubank cartao"),
        records=records,
        checkpoints=[Checkpoint(start, -previous, "opening", f"Fatura anterior ({f.group(0)})"),
                     Checkpoint(end, -total, "closing", f"Total a pagar ({f.group(0)})")],
        period_start=start, period_end=end, warnings=warnings,
    )
