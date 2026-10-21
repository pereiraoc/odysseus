"""Ingestao: bruto -> raw_blobs -> parse -> source_records/checkpoints. Idempotente.

Reimportar o mesmo arquivo (mesmo sha256) ou outro arquivo com as mesmas transacoes
nao cria nada novo: a chave (importer, conta, native_key) e estavel.
native_key = id nativo confiavel (FITID, TransferWise ID, id Pluggy) ou, sem ele,
'c:<data>|<valor>|<descricao normalizada>|<n>' com n = ocorrencia daquela tripla no
arquivo (dois cafes iguais no mesmo dia sao 2 registros, nao 1).
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Iterable, Optional

from src.finance.importers import parse_file
from src.finance.importers.base import ParsedFile, ParseError
from src.finance.money import norm_desc
from src.finance.store import Store, now


def native_keys(parsed: ParsedFile) -> list[str]:
    seen: Counter = Counter()
    keys = []
    for r in parsed.records:
        if r.native_id:
            keys.append(f"id:{r.native_id}")
            continue
        triple = (r.date, r.amount_cents, norm_desc(r.description))
        keys.append(f"c:{triple[0]}|{triple[1]}|{triple[2]}|{seen[triple]}")
        seen[triple] += 1
    return keys


def _resolve_account(store: Store, parsed: ParsedFile) -> None:
    """Fonte sem numero de conta (planilha): usa a unica conta conhecida daquela instituicao/tipo/moeda."""
    acc = parsed.account
    if acc.number:
        return
    rows = store.db.execute("SELECT number FROM accounts WHERE institution=? AND kind=? AND currency=?",
                            (acc.institution, acc.kind, acc.currency)).fetchall()
    if len(rows) != 1:
        raise ParseError(f"arquivo sem numero de conta e {len(rows)} contas {acc.institution}/{acc.kind} conhecidas")
    acc.number = rows[0]["number"]


def store_parsed(store: Store, sha: str, parsed: ParsedFile) -> int:
    db = store.db
    _resolve_account(store, parsed)
    acc = parsed.account
    db.execute("INSERT OR IGNORE INTO accounts VALUES (?,?,?,?,?,?)",
               (acc.key, acc.institution, acc.kind, acc.number, acc.currency, acc.name))
    db.execute("DELETE FROM record_blobs WHERE sha256=?", (sha,))
    db.execute("DELETE FROM checkpoints WHERE sha256=?", (sha,))
    db.execute("DELETE FROM import_warnings WHERE sha256=?", (sha,))
    new = 0
    for rec, nk in zip(parsed.records, native_keys(parsed)):
        cur = db.execute(
            "INSERT OR IGNORE INTO source_records (importer, account_key, native_key, native_id, date, amount_cents,"
            " description, desc_norm, kind, extra_json, secondary, first_blob, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (parsed.importer, acc.key, nk, rec.native_id, rec.date, rec.amount_cents, rec.description,
             norm_desc(rec.description), rec.kind, store.json(rec.extra) if rec.extra else None,
             int(parsed.secondary), sha, now()))
        new += cur.rowcount
        rid = db.execute("SELECT id FROM source_records WHERE importer=? AND account_key=? AND native_key=?",
                         (parsed.importer, acc.key, nk)).fetchone()["id"]
        db.execute("INSERT OR IGNORE INTO record_blobs VALUES (?, ?)", (rid, sha))
    for cp in parsed.checkpoints:
        db.execute("INSERT OR IGNORE INTO checkpoints (account_key, date, balance_cents, kind, note, sha256) VALUES (?,?,?,?,?,?)",
                   (acc.key, cp.date, cp.balance_cents, cp.kind, cp.note, sha))
    for w in parsed.warnings:
        db.execute("INSERT OR IGNORE INTO import_warnings VALUES (?, ?)", (sha, w))
    # registros que nenhum bruto sustenta mais (parser mudou) saem: sao derivados do raw/
    db.execute("DELETE FROM source_records WHERE id NOT IN (SELECT record_id FROM record_blobs)")
    db.execute("UPDATE raw_blobs SET importer=?, parse_version=?, status='parsed', error=NULL, account_key=?,"
               " period_start=?, period_end=?, n_records=? WHERE sha256=?",
               (parsed.importer, parsed.parse_version, acc.key, parsed.period_start, parsed.period_end,
                len(parsed.records), sha))
    return new


def ingest_bytes(store: Store, name: str, data: bytes, pdf_password: Optional[str] = None) -> dict:
    sha, is_new = store.put_blob(name, data)
    store.db.commit()  # o bruto fica registrado mesmo se o parse falhar
    try:
        parsed = parse_file(name, data, pdf_password)
        new = store_parsed(store, sha, parsed)
    except Exception as exc:  # qualquer falha de parser: bruto fica guardado, status=error, nada parcial
        store.db.rollback()
        msg = str(exc) if isinstance(exc, ParseError) else f"{type(exc).__name__}: {exc}"
        store.db.execute("UPDATE raw_blobs SET status='error', error=? WHERE sha256=?", (msg, sha))
        store.db.commit()
        return {"name": name, "sha256": sha, "new_blob": is_new, "status": "error", "error": msg}
    store.db.commit()
    return {"name": name, "sha256": sha, "new_blob": is_new, "status": "parsed", "importer": parsed.importer,
            "account": parsed.account.key, "records": len(parsed.records), "new_records": new,
            "warnings": parsed.warnings}


def iter_files(paths: Iterable[str | Path]) -> Iterable[Path]:
    for p in map(Path, paths):
        if p.is_dir():
            yield from sorted(x for x in p.rglob("*") if x.is_file() and not x.name.startswith("."))
        elif p.is_file():
            yield p


def ingest_paths(store: Store, paths: Iterable[str | Path], pdf_password: Optional[str] = None,
                 root: Optional[Path] = None) -> list[dict]:
    out = []
    for f in iter_files(paths):
        name = str(f.relative_to(root)) if root and f.is_relative_to(root) else f.name
        out.append(ingest_bytes(store, name, f.read_bytes(), pdf_password))
    return out


def reparse_all(store: Store, pdf_password: Optional[str] = None, only_errors: bool = False) -> list[dict]:
    """Reprocessa o raw/ (ex.: parser corrigido). Nada se perde: o bruto e a fonte."""
    out = []
    where = " WHERE status='error'" if only_errors else ""
    for row in store.db.execute(f"SELECT sha256, source_name FROM raw_blobs{where} ORDER BY first_seen_at").fetchall():
        out.append(ingest_bytes(store, row["source_name"], store.blob_bytes(row["sha256"]), pdf_password))
    return out
