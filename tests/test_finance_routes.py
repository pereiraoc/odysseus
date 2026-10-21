"""Fork-local: rotas do painel Finanças (routes/finance_routes.py)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.test_finance_core import ofx


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    monkeypatch.setenv("FINANCE_DATA_DIR", str(tmp_path / "finance"))
    import routes.finance_routes as fr
    app = FastAPI()
    app.include_router(fr.setup_finance_routes())
    return TestClient(app)


def test_empty_meta(client):
    r = client.get("/api/finance/meta")
    assert r.status_code == 200 and r.json()["available"] is False


def test_import_then_browse_and_download(client):
    data = ofx("9-9", [("20230110", "-10.00", "a", "Padaria"), ("20230115", "25.00", "b", "Pix")], bal=("20230131", "115.00"))
    r = client.post("/api/finance/import", files=[("files", ("jan.ofx", data, "application/octet-stream"))])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["results"][0]["new_records"] == 2 and body["ledger"]["assertions"] == 1
    meta = client.get("/api/finance/meta").json()
    acc = meta["accounts"][0]
    assert acc["status"] == "ok" and acc["balance"] == 11500
    tx = client.get("/api/finance/transactions", params={"account": acc["key"], "q": "Pada"}).json()
    assert tx["total"] == 1 and tx["rows"][0]["sources"][0]["importer"] == "ofx"
    files = client.get("/api/finance/files").json()["files"]
    raw = client.get(f"/api/finance/raw/{files[0]['sha256']}")
    assert raw.content == data
    assert client.get("/api/finance/balances").json()["series"][acc["key"]][-1]["balance"] == 11500
    # reimportar nao duplica
    again = client.post("/api/finance/import", files=[("files", ("copia.ofx", data, "application/octet-stream"))]).json()
    assert again["results"][0]["new_records"] == 0


def test_queue_decision(client):
    client.post("/api/finance/import", files=[("files", ("n.ofx", ofx("000012345678", [("20230105", "-5.00", "000000", "CAFE")], bank="0033"), "x"))])
    client.post("/api/finance/import", files=[("files", ("SANTANDER_2023_01_DESPESAS.csv", "Data,Descrição,Valor\n20/01,OUTRA,5.0\n".encode(), "text/csv"))])
    audit = client.get("/api/finance/audit").json()
    assert len(audit["queue"]) == 1
    item = audit["queue"][0]
    r = client.post(f"/api/finance/queue/{item['record_id']}", json={"target_tx_id": None})
    assert r.status_code == 200 and r.json()["rebuild"]["manual"] == 1
    assert client.get("/api/finance/audit").json()["queue"] == []


def test_raw_rejects_bad_sha(client):
    assert client.get("/api/finance/raw/..%2f..%2fetc").status_code in (400, 404)


def test_rules_categories_and_manual_override(client, tmp_path):
    import json
    data = ofx("9-9", [("20230110", "-10.00", "a", "Compra no débito - Padaria Central"),
                       ("20230111", "-20.00", "b", "Compra no débito - Mercado X")], bal=("20230131", "70.00"))
    client.post("/api/finance/import", files=[("files", ("jan.ofx", data, "x"))])
    (tmp_path / "finance" / "ledger" / "rules.json").write_text(json.dumps({"rules": [
        {"id": "mercado", "priority": 600, "when": {"text_any": ["mercado"]}, "then": {"category": "alimentacao:mercado"}}]}))
    client.post("/api/finance/import", files=[("files", ("jan.ofx", data, "x"))])  # reimport -> reaplica regras
    rl = client.get("/api/finance/rules").json()
    assert rl["rules"][0]["hits"] == 1 and rl["coverage"] == 0.5
    cats = {c["category"]: c for c in client.get("/api/finance/categories").json()["categories"]}
    assert cats["alimentacao:mercado"]["total"] == -2000 and cats["(sem)"]["count"] == 1
    assert client.get("/api/finance/uncategorized").json()["groups"][0]["merchant"] == "padaria central"
    tx = client.get("/api/finance/transactions", params={"category": "(sem)"}).json()["rows"][0]
    r = client.post(f"/api/finance/tx/{tx['id']}/category", json={"category": "Alimentacao: Padaria"}).json()
    assert r["category"] == "alimentacao:padaria" and r["coverage"] == 1.0
    tx = client.get("/api/finance/transactions", params={"category": "alimentacao"}).json()
    assert tx["total"] == 2


def test_review_and_assign(client):
    data = ofx("9-9", [("20260105", "-150.00", "a", "Transferência enviada pelo Pix - Márcia Steemburgo - x"),
                       ("20260106", "-30.00", "b", "Padaria")], bal=("20260131", "0.00"))
    client.post("/api/finance/import", files=[("files", ("jan.ofx", data, "x"))])
    q = client.get("/api/finance/review", params={"months": 0}).json()
    assert q["items"][0]["merchant"] == "marcia steemburgo" and q["items"][0]["sign"] == "debit"
    r = client.post("/api/finance/review/assign", json={"merchant": "marcia steemburgo", "sign": "debit", "category": "Moradia: Diarista"}).json()
    assert r["hits"] == 1 and r["rule"]["then"]["category"] == "moradia:diarista"
    assert [i["merchant"] for i in client.get("/api/finance/review", params={"months": 0}).json()["items"]] == ["padaria"]
