"""Contrato dos importadores: arquivo bruto -> ParsedFile (sem tocar no banco)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AccountRef:
    institution: str          # 'nubank' | 'santander' | 'wise' | 'caixa'
    kind: str                 # 'checking' | 'credit_card' | 'wallet'
    number: str               # identificador da conta/cartao como veio (normalizado em account_key)
    currency: str = "BRL"
    name: str = ""

    @property
    def key(self) -> str:
        from src.finance.money import digits
        num = digits(self.number) or self.number
        return f"{self.institution}:{self.kind}:{num}:{self.currency}"


@dataclass
class Record:
    """Uma transacao como a fonte a descreve. amount_cents: + entra, - sai (visao da conta)."""
    date: str                 # AAAA-MM-DD
    amount_cents: int
    description: str
    native_id: Optional[str] = None   # FITID unico, id da Pluggy, TransferWise ID... None = sem id confiavel
    kind: str = ""            # tipo livre da fonte (DEBIT, CARD, PAYMENT, ...)
    extra: dict = field(default_factory=dict)


@dataclass
class Checkpoint:
    """Saldo observado na fonte. Para cartao, bill_total confere a soma dos itens da fatura."""
    date: str
    balance_cents: int
    kind: str = "closing"     # 'opening' | 'closing' | 'running' | 'bill_total'
    note: str = ""


@dataclass
class ParsedFile:
    importer: str
    parse_version: int
    account: AccountRef
    records: list[Record]
    checkpoints: list[Checkpoint] = field(default_factory=list)
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    secondary: bool = False   # fonte que so confirma (nunca cria transacao canonica sozinha se casar)
    warnings: list[str] = field(default_factory=list)


class ParseError(Exception):
    pass
