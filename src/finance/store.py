"""SQLite proprio do modulo (data/finance/finance.sqlite) + bruto imutavel (data/finance/raw/).

Camadas:
  raw_blobs / raw/      arquivo exatamente como veio, por sha256 (nunca editado)
  source_records        uma linha por transacao de cada fonte; chave estavel (importer, conta, native_key)
  record_blobs          em quais arquivos cada source_record apareceu (proveniencia)
  transactions/tx_links livro canonico DERIVADO: dedup.rebuild() recria do zero
  merge_decisions       decisoes manuais da fila de revisao (sobrevivem ao rebuild)
  annotations           categoria/nota por anchor_key estavel (sobrevive ao rebuild)
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_blobs (
  sha256 TEXT PRIMARY KEY, source_name TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, importer TEXT, parse_version INTEGER, status TEXT NOT NULL,
  error TEXT, account_key TEXT, period_start TEXT, period_end TEXT, n_records INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS blob_names (sha256 TEXT NOT NULL, source_name TEXT NOT NULL, PRIMARY KEY (sha256, source_name));
CREATE TABLE IF NOT EXISTS accounts (
  key TEXT PRIMARY KEY, institution TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
  currency TEXT NOT NULL, name TEXT
);
CREATE TABLE IF NOT EXISTS source_records (
  id INTEGER PRIMARY KEY, importer TEXT NOT NULL, account_key TEXT NOT NULL, native_key TEXT NOT NULL,
  native_id TEXT, date TEXT NOT NULL, amount_cents INTEGER NOT NULL, description TEXT NOT NULL,
  desc_norm TEXT NOT NULL, kind TEXT, extra_json TEXT, secondary INTEGER NOT NULL DEFAULT 0,
  first_blob TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (importer, account_key, native_key)
);
CREATE INDEX IF NOT EXISTS ix_sr_match ON source_records (account_key, amount_cents, date);
CREATE TABLE IF NOT EXISTS record_blobs (record_id INTEGER NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY (record_id, sha256));
CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY, account_key TEXT NOT NULL, date TEXT NOT NULL, balance_cents INTEGER NOT NULL,
  kind TEXT NOT NULL, note TEXT, sha256 TEXT NOT NULL,
  UNIQUE (account_key, date, kind, balance_cents, sha256)
);
CREATE TABLE IF NOT EXISTS import_warnings (sha256 TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY (sha256, message));
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY, anchor_key TEXT NOT NULL UNIQUE, account_key TEXT NOT NULL, date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, description TEXT NOT NULL, n_sources INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tx_match ON transactions (account_key, amount_cents, date);
CREATE TABLE IF NOT EXISTS tx_links (record_id INTEGER PRIMARY KEY, tx_id INTEGER NOT NULL, method TEXT NOT NULL, score REAL);
CREATE TABLE IF NOT EXISTS review_queue (
  record_id INTEGER PRIMARY KEY, reason TEXT NOT NULL, candidates_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS merge_decisions (
  -- chaves estaveis 'importer|account_key|native_key' (ids mudam em reparse; isto nao)
  record_key TEXT PRIMARY KEY, target_record_key TEXT, decided_at TEXT NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS pluggy_items (
  item_id TEXT PRIMARY KEY, institution TEXT, status TEXT, last_updated TEXT, consent_expires TEXT,
  synced_at TEXT, last_full_at TEXT, checked_at TEXT
);
CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY, item_id TEXT, institution TEXT, type TEXT, subtype TEXT, name TEXT, code TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL', updated_at TEXT
);
CREATE TABLE IF NOT EXISTS investment_snapshots (
  investment_id TEXT NOT NULL, date TEXT NOT NULL, balance_cents INTEGER NOT NULL, original_cents INTEGER,
  status TEXT, sha256 TEXT NOT NULL, PRIMARY KEY (investment_id, date)
);
CREATE TABLE IF NOT EXISTS transfer_pairs (tx_a INTEGER NOT NULL, tx_b INTEGER NOT NULL, PRIMARY KEY (tx_a, tx_b));
CREATE TABLE IF NOT EXISTS annotations (
  anchor_key TEXT PRIMARY KEY, category TEXT, note TEXT, manual INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_root() -> Path:
    env = os.environ.get("FINANCE_DATA_DIR")
    if env:
        return Path(env)
    for cand in (Path("/app/data/finance"), Path(__file__).resolve().parents[2] / "data" / "finance"):
        if cand.parent.is_dir():
            return cand
    return Path("data/finance")


class Store:
    def __init__(self, root: Path | str | None = None):
        self.root = Path(root) if root else default_root()
        (self.root / "raw").mkdir(parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)  # historico bancario: so o dono le
        self.db = sqlite3.connect(self.root / "finance.sqlite", timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA)

    def close(self) -> None:
        self.db.close()

    # --- bruto imutavel -------------------------------------------------
    def put_blob(self, source_name: str, data: bytes) -> tuple[str, bool]:
        """Grava o arquivo em raw/<aa>/<sha256><ext> se ainda nao existir. Retorna (sha, novo?)."""
        sha = hashlib.sha256(data).hexdigest()
        self.db.execute("INSERT OR IGNORE INTO blob_names VALUES (?, ?)", (sha, source_name))
        row = self.db.execute("SELECT 1 FROM raw_blobs WHERE sha256=?", (sha,)).fetchone()
        if row:
            return sha, False
        ext = Path(source_name).suffix.lower()[:8]
        rel = Path("raw") / sha[:2] / f"{sha}{ext}"
        dest = self.root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            tmp = dest.with_suffix(dest.suffix + ".tmp")
            tmp.write_bytes(data)
            os.chmod(tmp, 0o440)
            tmp.replace(dest)
        self.db.execute(
            "INSERT INTO raw_blobs (sha256, source_name, size, path, first_seen_at, status) VALUES (?,?,?,?,?, 'stored')",
            (sha, source_name, len(data), str(rel), now()))
        return sha, True

    def blob_bytes(self, sha: str) -> bytes:
        row = self.db.execute("SELECT path FROM raw_blobs WHERE sha256=?", (sha,)).fetchone()
        data = (self.root / row["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != sha:
            raise RuntimeError(f"bruto corrompido: {sha}")
        return data

    def json(self, obj) -> str:
        return json.dumps(obj, ensure_ascii=False, sort_keys=True)
