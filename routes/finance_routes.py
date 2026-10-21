"""Fork-local (ver LOCAL_CHANGES.md §7): painel "Finanças" -- arquivo bancario vitalicio.

Le e escreve data/finance/ (src/finance): bruto imutavel, registros por fonte,
livro canonico reconstruivel e export hledger. Spec:
docs/superpowers/specs/2026-10-20-financas-design.md

Rotas (todas exigem usuario):
  GET  /api/finance/meta           contas com saldo, periodo e status da conferencia
  GET  /api/finance/balances       saldo de fim de mes por conta (serie)
  GET  /api/finance/transactions   livro canonico (filtros: conta, busca, periodo) + fontes
  GET  /api/finance/audit          conferencia por conta, fila de revisao, erros e avisos de import
  GET  /api/finance/files          arquivos brutos importados
  GET  /api/finance/raw/{sha}      baixa o arquivo original exatamente como entrou
  POST /api/finance/import         upload de arquivos -> ingest + rebuild + export do ledger
  POST /api/finance/queue/{id}     decide um item da fila (mesclar com outro registro ou manter separado)
  POST /api/finance/sync/wise      puxa saldos/statements do Wise (env WISE_API_TOKEN, token Read only)
"""
from __future__ import annotations

import asyncio
import json
import os
from bisect import bisect_right
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from src.auth_helpers import require_user
from src.finance import dedup, reconcile
from src.finance.ingest import ingest_bytes, reparse_all
from src.finance.ledger import export as export_ledger
from src.finance.store import Store, now

MAX_UPLOAD = 50 * 1024 * 1024
_lock = asyncio.Lock()  # import/rebuild sao sequenciais (um so escritor no SQLite)


def _store() -> Store:
    return Store()


