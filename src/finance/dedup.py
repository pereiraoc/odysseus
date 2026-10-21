"""Livro canonico a partir dos source_records. rebuild() e deterministico e idempotente.

Regras (spec, secao Deduplicacao):
 1. Mesmo (importer, conta, native_key) ja e o mesmo registro (garantido no ingest).
 2. Entre importadores diferentes: mesma conta, mesmo valor exato, data +-WINDOW_DAYS.
    Uma transacao canonica aceita no maximo UM registro de cada importador
    (multiplicidade: 2 cafes no OFX casam com no maximo 2 no PDF).
 3. Um candidato claro -> funde ('auto'). Ambiguo -> review_queue. Fonte secundaria
    sem par -> review_queue (nunca cria transacao sozinha).
 4. merge_decisions (manuais) vencem tudo e sobrevivem ao rebuild.
"""
from __future__ import annotations

import json
from datetime import date as Date

from src.finance.store import Store

WINDOW_DAYS = 3
# ordem de processamento = precedencia da descricao canonica (fonte oficial primeiro)
IMPORTER_RANK = {"pluggy": 0, "ofx": 1, "santander_cc_pdf": 1, "nubank_fatura_pdf": 1, "wise_csv": 1, "santander_csv": 9}


def record_key(row) -> str:
    return f"{row['importer']}|{row['account_key']}|{row['native_key']}"


def _days(a: str, b: str) -> int:
    return abs((Date.fromisoformat(a) - Date.fromisoformat(b)).days)


def _sim(a: str, b: str) -> float:
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def rebuild(store: Store) -> dict:
    db = store.db
    db.execute("DELETE FROM tx_links")
    db.execute("DELETE FROM transactions")
    db.execute("DELETE FROM review_queue")
    records = db.execute("SELECT * FROM source_records").fetchall()
    records.sort(key=lambda r: (IMPORTER_RANK.get(r["importer"], 5), r["account_key"], r["date"], r["id"]))
    by_key = {record_key(r): r for r in records}
    decisions = {row["record_key"]: row["target_record_key"] for row in db.execute("SELECT * FROM merge_decisions")}

    # estado em memoria: tx -> {importers}, indice por (conta, valor)
    tx_of_record: dict[int, int] = {}
    tx_importers: dict[int, set] = {}
    tx_rows: dict[int, dict] = {}
    index: dict[tuple, list[int]] = {}
    stats = {"records": len(records), "transactions": 0, "auto_merged": 0, "manual": 0, "queued": 0}

    def new_tx(r) -> int:
        cur = db.execute("INSERT INTO transactions (anchor_key, account_key, date, amount_cents, description, n_sources)"
                         " VALUES (?,?,?,?,?,1)", (record_key(r), r["account_key"], r["date"], r["amount_cents"], r["description"]))
        tid = cur.lastrowid
        tx_importers[tid] = {r["importer"]}
        tx_rows[tid] = {"date": r["date"], "desc_norm": r["desc_norm"]}
        index.setdefault((r["account_key"], r["amount_cents"]), []).append(tid)
        stats["transactions"] += 1
        return tid

    def link(r, tid: int, method: str, score: float | None) -> None:
        db.execute("INSERT INTO tx_links VALUES (?,?,?,?)", (r["id"], tid, method, score))
        tx_of_record[r["id"]] = tid
        if method != "anchor":
            tx_importers[tid].add(r["importer"])
            db.execute("UPDATE transactions SET n_sources = n_sources + 1 WHERE id=?", (tid,))

    pending_manual = []
    for r in records:
        key = record_key(r)
        if key in decisions:
            pending_manual.append(r)
            continue
        cands = []
        for tid in index.get((r["account_key"], r["amount_cents"]), []):
            if r["importer"] in tx_importers[tid]:
                continue
            d = _days(r["date"], tx_rows[tid]["date"])
            if d <= WINDOW_DAYS:
                cands.append((d, -_sim(r["desc_norm"], tx_rows[tid]["desc_norm"]), tid))
        cands.sort()  # empate exato = candidatos intercambiaveis (mesmo dia, valor e texto): vence o menor id
        if cands and (cands[0][0] == 0 or -cands[0][1] >= 0.2):
            d, negsim, tid = cands[0]
            link(r, tid, "auto", round(1.0 - d / (WINDOW_DAYS + 1) + -negsim, 3))
            stats["auto_merged"] += 1
        elif cands or r["secondary"]:
            reason = "par_fraco" if cands else "secundaria_sem_par"
            db.execute("INSERT INTO review_queue VALUES (?,?,?)",
                       (r["id"], reason, json.dumps([c[2] for c in cands])))
            stats["queued"] += 1
            if not r["secondary"]:
                # primario com par fraco vira transacao propria ate decidir (nao some do saldo; reconcile acusa)
                link(r, new_tx(r), "anchor", None)
        else:
            link(r, new_tx(r), "anchor", None)

    for r in pending_manual:
        target = decisions[record_key(r)]
        if target is None:  # decisao: e transacao nova
            link(r, new_tx(r), "anchor", None)
        elif target in by_key and by_key[target]["id"] in tx_of_record:
            link(r, tx_of_record[by_key[target]["id"]], "manual", 1.0)
        else:
            db.execute("INSERT INTO review_queue VALUES (?,?,?)", (r["id"], "decisao_orfa", "[]"))
            stats["queued"] += 1
            continue
        stats["manual"] += 1
    db.commit()
    return stats
