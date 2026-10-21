"""OFX 1.x (SGML) de conta corrente: Nubank e Santander ("Money 2000").

Nubank: FITID e UUID unico, LEDGERBAL vira checkpoint de fechamento.
Santander: FITID '000000' em todas as linhas -> native_id None (dedup por conteudo+seq).
"""
from __future__ import annotations

import re

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.money import parse_decimal

NAME = "ofx"
VERSION = 2

_TAG = re.compile(r"<(/?)([A-Z0-9.]+)>([^<]*)")
_INSTITUTIONS = {"0260": "nubank", "260": "nubank", "0033": "santander", "033": "santander"}


def sniff(name: str, head: bytes) -> bool:
    return head.lstrip().startswith(b"OFXHEADER") or b"<OFX>" in head[:4096]


def _decode(data: bytes) -> str:
    head = data[:600].decode("ascii", "replace")
    if "ENCODING:UTF-8" in head:
        return data.decode("utf-8")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("cp1252")


def _date(v: str) -> str:
    v = v.strip()
    if not re.match(r"^\d{8}", v):
        raise ParseError(f"data OFX invalida: {v!r}")
    return f"{v[0:4]}-{v[4:6]}-{v[6:8]}"


def _blocks(text: str, name: str) -> list[dict]:
    """Coleta os campos-folha de cada bloco <name> (aceita SGML sem tag de fechamento)."""
    out: list[dict] = []
    cur: dict | None = None
    for close, tag, val in _TAG.findall(text):
        if tag == name:
            if close:
                if cur is not None:
                    out.append(cur)
                cur = None
            else:
                if cur is not None:
                    out.append(cur)
                cur = {}
            continue
        if cur is not None and not close and val.strip():
            cur.setdefault(tag, val.strip())
    if cur is not None:
        out.append(cur)
    return out


def _first(text: str, tag: str) -> str | None:
    m = re.search(rf"<{tag}>([^<\r\n]*)", text)
    return m.group(1).strip() if m else None


def parse(name: str, data: bytes) -> ParsedFile:
    text = _decode(data)
    if "<BANKACCTFROM>" not in text:
        raise ParseError("OFX sem BANKACCTFROM (fatura de cartao em OFX ainda nao suportada)")
    bank = _first(text, "BANKID") or ""
    inst = _INSTITUTIONS.get(bank)
    if not inst:
        org = (_first(text, "ORG") or "").lower()
        inst = "nubank" if "nu pagamentos" in org else "santander" if "santander" in org else None
    if not inst:
        raise ParseError(f"banco OFX desconhecido: BANKID={bank!r}")
    acct = _first(text, "ACCTID") or ""
    currency = _first(text, "CURDEF") or "BRL"
    account = AccountRef(inst, "checking", acct, currency)

    records: list[Record] = []
    for tr in _blocks(text, "STMTTRN"):
        fitid = tr.get("FITID", "")
        native = fitid if fitid and set(fitid) - {"0"} else None
        desc = tr.get("MEMO") or tr.get("NAME") or ""
        records.append(Record(
            date=_date(tr["DTPOSTED"]),
            amount_cents=parse_decimal(tr["TRNAMT"]),
            description=" ".join(desc.split()),
            native_id=native,
            kind=tr.get("TRNTYPE", ""),
            extra={k: v for k, v in tr.items() if k in ("CHECKNUM", "REFNUM", "PAYEEID", "NAME") and v not in ("0", "000000")},
        ))

    checkpoints: list[Checkpoint] = []
    for bal in _blocks(text, "LEDGERBAL"):
        if "BALAMT" in bal and "DTASOF" in bal:
            checkpoints.append(Checkpoint(_date(bal["DTASOF"]), parse_decimal(bal["BALAMT"]), "closing", "OFX LEDGERBAL"))

    start, end = _first(text, "DTSTART"), _first(text, "DTEND")
    # Nubank: o rendimento do mes nao vem como STMTTRN, so em BALLIST, mas entra no LEDGERBAL
    for bal in _blocks(text, "BAL"):
        if bal.get("NAME") == "RENDIMENTO LIQUIDO" and bal.get("VALUE") and end:
            value = parse_decimal(bal["VALUE"])
            if value:
                records.append(Record(_date(end), value, "Rendimento liquido no periodo", f"rendimento:{_date(end)}",
                                      "INT", {"synthetic": "OFX BALLIST RENDIMENTO LIQUIDO"}))
    return ParsedFile(
        importer=NAME, parse_version=VERSION, account=account, records=records, checkpoints=checkpoints,
        period_start=_date(start) if start else None, period_end=_date(end) if end else None,
    )
