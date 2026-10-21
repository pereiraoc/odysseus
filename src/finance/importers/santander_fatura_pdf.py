"""Fatura do cartao Santander em PDF (layouts 2019-2021 e 2023+, ambos em duas colunas).

Cartao e passivo: despesa = negativo, pagamento/credito = positivo. Lancamentos de
todos os cartoes da fatura (titular, adicional, virtual) entram numa conta so; o final
do cartao fica em extra. Validacao: Saldo Anterior + itens == Saldo Desta Fatura
(tolerancia de 2 centavos); fora disso entra com warning.
"""
from __future__ import annotations

import re

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.importers.pdf_text import pdf_text_columns
from src.finance.money import parse_brl

NAME = "santander_fatura_pdf"
VERSION = 1
TOLERANCE_CENTS = 2

_AMT = r"-?\d{1,3}(?:\.\d{3})*,\d{2}"
_ITEM = re.compile(rf"^\s*(?:\d{{1,2}}\s+)?(\d\d)/(\d\d)\s+(.+?)\s+({_AMT})(?:\s+(\d{{1,3}}(?:\.\d{{3}})*,\d{{2}}))?(?:\s{{3,}}[A-Z]{{1,2}})?\s*$")
# o recorte da metade esquerda as vezes pega 1-2 letras da coluna direita no fim da linha
_IOF = re.compile(rf"^\s*IOF DESPESA NO EXTERIOR\s+({_AMT})(?:\s+\S{{0,2}})?\s*$")
_CARD = re.compile(r"(?:^|\s)(@?)\s*[A-Z][A-Z .]+?\s(?:-\s5428 XXXX XXXX\s)?(\d{4})\s*$")
_PARCEL = re.compile(r"\s(?:PARC\s+)?(\d{1,2})/(\d{1,2})$")
_SKIP = re.compile(r"Cota[cç][aã]o D[oó]lar|COTA[CÇ][AÃ]O DOLAR|VALOR TOTAL|Saldo deste cart|^\s*\(", re.I)


def matches_text(text: str) -> bool:
    return "Saldo Desta Fatura" in text and "5428 XXXX XXXX" in text


def _summary(text: str, label: str) -> int | None:
    m = re.search(rf"{label}\s+({_AMT})", text)
    return parse_brl(m.group(1)) if m else None


def parse(name: str, data: bytes, text: str | None = None, password: str | None = None) -> ParsedFile:
    text = text if text is not None else pdf_text_columns(data, password)
    due = re.search(r"Vencimento[\s\S]{0,200}?(\d\d)/(\d\d)/(\d{4})", text)
    if not due:
        raise ParseError("fatura Santander sem vencimento")
    due_month, due_year = int(due.group(2)), int(due.group(3))
    previous, total = _summary(text, "Saldo Anterior"), _summary(text, r"\(=\)\s*Saldo Desta Fatura")
    if previous is None or total is None:
        raise ParseError("resumo sem 'Saldo Anterior' ou 'Saldo Desta Fatura'")

    def ymd(dd: str, mm: str) -> str:
        y = due_year if int(mm) <= due_month else due_year - 1
        return f"{y:04d}-{int(mm):02d}-{int(dd):02d}"

    records: list[Record] = []
    card = ""
    in_details = False
    for line in text.splitlines():
        if re.search(r"Detalhamento da Fatura|Hist[oó]rico das Despesas", line):
            in_details = True
        if not in_details:
            continue
        if re.search(r"Saldo Anterior|Juros e Custo Efetivo|IOF e CET|Resumo ?da ?Fatura", line):
            in_details = "Resumo" not in line and "Saldo Anterior" not in line and in_details
            continue
        c = _CARD.search(line)
        if c and not _ITEM.match(line) and "XXXX" not in line[:5]:
            card = c.group(2)
            continue
        iof = _IOF.match(line)
        if iof and records:
            records.append(Record(records[-1].date, -parse_brl(iof.group(1)), f'IOF de "{records[-1].description}"', None,
                                  "IOF", {"card": card}))
            continue
        if _SKIP.search(line):
            continue
        m = _ITEM.match(line)
        if not m:
            continue
        desc = " ".join(m.group(3).split())
        value = parse_brl(m.group(4))
        extra = {"card": card}
        if m.group(5):
            extra["usd"] = m.group(5)
        pm = _PARCEL.search(desc)
        if pm:
            extra.update(installment=int(pm.group(1)), installments=int(pm.group(2)))
            desc = desc[: pm.start()].strip()
        kind = "PAYMENT" if "DEB. AUTOM. DE FATURA" in desc else "CREDIT" if value < 0 else "IOF" if desc.startswith("IOF") else "PURCHASE"
        records.append(Record(ymd(m.group(1), m.group(2)), -value, desc, None, kind, extra))

    warnings = []
    diff = -total - (-previous + sum(r.amount_cents for r in records))
    if abs(diff) > TOLERANCE_CENTS:
        warnings.append(f"fatura nao fecha: anterior {previous} + itens != total {total} (diferenca {diff} centavos)")
    end = f"{due_year:04d}-{due_month:02d}-{int(due.group(1)):02d}"
    dates = sorted(r.date for r in records) or [end]
    return ParsedFile(
        importer=NAME, parse_version=VERSION,
        account=AccountRef("santander", "credit_card", "principal", "BRL", "Santander cartao"),
        records=records,
        checkpoints=[Checkpoint(dates[0], -previous, "opening", f"Saldo Anterior (venc. {end})"),
                     Checkpoint(end, -total, "closing", f"Saldo Desta Fatura (venc. {end})")],
        period_start=dates[0], period_end=end, warnings=warnings,
    )
