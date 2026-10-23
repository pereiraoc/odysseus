"""Estornos e reembolsos casados com o gasto original: saem dos graficos (o livro/ledger continua completo).

Um credito (entrada) casa com um debito (saida) da MESMA conta quando:
  - o debito veio antes (ate REFUND_WINDOW_DAYS com cara de estorno, PLAIN_WINDOW_DAYS sem; PEOPLE_WINDOW_DAYS para Pix com pessoas) e
  - o estabelecimento/pessoa e o mesmo (sem o prefixo 'Estorno de', 'IOF de volta de', 'Reembolso recebido pelo Pix') e
  - o valor e igual (estorno total: as duas pontas somem) ou menor, so com cara de estorno (parcial: o debito
    fica so com a diferenca, no mes e na categoria dele).
Varios estornos parciais podem abater o mesmo debito, ate o valor dele. Renda, transferencias entre contas
suas, cambio, investimento, emprestimo e rateio nunca casam.
"""
from __future__ import annotations

import re
from datetime import date as Date

from src.finance.rules import merchant
from src.finance.store import Store

REFUND_WINDOW_DAYS = 180
EARLY_DAYS = 3  # o cartao as vezes lanca o estorno um dia antes da cobranca
PLAIN_WINDOW_DAYS = 45   # credito sem cara de estorno ('Uber - NuPay' +14,19), so valor exato
PEOPLE_WINDOW_DAYS = 30
REFUND_RX = re.compile(r"estorno|reembolso|devolu|de volta|chargeback|cancelad|cancelamento|refund", re.I)
_PREFIX = re.compile(r"^(?:estorno|reembolso recebido pelo pix|reembolso|devolucao|cancelamento|credito)(?: de| do| da)?\s+")
IOF_BACK = re.compile(r"^\s*iof de volta", re.I)
_SUFFIX = re.compile(r"\s+nupay$")
NEVER = ("renda:", "transferencias:interna", "transferencias:cambio", "transferencias:investimento", "financeiro:rotativo",
         "ajustes:", "emprestimos:", "patrimonio:", "moradia:rateio")
PEOPLE = "transferencias:pessoas"


def _key(desc: str) -> str:
    """'Estorno de "Mp *Kubaaudio"' e 'Mp *Kubaaudio' -> 'mp kubaaudio'; IOF so casa com IOF."""
    desc = re.sub(r"^\s*reembolso recebido pelo pix", "Transferência recebida pelo Pix", desc or "", flags=re.I)
    k = _SUFFIX.sub("", _PREFIX.sub("", merchant(desc)))
    words = [w for w in k.split() if not any(ch.isdigit() for ch in w)][:3]  # sem codigo/CNPJ/hora
    iof = (desc or "").strip().lower().startswith("iof")
    return ("iof " if iof else "") + " ".join(words) if words else ""


def match(rows: list[dict]) -> list[tuple[int, int, int]]:
    """rows: id, account_key, date, amount_cents, description, category. -> [(credito, debito, valor abatido)]"""
    ok = [r for r in rows if not (r["category"] or "").startswith(NEVER)]
    debits: dict[tuple, list[dict]] = {}
    for r in ok:
        if r["amount_cents"] < 0:
            debits.setdefault((r["account_key"], _key(r["description"])), []).append({**r, "left": -r["amount_cents"]})
    out, used = [], set()
    credits = sorted((r for r in ok if r["amount_cents"] > 0), key=lambda r: (r["date"], r["id"]))
    # primeiro os de valor exato (estorno total), depois os parciais
    for exact in (True, False):
        for c in credits:
            if c["id"] in used:
                continue
            keys = [_key(c["description"])]
            if IOF_BACK.match(c["description"] or ""):
                keys.append(keys[0][4:])  # sem IOF separado na fatura: o IOF devolvido abate a propria compra
            if not keys[0]:
                continue
            people = (c["category"] or "") == PEOPLE
            looks = bool(REFUND_RX.search(c["description"] or ""))
            if not exact and not looks:
                continue
            window = REFUND_WINDOW_DAYS if looks else PEOPLE_WINDOW_DAYS if people else PLAIN_WINDOW_DAYS
            cd = Date.fromisoformat(c["date"])
            best = None
            for d in (d for k in keys for d in debits.get((c["account_key"], k), [])):
                age = (cd - Date.fromisoformat(d["date"])).days
                if age < -EARLY_DAYS or age > (PEOPLE_WINDOW_DAYS if (d["category"] or "") == PEOPLE and not looks else window) \
                        or d["left"] <= 0:
                    continue
                fits = d["left"] == c["amount_cents"] if exact else d["left"] >= c["amount_cents"]
                if fits and (best is None or abs(age) < best[0]):
                    best = (abs(age), d)
            if best:
                d = best[1]
                d["left"] -= c["amount_cents"]
                out.append((c["id"], d["id"], c["amount_cents"]))
                used.add(c["id"])
    return out


def pair(store: Store) -> dict:
    db = store.db
    # transacao dividida em varias categorias fica fora (o abatimento nao saberia em qual parte cair)
    rows = [dict(r) for r in db.execute(
        "SELECT id, account_key, date, amount_cents, description, category FROM tx_lines"
        " WHERE id IN (SELECT id FROM tx_lines GROUP BY id HAVING count(*)=1)")]
    pairs = match(rows)
    db.execute("DELETE FROM refund_pairs")
    db.executemany("INSERT INTO refund_pairs (credit_id, debit_id, amount_cents) VALUES (?,?,?)", pairs)
    db.commit()
    amount = {r["id"]: r["amount_cents"] for r in rows}
    back: dict[int, int] = {}
    for _, d, a in pairs:
        back[d] = back.get(d, 0) + a
    return {"refunds": len(pairs), "cents": sum(back.values()), "full": sum(1 for d, a in back.items() if a == -amount[d])}


def adjust(rows: list[dict], pairs) -> list[dict]:
    """Tira dos graficos o que foi estornado. rows: dicts com 'id' e 'amount_cents' (ja convertidos).
    Credito casado some; o debito perde o valor estornado (convertido na mesma proporcao) e some se zerar."""
    if not pairs:
        return rows
    refunded: dict[int, int] = {}
    credit_ids = set()
    for c, d, a in pairs:
        credit_ids.add(c)
        refunded[d] = refunded.get(d, 0) + a
    out = []
    for r in rows:
        if r["id"] in credit_ids:
            continue
        if r["id"] in refunded:
            raw = r.get("raw_cents", r["amount_cents"])
            left = raw + refunded[r["id"]]  # raw < 0
            if left >= 0:
                continue
            r = {**r, "amount_cents": round(r["amount_cents"] * left / raw) if raw else 0}
        out.append(r)
    return out


def load(store: Store) -> list[tuple[int, int, int]]:
    return [tuple(r) for r in store.db.execute("SELECT credit_id, debit_id, amount_cents FROM refund_pairs")]
