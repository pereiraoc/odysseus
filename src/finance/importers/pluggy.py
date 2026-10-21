"""Blobs JSON gravados por src/finance/pluggy_sync.py (uma conta por blob).

Convencoes da Pluggy (conferidas no spike de 2026-10-21):
  conta (BANK)    amount ja vem com sinal (+ entra, - sai)
  cartao (CREDIT) amount + = compra, - = pagamento/estorno -> no livro: -amount (cartao e passivo)
  datas em UTC   -> convertidas para America/Sao_Paulo (compra 21h nao vira o dia seguinte)
  PENDING        fica so no bruto (parcelas futuras e lancamentos ainda nao confirmados)
Wise via Pluggy: transacoes vem em varias moedas dentro da mesma conta; usamos so o saldo
por moeda (checkpoint) -- as transacoes do Wise vem do CSV, que e completo e por moeda.
"""
from __future__ import annotations

import json
from datetime import datetime
from zoneinfo import ZoneInfo

from src.finance.importers.base import AccountRef, Checkpoint, ParsedFile, ParseError, Record
from src.finance.money import parse_decimal

NAME = "pluggy"
VERSION = 3
TZ = ZoneInfo("America/Sao_Paulo")


def sniff(name: str, head: bytes) -> bool:
    return head.lstrip().startswith(b"{") and b'"_source": "pluggy"' in head


def local_date(ts: str) -> str:
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt.astimezone(TZ).date().isoformat()


def cents(v) -> int:
    return parse_decimal(f"{float(v):.2f}")


def account_ref(institution: str, acc: dict) -> AccountRef:
    cur = acc.get("currencyCode") or "BRL"
    if acc.get("type") == "CREDIT":
        # um cartao por instituicao: continua a mesma conta das faturas em PDF (numero do plastico muda)
        return AccountRef(institution, "credit_card", "principal", cur, acc.get("marketingName") or acc.get("name") or "")
    kind = "wallet" if institution == "wise" else "checking"
    return AccountRef(institution, kind, acc.get("number") or acc["id"], cur, acc.get("name") or "")


def parse_multi(name: str, data: bytes) -> list[ParsedFile]:
    doc = json.loads(data)
    if doc.get("kind") != "account":
        raise ParseError(f"blob pluggy de tipo {doc.get('kind')!r} nao gera transacoes")
    inst, acc = doc["institution"], doc["account"]
    ref = account_ref(inst, acc)
    credit = acc.get("type") == "CREDIT"
    records, pending = [], 0
    owner_doc = "".join(ch for ch in (acc.get("taxNumber") or "") if ch.isdigit())
    if inst != "wise":
        for t in doc.get("transactions", []):
            if t.get("status") == "PENDING":
                pending += 1
                continue
            meta = t.get("creditCardMetadata") or {}
            when = meta.get("purchaseDate") if credit and meta.get("purchaseDate") else t["date"]
            amount = cents(t["amount"])
            extra = {k: t[k] for k in ("providerId", "operationType", "category") if t.get(k)}
            if t.get("merchant"):
                extra["merchant"] = (t["merchant"] or {}).get("businessName") or (t["merchant"] or {}).get("name")
            pay = t.get("paymentData") or {}
            other = (pay.get("receiver") if amount < 0 else pay.get("payer")) or {}
            other_doc = "".join(ch for ch in ((other.get("documentNumber") or {}).get("value") or "") if ch.isdigit())
            if other.get("name"):
                extra["counterparty"] = other["name"]
            if other.get("accountNumber"):
                acct = "".join(ch for ch in other["accountNumber"] if ch.isalnum()).lstrip("0")
                extra["counterparty_account"] = f"{other.get('routingNumber') or ''}/{other.get('branchNumber') or ''}/{acct}"
            if other_doc:
                extra["counterparty_doc"] = "CNPJ" if len(other_doc) == 14 else "CPF"
                if owner_doc and other_doc == owner_doc:
                    extra["self_transfer"] = 1  # de/para o seu proprio CPF: transferencia entre contas suas
            if meta:
                extra.update({k: meta[k] for k in ("cardNumber", "billId", "installmentNumber", "totalInstallments") if meta.get(k)})
                if meta.get("installmentNumber"):
                    extra["installment"], extra["installments"] = meta["installmentNumber"], meta.get("totalInstallments")
            if t.get("amountInAccountCurrency") is not None and t.get("currencyCode") != ref.currency:
                extra["original"] = f"{t['amount']} {t.get('currencyCode')}"
                amount = cents(t["amountInAccountCurrency"])
            records.append(Record(local_date(when), -amount if credit else amount,
                                  " ".join((t.get("description") or "").split()), t["id"], t.get("type", ""), extra))
    checkpoints = []
    if not credit and acc.get("balance") is not None and doc.get("item_last_updated"):
        checkpoints.append(Checkpoint(local_date(doc["item_last_updated"]), cents(acc["balance"]), "closing",
                                      "Pluggy saldo na ultima atualizacao do banco"))
    warnings = [f"{pending} lancamentos PENDING guardados so no bruto"] if pending else []
    dates = sorted(r.date for r in records)
    return [ParsedFile(NAME, VERSION, ref, records, checkpoints,
                       period_start=dates[0] if dates else None, period_end=dates[-1] if dates else None,
                       warnings=warnings)]
