"""Categorizacao por regras deterministicas (spec F3).

Regras em data/finance/ledger/rules.json (fica nos SEUS dados, versionado no git do
ledger: tem nomes de pessoas/estabelecimentos, nao vai para o repo do codigo).

  {"id": "ifood", "priority": 100,
   "when": {"text_any": ["ifood"], "kind": "credit_card", "sign": "debit"},
   "then": {"category": "alimentacao:delivery"}}

Condicoes (todas precisam bater; texto e normalizado sem acento/caixa):
  text_any / text_all / text_none   substrings da descricao
  merchant_any                      substrings do estabelecimento extraido (merchant())
  regex                             regex na descricao normalizada
  institution / kind / currency     da conta ('nubank', 'credit_card', 'BRL'...)
  sign                              'debit' (saida) | 'credit' (entrada)
  min / max                         valor absoluto em reais
Acoes: category (obrigatoria). Vence a regra de MAIOR priority; empate -> ordem no arquivo.
Categoria manual (annotations.manual=1) nunca e sobrescrita.

Transferencias entre contas proprias: categoria 'transferencias:interna' (ou filha).
pair_transfers() casa as duas pernas (valor oposto, contas diferentes, +-5 dias).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date as Date
from pathlib import Path

from src.finance.money import norm_desc
from src.finance.store import Store, now

INTERNAL = "transferencias:interna"
PAIR_WINDOW_DAYS = 5

# extrai o estabelecimento/contraparte de descricoes de banco (para agrupar e para regras)
_MERCHANT = [
    re.compile(r"emitida por (.+)$", re.I),                                   # Wise cartao
    re.compile(r"^(?:compra cartao maestro|compra cartao deb mc) \| \d\d/\d\d (.+)$", re.I),
    re.compile(r"^compra no d[eé]bito(?: via nupay)? - (.+)$", re.I),
    re.compile(r"^transfer[eê]ncia (?:enviada|recebida)(?: pelo pix)? - (.+?)(?: - .*)?$", re.I),
    re.compile(r"^(?:pix enviado|pix recebido)[^|]*\| (.+)$", re.I),
    re.compile(r"^(?:ted|doc|transferencia|a doc|emissao de doc)[^|]*\| (.+)$", re.I),
    re.compile(r"^enviou dinheiro para (.+)$", re.I),
    re.compile(r"^recebeu dinheiro de (.+?)(?: com a refer.*)?$", re.I),
    re.compile(r'^iof de "(.+)"$', re.I),
]


def merchant(desc: str) -> str:
    d = " ".join((desc or "").split())
    for rx in _MERCHANT:
        m = rx.search(d)
        if m:
            d = m.group(1)
            break
    d = re.sub(r"\s-\s\d{1,2}/\d{1,2}$", "", d)          # parcela ' - 3/10'
    d = re.sub(r"^antecipada - ", "", d, flags=re.I)
    return norm_desc(d)


@dataclass
class Rule:
    id: str
    priority: int
    when: dict
    then: dict
    order: int

    def matches(self, tx: dict) -> bool:
        w = self.when
        text, merch = tx["text"], tx["merchant"]
        if "text_any" in w and not any(norm_desc(s) in text for s in w["text_any"]):
            return False
        if "text_all" in w and not all(norm_desc(s) in text for s in w["text_all"]):
            return False
        if "text_none" in w and any(norm_desc(s) in text for s in w["text_none"]):
            return False
        if "merchant_any" in w and not any(norm_desc(s) in merch for s in w["merchant_any"]):
            return False
        if "regex" in w and not re.search(w["regex"], text):
            return False
        for field in ("institution", "kind", "currency"):
            if field in w:
                allowed = w[field] if isinstance(w[field], list) else [w[field]]
                if tx[field] not in allowed:
                    return False
        if w.get("sign") == "debit" and tx["amount_cents"] >= 0:
            return False
        if w.get("sign") == "credit" and tx["amount_cents"] <= 0:
            return False
        a = abs(tx["amount_cents"]) / 100
        if "min" in w and a < w["min"]:
            return False
        if "max" in w and a > w["max"]:
            return False
        return True


def rules_path(store: Store) -> Path:
    return store.root / "ledger" / "rules.json"


def load_rules(store: Store) -> list[Rule]:
    p = rules_path(store)
    if not p.is_file():
        return []
    raw = json.loads(p.read_text(encoding="utf-8"))
    rules = [Rule(r["id"], int(r.get("priority", 100)), r.get("when", {}), r["then"], i) for i, r in enumerate(raw.get("rules", raw))]
    ids = [r.id for r in rules]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise ValueError(f"ids de regra repetidos: {sorted(dup)}")
    for r in rules:
        if not r.when:
            raise ValueError(f"regra {r.id} sem condicao (pegaria tudo)")
        if not r.then.get("category"):
            raise ValueError(f"regra {r.id} sem category")
    return sorted(rules, key=lambda r: (-r.priority, r.order))


def _txs(store: Store) -> list[dict]:
    rows = store.db.execute(
        "SELECT t.id, t.anchor_key, t.account_key, t.date, t.amount_cents, t.description,"
        " a.institution, a.kind, a.currency FROM transactions t JOIN accounts a ON a.key=t.account_key").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["text"] = norm_desc(r["description"])
        d["merchant"] = merchant(r["description"])
        out.append(d)
    return out


def categorize(store: Store, rules: list[Rule] | None = None, dry_run: bool = False) -> dict:
    """Aplica as regras a todo o livro. Retorna cobertura e hits por regra."""
    rules = load_rules(store) if rules is None else rules
    db = store.db
    manual = {r["anchor_key"] for r in db.execute("SELECT anchor_key FROM annotations WHERE manual=1")}
    hits = {r.id: 0 for r in rules}
    results = []
    for tx in _txs(store):
        if tx["anchor_key"] in manual:
            continue
        rule = next((r for r in rules if r.matches(tx)), None)
        if rule:
            hits[rule.id] += 1
        results.append((tx["anchor_key"], rule.then["category"] if rule else None, rule.id if rule else None))
    if not dry_run:
        db.execute("DELETE FROM annotations WHERE manual=0")
        db.executemany("INSERT INTO annotations (anchor_key, category, note, manual, updated_at) VALUES (?,?,?,0,?)",
                       [(a, c, f"regra:{rid}", now()) for a, c, rid in results if c])
        db.commit()
    total = len(results) + len(manual)
    done = sum(1 for _, c, _ in results if c) + len(manual)
    return {"transactions": total, "categorized": done, "manual": len(manual),
            "coverage": round(done / total, 4) if total else 1.0, "hits": hits,
            "unused_rules": [k for k, v in hits.items() if v == 0]}


def pair_transfers(store: Store) -> dict:
    """Casa as pernas de transferencias internas. Sem par = falta extrato da outra conta (ou regra errada)."""
    db = store.db
    rows = [dict(r) for r in db.execute(
        "SELECT t.id, t.account_key, t.date, t.amount_cents, t.description FROM transactions t"
        " JOIN annotations a ON a.anchor_key=t.anchor_key WHERE a.category LIKE ? ORDER BY t.date, t.id",
        (INTERNAL + "%",))]
    used: set[int] = set()
    pairs = []
    for i, a in enumerate(rows):
        if a["id"] in used:
            continue
        for b in rows[i + 1:]:
            if (Date.fromisoformat(b["date"]) - Date.fromisoformat(a["date"])).days > PAIR_WINDOW_DAYS:
                break
            if b["id"] in used or b["account_key"] == a["account_key"] or b["amount_cents"] != -a["amount_cents"]:
                continue
            used |= {a["id"], b["id"]}
            pairs.append((a["id"], b["id"]))
            break
    db.execute("DELETE FROM transfer_pairs")
    db.executemany("INSERT INTO transfer_pairs VALUES (?, ?)", pairs)
    db.commit()
    unpaired = [r for r in rows if r["id"] not in used]
    return {"internal": len(rows), "pairs": len(pairs), "unpaired": len(unpaired)}


def uncategorized(store: Store, limit: int = 200) -> list[dict]:
    """Sem categoria, agrupado por (instituicao, tipo, estabelecimento): insumo para escrever regras."""
    cats = {r["anchor_key"] for r in store.db.execute("SELECT anchor_key FROM annotations WHERE category IS NOT NULL")}
    groups: dict[tuple, dict] = {}
    for tx in _txs(store):
        if tx["anchor_key"] in cats:
            continue
        k = (tx["institution"], tx["kind"], tx["merchant"])
        g = groups.setdefault(k, {"institution": k[0], "kind": k[1], "merchant": k[2], "count": 0, "sum_cents": 0,
                                  "currency": tx["currency"], "examples": [], "first": tx["date"], "last": tx["date"]})
        g["count"] += 1
        g["sum_cents"] += tx["amount_cents"]
        g["first"], g["last"] = min(g["first"], tx["date"]), max(g["last"], tx["date"])
        if len(g["examples"]) < 3:
            g["examples"].append(tx["description"])
    return sorted(groups.values(), key=lambda g: (-g["count"], g["sum_cents"]))[:limit]
