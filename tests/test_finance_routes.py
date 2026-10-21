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
