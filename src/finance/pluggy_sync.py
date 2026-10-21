"""Sincronizacao com o Meu Pluggy: bruto -> ingest -> pipeline. So leitura na Pluggy.

Por item (banco): se `lastUpdatedAt` nao mudou desde a ultima vez, nao baixa nada.
Incremental: transacoes desde (ultima data vista - 10 dias); semanalmente, leitura
completa dos ~12 meses (o Open Finance reescreve dias antigos a cada 7 dias).
Investimentos: snapshot da posicao em investment_snapshots (o historico de posicao so
existe porque guardamos um snapshot a cada atualizacao).
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from src.finance import pipeline
from src.finance.importers.pluggy import account_ref, cents, local_date
from src.finance.ingest import ingest_bytes
from src.finance.pluggy_client import Pluggy, PluggyError
from src.finance.store import Store, now

FULL_EVERY_DAYS = 7
OVERLAP_DAYS = 10


def institution_of(accounts: list[dict]) -> str:
    names = " ".join(f"{a.get('name', '')} {a.get('marketingName', '')}" for a in accounts).lower()
    if "nu pagamentos" in names or "nubank" in names or "ultraviolet" in names:
        return "nubank"
    if "santander" in names:
        return "santander"
    if "caixa" in names:
        return "caixa"
    if accounts and all(len(a.get("name") or "") == 3 and (a.get("name") or "").isupper() for a in accounts if a.get("type") == "BANK"):
        return "wise"  # contas por moeda (ILS, EUR, ...)
    return "pluggy"


def _blob(store: Store, name: str, doc: dict) -> dict:
    # sem horario de busca no conteudo: resposta identica = mesmo sha = nada duplicado no raw/
    return ingest_bytes(store, name, json.dumps(doc, ensure_ascii=False, sort_keys=True).encode())


def _snapshot_investments(store: Store, item_id: str, inst: str, sha: str, day: str, results: list[dict]) -> int:
    db = store.db
    n = 0
    for inv in results:
        db.execute("INSERT INTO investments (id, item_id, institution, type, subtype, name, code, currency, updated_at)"
                   " VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type, subtype=excluded.subtype,"
                   " name=excluded.name, updated_at=excluded.updated_at",
                   (inv["id"], item_id, inst, inv.get("type"), inv.get("subtype"), inv.get("name"), inv.get("code"),
                    inv.get("currencyCode") or "BRL", now()))
        db.execute("INSERT OR REPLACE INTO investment_snapshots VALUES (?,?,?,?,?,?)",
                   (inv["id"], day, cents(inv.get("balance") or 0),
                    cents(inv["amountOriginal"]) if inv.get("amountOriginal") is not None else None,
                    inv.get("status"), sha))
        n += 1
    db.commit()
    return n


def sync_item(store: Store, p: Pluggy, item_id: str, force_full: bool = False) -> dict:
    db = store.db
    item = p.get(f"/items/{item_id}")
    last = item.get("lastUpdatedAt")
    prev = db.execute("SELECT * FROM pluggy_items WHERE item_id=?", (item_id,)).fetchone()
    full_due = not prev or not prev["last_full_at"] or \
        datetime.fromisoformat(prev["last_full_at"]) < datetime.now(timezone.utc) - timedelta(days=FULL_EVERY_DAYS)
    out = {"item": item_id, "status": item.get("status"), "last_updated": last, "consent_expires": item.get("consentExpiresAt")}
    if prev and prev["last_updated"] == last and not force_full and not full_due:
        out["skipped"] = "banco nao atualizou desde a ultima sincronizacao"
        db.execute("UPDATE pluggy_items SET checked_at=?, status=? WHERE item_id=?", (now(), item.get("status"), item_id))
        db.commit()
        return out
    accounts = p.get("/accounts", itemId=item_id).get("results", [])
    inst = institution_of(accounts)
    full = force_full or full_due
    out.update(institution=inst, full=full, accounts=[])
    for acc in accounts:
        ref = account_ref(inst, acc)
        since: Optional[str] = None
        if not full:
            row = db.execute("SELECT max(date) d FROM source_records WHERE importer='pluggy' AND account_key=?", (ref.key,)).fetchone()
            if row["d"]:
                since = (date.fromisoformat(row["d"]) - timedelta(days=OVERLAP_DAYS)).isoformat()
        txs = [] if inst == "wise" else list(p.transactions(acc["id"], since))
        bills = list(p.pages("/bills", accountId=acc["id"])) if acc.get("type") == "CREDIT" else []
        doc = {"_source": "pluggy", "kind": "account", "item": item_id, "institution": inst, "item_last_updated": last,
               "since": since, "account": acc, "transactions": txs, "bills": bills}
        res = _blob(store, f"pluggy/{inst}/{acc['id']}-{(last or '')[:19].replace(':', '')}.json", doc)
        out["accounts"].append({"account": ref.key, "transactions": len(txs), "new_records": res.get("new_records", 0),
                                "status": res["status"], "error": res.get("error")})
    try:
        invs = list(p.pages("/investments", itemId=item_id))
    except PluggyError as exc:
        invs, out["investments_error"] = [], str(exc)[:200]
    if invs:
        raw = json.dumps({"_source": "pluggy-investments", "item": item_id, "item_last_updated": last, "results": invs},
                         ensure_ascii=False, sort_keys=True).encode()
        sha, _ = store.put_blob(f"pluggy/{inst}/investments-{item_id}-{(last or '')[:19].replace(':', '')}.json", raw)
        db.execute("UPDATE raw_blobs SET importer='pluggy', status='parsed', n_records=0 WHERE sha256=?", (sha,))
        out["investments"] = _snapshot_investments(store, item_id, inst, sha, local_date(last) if last else date.today().isoformat(), invs)
    db.execute("INSERT INTO pluggy_items (item_id, institution, status, last_updated, consent_expires, synced_at, last_full_at, checked_at)"
               " VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET institution=excluded.institution, status=excluded.status,"
               " last_updated=excluded.last_updated, consent_expires=excluded.consent_expires, synced_at=excluded.synced_at,"
               " last_full_at=coalesce(excluded.last_full_at, pluggy_items.last_full_at), checked_at=excluded.checked_at",
               (item_id, inst, item.get("status"), last, item.get("consentExpiresAt"), now(), now() if full else None, now()))
    db.commit()
    return out


def configured() -> bool:
    return bool(os.environ.get("PLUGGY_CLIENT_ID") and os.environ.get("PLUGGY_CLIENT_SECRET") and os.environ.get("PLUGGY_ITEM_IDS"))


def sync(store: Store, force_full: bool = False) -> dict:
    ids = [i.strip() for i in os.environ.get("PLUGGY_ITEM_IDS", "").split(",") if i.strip()]
    p = Pluggy(os.environ["PLUGGY_CLIENT_ID"], os.environ["PLUGGY_CLIENT_SECRET"])
    items = []
    try:
        for item_id in ids:
            try:
                items.append(sync_item(store, p, item_id, force_full))
            except PluggyError as exc:
                items.append({"item": item_id, "error": str(exc)[:300]})
    finally:
        p.close()
    changed = any(not i.get("skipped") and not i.get("error") for i in items)
    return {"items": items, **(pipeline.refresh(store) if changed else {})}
