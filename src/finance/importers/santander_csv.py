"""CSV categorizado do Santander (SANTANDER_AAAA_MM_DESPESAS.csv / _RECEITAS.csv).

Valor vem sem sinal: o sinal sai do nome do arquivo. Repete transacoes que o PDF do
mes ja traz, por isso e fonte SECUNDARIA: so confirma e da dica de categoria.
"""
from __future__ import annotations

import csv
import io
import re

from src.finance.importers.base import AccountRef, ParsedFile, ParseError, Record
from src.finance.money import parse_brl, parse_decimal

NAME = "santander_csv"
VERSION = 1

_FNAME = re.compile(r"SANTANDER_(\d{4})_(\d{2})_(DESPESAS|RECEITAS)", re.I)
# planilhas montadas a mao: varios cabecalhos (pt/en, ordem trocada, 'Data Venc')
_COLS = {
    "date": ("Data", "Data Venc"),
    "desc": ("Descrição", "Descricao"),
    "value": ("Valor",),
    "account": ("Conta", "Account"),
    "category": ("Categoria", "Category"),
    "subcategory": ("Subcategoria", "Subcategory"),
    "card": ("Nome Cartão ou último 4 digitos", "Nome Cartão ou último 4 digitos (se houver)", "Nome Cartão", "Card Name or Last 4 Digits"),
    "note": ("Observações", "Observations"),
    "movement": ("Movimentação", "Movimento"),
}


def _pick(row: dict, field: str) -> str:
    for k in _COLS[field]:
        if row.get(k):
            return row[k].strip()
    return ""


def sniff(name: str, head: bytes) -> bool:
    first = head.lstrip(b"\xef\xbb\xbf").split(b"\n", 1)[0].decode("utf-8", "replace")
    cols = [c.strip() for c in first.split(",")]
    return bool(_FNAME.search(name)) and "Valor" in cols and any(c in cols for c in _COLS["date"])


def _date(text: str, year: int, month: int) -> str:
    """Datas digitadas em varios formatos. O mes do arquivo desempata dia/mes trocados."""
    t = text.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", t):
        y, a, b = map(int, t.split("-"))
        cands = [(y, a, b), (y, b, a)]
    elif re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", t):
        a, b, y = map(int, t.split("/"))
        cands = [(y, b, a), (y, a, b)]
    elif re.fullmatch(r"\d{1,2}/\d{1,2}", t):
        a, b = map(int, t.split("/"))
        cands = [(year, b, a), (year, a, b)]
    else:
        raise ParseError(f"data em formato desconhecido: {text!r}")
    valid = [c for c in cands if 1 <= c[1] <= 12 and 1 <= c[2] <= 31]
    for c in valid:
        if (c[0], c[1]) == (year, month):
            return f"{c[0]:04d}-{c[1]:02d}-{c[2]:02d}"
    if not valid:
        raise ParseError(f"data invalida: {text!r}")
    c = valid[0]
    return f"{c[0]:04d}-{c[1]:02d}-{c[2]:02d}"


def parse(name: str, data: bytes) -> ParsedFile:
    m = _FNAME.search(name)
    if not m:
        raise ParseError(f"nome inesperado (preciso de _DESPESAS ou _RECEITAS): {name!r}")
    sign = -1 if m.group(3).upper() == "DESPESAS" else 1
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    # 'Conta' as vezes traz lixo ('Santander', 'Outros'): so vale se parecer numero de conta
    accounts = {_pick(r, "account") for r in rows if len(re.sub(r"\D", "", _pick(r, "account"))) >= 6}
    if len(accounts) > 1:
        raise ParseError(f"mais de uma conta no CSV: {sorted(accounts)}")
    number = accounts.pop() if accounts else ""
    records = []
    for r in rows:
        raw_date = _pick(r, "date")
        if not raw_date:
            continue
        iso = _date(raw_date, int(m.group(1)), int(m.group(2)))
        v = _pick(r, "value")
        cents = parse_brl(v) if "," in v and re.search(r",\d{2}$", v) else parse_decimal(v)
        extra = {f: _pick(r, f) for f in ("category", "subcategory", "card", "note", "movement") if _pick(r, f)}
        records.append(Record(iso, sign * abs(cents), " ".join(_pick(r, "desc").split()), None,
                              m.group(3).upper(), extra))
    return ParsedFile(
        importer=NAME, parse_version=VERSION, account=AccountRef("santander", "checking", number, "BRL"),
        records=records, period_start=f"{m.group(1)}-{m.group(2)}-01", secondary=True,
    )