def _month_ends(first: str, last: str) -> list[str]:
    import calendar
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= last[:7]:
        out.append(f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _series(store: Store, key: str) -> list[dict]:
    """Saldo no fim de cada mes: ancora do primeiro checkpoint + soma do livro canonico."""
    txs = store.db.execute("SELECT date, amount_cents FROM transactions WHERE account_key=? ORDER BY date, id", (key,)).fetchall()
    if not txs:
        return []
    rec = reconcile.reconcile_balances(store, key)
    dates, cum, total = [], [], 0
    for t in txs:
        total += t["amount_cents"]
        dates.append(t["date"])
        cum.append(total)

    def until(d: str) -> int:
        i = bisect_right(dates, d)
        return cum[i - 1] if i else 0

    base = 0
    if rec.get("anchor"):
        base = rec["anchor"]["balance_cents"] - until(rec["anchor"]["date"])
    # lacunas conhecidas entram como ajuste a partir da data em que foram medidas (igual ao ledger)
    gaps = [(b["until"], -b["delta"]) for b in rec.get("breaks", [])]
    out = []
    for d in _month_ends(dates[0], dates[-1]):
        adj = sum(v for gd, v in gaps if gd <= d)
        out.append({"date": d, "balance": base + until(d) + adj})
    return out


def _account_rows(store: Store) -> list[dict]:
    rows = []
    for acc in store.db.execute("SELECT * FROM accounts ORDER BY institution, kind, currency").fetchall():
        key = acc["key"]
        stats = store.db.execute("SELECT count(*) n, min(date) first, max(date) last FROM transactions WHERE account_key=?",
                                 (key,)).fetchone()
        if not stats["n"]:
            continue
        if acc["kind"] == "credit_card":
            rep = reconcile.reconcile_bills(store, key)
            last_bill = store.db.execute(
                "SELECT c.balance_cents, c.date FROM checkpoints c WHERE c.account_key=? AND c.kind='closing'"
                " ORDER BY c.date DESC LIMIT 1", (key,)).fetchone()
            balance = last_bill["balance_cents"] if last_bill else None
            balance_date = last_bill["date"] if last_bill else None
            problems = len(rep["unbalanced"]) + len(rep["chain_breaks"])
        else:
            rep = reconcile.reconcile_balances(store, key)
            series = _series(store, key)
            balance = series[-1]["balance"] if series else None
            balance_date = stats["last"]
            problems = len(rep["breaks"])
        rows.append({"key": key, "institution": acc["institution"], "kind": acc["kind"], "currency": acc["currency"],
                     "number": acc["number"], "name": acc["name"] or "", "transactions": stats["n"],
                     "first": stats["first"], "last": stats["last"], "balance": balance, "balance_date": balance_date,
                     "status": rep["status"], "problems": problems})
    return rows


class Decision(BaseModel):
    target_tx_id: Optional[int] = None   # transacao canonica com que mesclar; None = manter separado
    note: str = ""


def setup_finance_routes() -> APIRouter:
    router = APIRouter(prefix="/api/finance", tags=["finance"])

    @router.get("/meta")
    def meta(_user: str = Depends(require_user)):
        store = _store()
        try:
            accounts = _account_rows(store)
            files = store.db.execute("SELECT status, count(*) n FROM raw_blobs GROUP BY status").fetchall()
            last = store.db.execute("SELECT max(first_seen_at) FROM raw_blobs").fetchone()[0]
            queue = store.db.execute("SELECT count(*) FROM review_queue").fetchone()[0]
            return {"available": bool(accounts), "root": str(store.root), "accounts": accounts,
                    "files": {r["status"]: r["n"] for r in files}, "last_import": last, "queue": queue,
                    "pluggy_configured": bool(os.environ.get("PLUGGY_CLIENT_ID")),
                    "wise_configured": bool(os.environ.get("WISE_API_TOKEN"))}
        finally:
            store.close()

    @router.get("/balances")
    def balances(_user: str = Depends(require_user)):
        store = _store()
        try:
            out = {}
            for acc in store.db.execute("SELECT key, kind FROM accounts WHERE kind != 'credit_card'").fetchall():
                s = _series(store, acc["key"])
                if s:
                    out[acc["key"]] = s
            return {"series": out}
        finally:
            store.close()

    @router.get("/transactions")
    def transactions(account: str = "", q: str = "", date_from: str = Query("", alias="from"),
                     date_to: str = Query("", alias="to"), limit: int = Query(200, le=2000), offset: int = 0,
                     _user: str = Depends(require_user)):
        store = _store()
        try:
            where, args = [], []
            if account:
                where.append("t.account_key = ?"); args.append(account)
            if q:
                where.append("t.description LIKE ?"); args.append(f"%{q}%")
            if date_from:
                where.append("t.date >= ?"); args.append(date_from)
            if date_to:
                where.append("t.date <= ?"); args.append(date_to)
            w = ("WHERE " + " AND ".join(where)) if where else ""
            total = store.db.execute(f"SELECT count(*), coalesce(sum(amount_cents),0) FROM transactions t {w}", args).fetchone()
            rows = store.db.execute(
                f"SELECT t.*, a.category FROM transactions t LEFT JOIN annotations a ON a.anchor_key=t.anchor_key {w}"
                " ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?", [*args, limit, offset]).fetchall()
            ids = [r["id"] for r in rows]
            sources: dict[int, list] = {}
            if ids:
                marks = ",".join("?" * len(ids))
                for s in store.db.execute(
                        f"SELECT l.tx_id, l.method, s.importer, s.description, s.date, s.first_blob, s.kind"
                        f" FROM tx_links l JOIN source_records s ON s.id=l.record_id WHERE l.tx_id IN ({marks})", ids):
                    sources.setdefault(s["tx_id"], []).append({k: s[k] for k in ("method", "importer", "description", "date", "first_blob", "kind")})
            return {"total": total[0], "sum": total[1], "rows": [{**dict(r), "sources": sources.get(r["id"], [])} for r in rows]}
        finally:
            store.close()

    @router.get("/audit")
    def audit(_user: str = Depends(require_user)):
        store = _store()
        try:
            queue = [dict(r) for r in store.db.execute(
                "SELECT q.record_id, q.reason, q.candidates_json, s.importer, s.account_key, s.date, s.amount_cents,"
                " s.description FROM review_queue q JOIN source_records s ON s.id=q.record_id ORDER BY s.account_key, s.date")]
            for item in queue:
                cands = json.loads(item.pop("candidates_json") or "[]")
                item["candidates"] = [dict(r) for r in store.db.execute(
                    f"SELECT id, date, amount_cents, description FROM transactions WHERE id IN ({','.join('?' * len(cands))})",
                    cands)] if cands else []
            errors = [dict(r) for r in store.db.execute(
                "SELECT sha256, source_name, error FROM raw_blobs WHERE status='error' ORDER BY source_name")]
            warnings = [dict(r) for r in store.db.execute(
                "SELECT w.sha256, b.source_name, w.message FROM import_warnings w JOIN raw_blobs b ON b.sha256=w.sha256")]
            return {"accounts": reconcile.report(store), "queue": queue, "errors": errors, "warnings": warnings}
        finally:
            store.close()

    @router.get("/files")
    def files(_user: str = Depends(require_user)):
        store = _store()
        try:
            return {"files": [dict(r) for r in store.db.execute(
                "SELECT sha256, source_name, size, first_seen_at, importer, status, error, account_key, period_start,"
                " period_end, n_records FROM raw_blobs ORDER BY source_name")]}
        finally:
            store.close()

    @router.get("/raw/{sha}")
    def raw(sha: str, _user: str = Depends(require_user)):
        if not sha.isalnum() or len(sha) != 64:
            raise HTTPException(400, "sha invalido")
        store = _store()
        try:
            row = store.db.execute("SELECT source_name FROM raw_blobs WHERE sha256=?", (sha,)).fetchone()
            if not row:
                raise HTTPException(404, "arquivo nao encontrado")
            name = os.path.basename(row["source_name"]).replace('"', "")
            return Response(store.blob_bytes(sha), media_type="application/octet-stream",
                            headers={"Content-Disposition": f'attachment; filename="{name}"'})
        finally:
            store.close()

    @router.post("/import")
    async def import_files(files: list[UploadFile] = File(...), _user: str = Depends(require_user)):
        payload = []
        for f in files:
            data = await f.read(MAX_UPLOAD + 1)
            if len(data) > MAX_UPLOAD:
                raise HTTPException(413, f"{f.filename}: maior que 50 MB")
            payload.append((os.path.basename(f.filename or "arquivo"), data))
        async with _lock:
            def work():
                store = _store()
                try:
                    pw = os.environ.get("FINANCE_PDF_PASSWORD") or None
                    res = [ingest_bytes(store, name, data, pw) for name, data in payload]
                    retry = {r["sha256"]: r for r in reparse_all(store, pw, only_errors=True)}
                    res = [retry.get(r["sha256"], r) for r in res]
                    stats = dedup.rebuild(store)
                    ledger = export_ledger(store)
                    return {"results": res, "rebuild": stats, "ledger": ledger}
                finally:
                    store.close()
            return await asyncio.to_thread(work)

    @router.post("/queue/{record_id}")
    async def decide(record_id: int, body: Decision, _user: str = Depends(require_user)):
        async with _lock:
            def work():
                store = _store()
                try:
                    rec = store.db.execute("SELECT * FROM source_records WHERE id=?", (record_id,)).fetchone()
                    if not rec:
                        raise HTTPException(404, "registro nao encontrado")
                    target = None
                    if body.target_tx_id is not None:
                        t = store.db.execute("SELECT anchor_key, account_key FROM transactions WHERE id=?",
                                             (body.target_tx_id,)).fetchone()
                        if not t or t["account_key"] != rec["account_key"]:
                            raise HTTPException(400, "alvo invalido (precisa ser da mesma conta)")
                        target = t["anchor_key"]  # chave estavel do registro ancora
                    store.db.execute("INSERT OR REPLACE INTO merge_decisions VALUES (?,?,?,?)",
                                     (dedup.record_key(rec), target, now(), body.note))
                    store.db.commit()
                    stats = dedup.rebuild(store)
                    export_ledger(store)
                    return {"ok": True, "rebuild": stats}
                finally:
                    store.close()
            return await asyncio.to_thread(work)

    @router.post("/sync/wise")
    async def sync_wise(_user: str = Depends(require_user)):
        token = os.environ.get("WISE_API_TOKEN")
        if not token:
            raise HTTPException(400, "WISE_API_TOKEN nao configurado")
        async with _lock:
            def work():
                from src.finance import wise_api
                store = _store()
                try:
                    res = wise_api.sync(store, token)
                    res["rebuild"] = dedup.rebuild(store)
                    res["ledger"] = export_ledger(store)
                    return res
                finally:
                    store.close()
            try:
                return await asyncio.to_thread(work)
            except RuntimeError as exc:
                raise HTTPException(502, str(exc)) from exc

    return router
