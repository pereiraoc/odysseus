"""Extrato mensal em PDF da conta corrente Santander ("Extrato_PF_Inteligente", 2017+).

Le a secao "Movimentacao": do 'SALDO EM dd/mm' de abertura ao de fechamento.
Validacao embutida: abertura + soma dos movimentos == fechamento, e cada saldo
parcial impresso na coluna 'Saldo (R$)' tem que bater com o acumulado. Se nao
bater, o arquivo e rejeitado (ParseError) em vez de entrar dado errado.
"""
from __future__ import annotations

import re

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.importers.pdf_text import pdf_text
from src.finance.money import parse_brl

NAME = "santander_cc_pdf"
VERSION = 1

_MONTH_NUM = {"janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
              "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

_AMT = r"\d{1,3}(?:\.\d{3})*,\d{2}-?"
_RESUMO = re.compile(r"Resumo\s+-\s+([a-zçA-ZÇ]+)/(\d{4})")
_CONTA = re.compile(r"Ag[eê]ncia\s+Conta Corrente\s*\n\s*(\d{3,5})\s+([\d.\-]+)")
_SALDO_EM = re.compile(rf"^\s+SALDO EM (\d\d)/(\d\d)\s+({_AMT})\s*$")
_TX = re.compile(rf"^(?P<pre>.*?\S)\s+(?P<doc>\d{{1,10}}|-)\s+(?P<mov>{_AMT})(?:\s+(?P<bal>{_AMT}))?\s*$")
_HEADER = re.compile(r"^\s*Data\s+Descri[cç][aã]o")
_NOISE = re.compile(r"^(Extrato_PF|BALP_|\s*Pagina:|\s*P[aá]gina:|\s*EXTRATO CONSOLIDADO|\s*\d+/\d+\s*$)")


def sniff(name: str, head: bytes) -> bool:
    return False  # PDF: decidido pelo conteudo em detect() (precisa do texto)


def matches_text(text: str) -> bool:
    return "Extrato_PF" in text and "Movimenta" in text and bool(_RESUMO.search(text))


def parse(name: str, data: bytes, text: str | None = None) -> ParsedFile:
    text = text if text is not None else pdf_text(data)
    m = _RESUMO.search(text)
    if not m:
        raise ParseError("extrato Santander sem 'Resumo - mes/ano'")
    month = _MONTH_NUM.get(m.group(1).lower())
    year = int(m.group(2))
    if not month:
        raise ParseError(f"mes desconhecido no resumo: {m.group(1)!r}")
    c = _CONTA.search(text)
    if not c:
        raise ParseError("extrato Santander sem agencia/conta")
    account = AccountRef("santander", "checking", c.group(2), "BRL", f"Santander {c.group(1)} {c.group(2)}")

    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == "Movimentação")
    except StopIteration as exc:
        raise ParseError("secao 'Movimentação' nao encontrada") from exc

    def ymd(dd: str, mm: str) -> str:
        y = year - 1 if int(mm) == 12 and month == 1 else year
        return f"{y:04d}-{int(mm):02d}-{int(dd):02d}"

    opening = closing = None
    opening_date = closing_date = None
    records: list[Record] = []
    cur_date = None
    desc_col = 18
    running = None
    for raw in lines[start + 1:]:
        line = raw.rstrip()
        if not line.strip() or _NOISE.match(line):
            continue
        if _HEADER.match(line):
            desc_col = line.index("Descri") - 1
            continue
        s = _SALDO_EM.match(line)
        if s:
            if opening is None:
                opening, opening_date = parse_brl(s.group(3)), ymd(s.group(1), s.group(2))
                running = opening
                continue
            closing, closing_date = parse_brl(s.group(3)), ymd(s.group(1), s.group(2))
            break
        if opening is None:
            continue
        body = line
        dm = re.match(r"^(\s*)(\d\d)/(\d\d)\s+", line)
        if dm and len(dm.group(1)) < desc_col:
            cur_date = ymd(dm.group(2), dm.group(3))
            body = " " * dm.end() + line[dm.end():]
        t = _TX.match(body)
        if t:
            if cur_date is None:
                raise ParseError(f"movimento sem data: {line.strip()!r}")
            desc = " ".join(t.group("pre").split())
            amt = parse_brl(t.group("mov"))
            # Santander imprime debito com '-' a direita; credito sem sinal.
            running += amt
            doc = t.group("doc")
            records.append(Record(cur_date, amt, desc, None, "", {"doc": doc} if doc != "-" else {}))
            if t.group("bal"):
                bal = parse_brl(t.group("bal"))
                if bal != running:
                    raise ParseError(f"saldo parcial nao bate em {cur_date}: impresso {bal}, calculado {running}")
        else:
            if not records:
                continue
            extra = " ".join(line.split())
            if extra:
                records[-1].description = f"{records[-1].description} | {extra}"
    if opening is None or closing is None:
        raise ParseError("nao achei SALDO EM de abertura e fechamento")
    if running != closing:
        raise ParseError(f"fechamento nao bate: abertura {opening} + movimentos = {running}, impresso {closing}")
    return ParsedFile(
        importer=NAME, parse_version=VERSION, account=account, records=records,
        checkpoints=[Checkpoint(opening_date, opening, "closing", "Santander SALDO EM (abertura do mes)"),
                     Checkpoint(closing_date, closing, "closing", "Santander SALDO EM (fechamento)")],
        period_start=f"{year:04d}-{month:02d}-01", period_end=closing_date,
    )
