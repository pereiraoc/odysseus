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
OCR_NAME = "santander_cc_ocr"
VERSION = 1

_MONTH_NUM = {"janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
              "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

_AMT = r"\d{1,3}(?:\.\d{3})*,\d{2}-?"
_RESUMO = re.compile(r"Resumo\s+-\s+([a-zçA-ZÇ]+)/(\d{4})")
_CONTA = re.compile(r"Ag[eê]ncia\s+Conta Corrente\s*\n\s*(\d{3,5})\s+([\d.\-]+)")
_SALDO_EM = re.compile(rf"^\s*SALDO EM (\d\d)/(\d\d)\s+({_AMT})\s*$")
_TX = re.compile(rf"^(?P<pre>.*?\S)\s+(?P<doc>\d{{1,10}}|-)\s+(?P<mov>{_AMT})(?:\s+(?P<bal>{_AMT}))?\s*$")
# OCR: valor sem virgula ('714-' por '7,14-'): vira incognita, resolvida pelo saldo impresso
_TX_BROKEN = re.compile(r"^(?P<pre>.*?\S)\s+(?P<doc>\d{1,10}|-)\s+(?P<mov>\d[\d.]*-?)(?:\s+(?P<bal>\d{1,3}(?:\.\d{3})*,\d{2}-?))?\s*$")
_HEADER = re.compile(r"^\s*Data\s+Descri[cç][aã]o")
_NOISE = re.compile(r"^(Extrato_PF|BALP_|\s*Pagina:|\s*P[aá]gina:|\s*EXTRATO CONSOLIDADO|\s*\d+/\d+\s*$)")


def sniff(name: str, head: bytes) -> bool:
    return False  # PDF: decidido pelo conteudo em detect() (precisa do texto)


def matches_text(text: str) -> bool:
    return "Extrato_PF" in text and "Movimenta" in text and bool(_RESUMO.search(text))


def _ocr_fix(line: str, month: int) -> str:
    """Artefatos conhecidos do tesseract neste layout. So mexe em forma, nunca em valor:
    se um digito de valor vier errado, a conferencia de saldo rejeita o arquivo."""
    # '24106' / '24l06' -> '24/06' (barra lida como 1/l/I), so se o mes bater com o extrato
    m = re.match(r"^(\s*)(\d\d)[1lI|\\]?(\d\d)(\s)", line)  # tambem '0410' (barra sumiu)
    if m and int(m.group(3)) in (month, month - 1 or 12) and 1 <= int(m.group(2)) <= 31:
        line = f"{m.group(1)}{m.group(2)}/{m.group(3)}{m.group(4)}" + line[m.end():]
    line = re.sub(r"^(\s*\d\d/\d\d)\s*[—–-]+\s+", r"\1 ", line)  # '07/06 — PIX'
    # coluna Nº Documento vazia ('-') lida como '=', '—', '~', '_'
    line = re.sub(r"(\s{2,})[=—–~_](\s{2,}\d)", r"\1-\2", line)
    line = re.sub(r"SALDO\s*EM\s*(\d\d)\s*[/1lI]?\s*(\d\d)\b", r"SALDO EM \1/\2", line)
    return line


def matches_ocr_text(text: str) -> bool:
    return bool(_RESUMO.search(text)) and "Movimenta" in text and ("ContaMax" in text or "Conta Corrente" in text)


def parse(name: str, data: bytes, text: str | None = None, ocr: bool = False) -> ParsedFile:
    """ocr=True: texto do tesseract perde o recuo, entao 'dd/mm' no inicio so e a coluna Data
    quando a linha tem valor (a 1a transacao do dia sempre tem); sem valor e continuacao."""
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
    unknown: list[int] = []
    for raw in lines[start + 1:]:
        line = raw.rstrip()
        if ocr:
            line = _ocr_fix(line, month)
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
            if unknown:
                if len(unknown) > 1:
                    raise ParseError(f"{len(unknown)} valores ilegiveis antes do fechamento: nao da para deduzir")
                i = unknown.pop()
                records[i].amount_cents = closing - running
                running = closing
            break
        if opening is None:
            continue
        body = line
        dm = re.match(r"^(\s*)(\d\d)/(\d\d)\s+", line)
        if ocr and not dm:
            # data mutilada ('011' por '01/11'): numero curto na coluna Data + valor na linha -> dia/mes do extrato
            mm = re.match(r"^(\s*)(\d\d)[/1lI]?\d{1,2}(\s{2,})", line)
            rest = " " * (mm.end() if mm else 0) + (line[mm.end():] if mm else "")
            if mm and 1 <= int(mm.group(2)) <= 31 and (_TX.match(rest) or _TX_BROKEN.match(rest)):
                line = f"{mm.group(1)}{mm.group(2)}/{month:02d}{mm.group(3)}" + line[mm.end():]
                dm = re.match(r"^(\s*)(\d\d)/(\d\d)\s+", line)
        if dm and ocr:
            rest = " " * dm.end() + line[dm.end():]
            if not (_TX.match(rest) or _TX_BROKEN.match(rest)):
                dm = None
        if dm and (ocr or len(dm.group(1)) < desc_col):
            cur_date = ymd(dm.group(2), dm.group(3))
            body = " " * dm.end() + line[dm.end():]
        t = _TX.match(body)
        broken = None if t or not ocr else _TX_BROKEN.match(body)
        if t or broken:
            t = t or broken
            if cur_date is None:
                raise ParseError(f"movimento sem data: {line.strip()!r}")
            desc = " ".join(t.group("pre").split())
            doc = t.group("doc")
            if broken:
                amt = None  # incognita: resolvida no proximo saldo impresso
                records.append(Record(cur_date, 0, desc, None, "", {"doc": doc} if doc != "-" else {}))
                records[-1].extra["ocr_inferred"] = f"lido '{t.group('mov')}', valor deduzido do saldo impresso"
                unknown.append(len(records) - 1)
            else:
                amt = parse_brl(t.group("mov"))
                running += amt
                records.append(Record(cur_date, amt, desc, None, "", {"doc": doc} if doc != "-" else {}))
            if t.group("bal"):
                bal = parse_brl(t.group("bal"))
                if unknown:
                    if len(unknown) > 1:
                        raise ParseError(f"{len(unknown)} valores ilegiveis antes do saldo de {cur_date}: nao da para deduzir")
                    i = unknown.pop()
                    records[i].amount_cents = bal - running
                    running = bal
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
        importer=OCR_NAME if ocr else NAME, parse_version=VERSION, account=account, records=records,
        checkpoints=[Checkpoint(opening_date, opening, "closing", "Santander SALDO EM (abertura do mes)"),
                     Checkpoint(closing_date, closing, "closing", "Santander SALDO EM (fechamento)")],
        period_start=f"{year:04d}-{month:02d}-01", period_end=closing_date,
    )
