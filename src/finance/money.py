"""Valores em centavos inteiros e normalizacao de texto. Nunca float."""
from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation

_BRL = re.compile(r"^\s*(?P<neg>[-−–])?\s*(?:R\$\s*)?(?P<num>\d{1,3}(?:\.\d{3})*|\d+),(?P<dec>\d{2})\s*(?P<trail>[-−–])?\s*$")


def parse_brl(text: str) -> int:
    """'1.234,56' -> 123456; '10,99-' -> -1099; '-R$ 5,00' -> -500."""
    m = _BRL.match(text)
    if not m:
        raise ValueError(f"valor BRL invalido: {text!r}")
    cents = int(m.group("num").replace(".", "")) * 100 + int(m.group("dec"))
    return -cents if (m.group("neg") or m.group("trail")) else cents


def parse_decimal(text: str) -> int:
    """'-8.64' / '1234.5' (ponto decimal, formato OFX/CSV) -> centavos."""
    try:
        d = Decimal(text.strip().replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError(f"valor decimal invalido: {text!r}") from exc
    q = (d * 100).quantize(Decimal("1"))
    if q != d * 100:
        raise ValueError(f"mais de 2 casas decimais: {text!r}")
    return int(q)


def fmt_cents(cents: int) -> str:
    """123456 -> '1234.56' (formato do export hledger: ponto, sem milhar)."""
    sign = "-" if cents < 0 else ""
    c = abs(cents)
    return f"{sign}{c // 100}.{c % 100:02d}"


def norm_desc(text: str) -> str:
    """Minusculo, sem acento, so alfanumerico com espaco simples."""
    t = unicodedata.normalize("NFKD", text or "")
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return " ".join(t.split())


def digits(text: str) -> str:
    """Numero de conta so com digitos e sem zeros a esquerda: '000010804931' e '01.080493-1' -> '10804931'."""
    return re.sub(r"\D", "", text or "").lstrip("0")
