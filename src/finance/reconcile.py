"""Prova de que o livro canonico bate com os saldos que as fontes imprimem.

Conta corrente / carteira: saldo no fim do dia D = ancora + soma das transacoes
canonicas ate D. Cada checkpoint 'closing' tem que bater; a diferenca vira alerta
(e, se igualar o valor de uma transacao proxima, sugere duplicata/faltante).
Cartao: fatura a fatura (abertura + itens == fechamento) e encadeamento entre
faturas (fechamento N == abertura N+1, senao falta fatura no meio).
"""
from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict

from src.finance.store import Store


def _account_kind(store: Store, key: str) -> str:
    row = store.db.execute("SELECT kind FROM accounts WHERE key=?", (key,)).fetchone()
    return row["kind"] if row else "?"


def reconcile_balances(store: Store, account_key: str) -> dict:
    db = store.db
    txs = db.execute("SELECT date, amount_cents, description FROM transactions WHERE account_key=? ORDER BY date, id",
                     (account_key,)).fetchall()
    cps = db.execute("SELECT date, balance_cents, note, sha256 FROM checkpoints WHERE account_key=? AND kind='closing'"
                     " ORDER BY date", (account_key,)).fetchall()
    if not cps:
        return {"account": account_key, "status": "sem_checkpoint", "checked": 0, "breaks": [], "final_diff": 0}
    dates = [t["date"] for t in txs]
    cum = []
    total = 0
    for t in txs:
        total += t["amount_cents"]
        cum.append(total)

    def sum_until(d: str) -> int:
        i = bisect_right(dates, d)
        return cum[i - 1] if i else 0

    anchor = cps[0]
    base = anchor["balance_cents"] - sum_until(anchor["date"])
    points = []
    seen = set()
    for cp in cps:
        k = (cp["date"], cp["balance_cents"])
        if k in seen:
            continue
        seen.add(k)
        calc = base + sum_until(cp["date"])
        points.append({"date": cp["date"], "expected": cp["balance_cents"], "computed": calc,
                       "diff": calc - cp["balance_cents"], "note": cp["note"]})
    # quebra = ponto onde a diferenca MUDA. Diferenca constante depois de uma quebra e o
    # efeito de uma unica lacuna/duplicata naquele intervalo, nao um erro por mes.
    breaks = []
    prev = {"date": anchor["date"], "diff": 0}
    for pt in points:
        if pt["diff"] != prev["diff"]:
            delta = pt["diff"] - prev["diff"]
            window = [dict(t) for t in txs if prev["date"] < t["date"] <= pt["date"]]
            breaks.append({"after": prev["date"], "until": pt["date"], "delta": delta,
                           "hint": ("calculado abaixo da fonte: faltam entradas (ou sobram saidas)" if delta < 0
                                    else "calculado acima da fonte: faltam saidas (ou sobram entradas/duplicata)"),
                           "same_value_txs": [t for t in window if abs(t["amount_cents"]) == abs(delta)][:5]})
        prev = pt
    return {"account": account_key, "status": "ok" if not breaks else "divergente", "anchor": dict(anchor),
            "checked": len(points), "breaks": breaks, "final_diff": points[-1]["diff"] if points else 0}


def reconcile_bills(store: Store, account_key: str) -> dict:
    db = store.db
    blobs = db.execute("SELECT sha256, source_name, period_start, period_end FROM raw_blobs WHERE account_key=?"
                       " AND status='parsed' ORDER BY period_end", (account_key,)).fetchall()
    bills, problems = [], []
    for b in blobs:
        cp = {r["kind"]: r["balance_cents"] for r in db.execute("SELECT kind, balance_cents FROM checkpoints WHERE sha256=?", (b["sha256"],))}
        if "opening" not in cp or "closing" not in cp:
            continue  # fonte sem fatura fechada (ex.: Open Finance): nao entra na conferencia fatura a fatura
        items = db.execute("SELECT coalesce(sum(s.amount_cents),0) FROM source_records s JOIN record_blobs rb ON rb.record_id=s.id"
                           " WHERE rb.sha256=?", (b["sha256"],)).fetchone()[0]
        diff = cp.get("opening", 0) + items - cp.get("closing", 0)
        bills.append({"file": b["source_name"], "start": b["period_start"], "end": b["period_end"],
                      "opening": cp.get("opening"), "closing": cp.get("closing"), "diff": diff})
    for prev, nxt in zip(bills, bills[1:]):
        if prev["closing"] != nxt["opening"]:
            problems.append({"between": [prev["end"], nxt["start"]], "prev_closing": prev["closing"],
                             "next_opening": nxt["opening"], "hint": "falta fatura no meio ou fatura alterada"})
    bad = [b for b in bills if abs(b["diff"]) > 2]
    return {"account": account_key, "status": "ok" if not (bad or problems) else "divergente",
            "bills": len(bills), "unbalanced": bad, "chain_breaks": problems}


def coverage(store: Store, account_key: str) -> dict:
    months = defaultdict(int)
    for r in store.db.execute("SELECT substr(date,1,7) m, count(*) n FROM transactions WHERE account_key=? GROUP BY m",
                              (account_key,)):
        months[r["m"]] = r["n"]
    if not months:
        return {"first": None, "last": None, "missing_months": []}
    first, last = min(months), max(months)
    y, m = map(int, first.split("-"))
    missing = []
    while f"{y:04d}-{m:02d}" <= last:
        k = f"{y:04d}-{m:02d}"
        if k not in months:
            missing.append(k)
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return {"first": first, "last": last, "months_with_data": len(months), "missing_months": missing}


def report(store: Store) -> list[dict]:
    out = []
    for acc in store.db.execute("SELECT key, kind FROM accounts ORDER BY key").fetchall():
        r = reconcile_bills(store, acc["key"]) if acc["kind"] == "credit_card" else reconcile_balances(store, acc["key"])
        r["coverage"] = coverage(store, acc["key"])
        r["transactions"] = store.db.execute("SELECT count(*) FROM transactions WHERE account_key=?", (acc["key"],)).fetchone()[0]
        out.append(r)
    return out
