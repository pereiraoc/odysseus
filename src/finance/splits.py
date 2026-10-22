"""Divisao de uma transacao em categorias (ex.: Pix mensal = parte moradia + parte devolucao de emprestimo).

Regras em data/finance/ledger/splits.json (nos SEUS dados, como rules.json):

  {"splits": [{"id": "suelen-moradia", "when": {"merchant_any": ["suelen valentini"], "sign": "credit",
               "date_from": "2024-07"},
               "monthly_first": {"category": "moradia:rateio", "amount": 1000},
               "rest": "emprestimos:suelen"}]}

  when           mesmas condicoes de rules.py
  monthly_first  os primeiros R$ <amount> que baterem no mes (em ordem de data) vao para <category>
  rest           o que passar disso no mes

Roda depois de rules.categorize (que chama apply). A categoria da transacao inteira (annotations) passa a ser a
da maior parte, com a divisao na nota; somas por categoria leem a view tx_lines. Categoria manual vence a divisao.
"""
from __future__ import annotations

import json
from pathlib import Path

from src.finance.money import fmt_cents
from src.finance.store import Store, now


def splits_path(store: Store) -> Path:
    return store.root / "ledger" / "splits.json"


def load(store: Store) -> list[dict]:
    p = splits_path(store)
    if not p.is_file():
        return []
    raw = json.loads(p.read_text(encoding="utf-8"))
    out = raw.get("splits", []) if isinstance(raw, dict) else raw
    for s in out:
        if not s.get("when") or not s.get("rest") or not s.get("monthly_first", {}).get("category"):
            raise ValueError(f"divisao {s.get('id')} precisa de when, monthly_first.category e rest")
    return out


def apply(store: Store, txs: list[dict] | None = None) -> dict:
    from src.finance.rules import Rule, _txs
    specs = load(store)
    db = store.db
    db.execute("DELETE FROM splits")
    if not specs:
        db.commit()
        return {"split": 0}
    manual = {r["anchor_key"] for r in db.execute("SELECT anchor_key FROM annotations WHERE manual=1")}
    txs = sorted((t for t in (txs if txs is not None else _txs(store)) if t["anchor_key"] not in manual),
                 key=lambda t: (t["date"], t["id"]))
    done: set[str] = set()
    hits = {}
    for i, spec in enumerate(specs):
        rule = Rule(spec["id"], 0, spec["when"], {"category": "-"}, i)
        cap_cat, cap = spec["monthly_first"]["category"], round(spec["monthly_first"]["amount"] * 100)
        used: dict[str, int] = {}
        hits[spec["id"]] = 0
        for t in txs:
            if t["anchor_key"] in done or not rule.matches(t):
                continue
            done.add(t["anchor_key"])
            hits[spec["id"]] += 1
            v, m = t["amount_cents"], t["date"][:7]
            sign = 1 if v > 0 else -1
            first = min(abs(v), max(0, cap - used.get(m, 0)))
            used[m] = used.get(m, 0) + first
            lines = [(cap_cat, sign * first), (spec["rest"], sign * (abs(v) - first))]
            lines = [(c, a) for c, a in lines if a]
            note = f"divisao:{spec['id']} " + " + ".join(f"{c} {fmt_cents(abs(a))}" for c, a in lines)
            db.executemany("INSERT INTO splits VALUES (?,?,?,?,?)",
                           [(t["anchor_key"], k, c, a, note) for k, (c, a) in enumerate(lines)])
            main = max(lines, key=lambda ca: abs(ca[1]))[0]
            db.execute("INSERT OR REPLACE INTO annotations (anchor_key, category, note, manual, updated_at) VALUES (?,?,?,0,?)",
                       (t["anchor_key"], main, note, now()))
    db.commit()
    return {"split": len(done), "hits": hits}
