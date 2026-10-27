"""Fork-local: grupo Trading (routes/trading_routes.py) -- proxy para o Trading Lab."""
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    import routes.trading_routes as tr
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        if request.url.path == "/health":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(200, json={"id": 7})

    monkeypatch.setattr(tr, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(tr, "_endpoint_row", lambda eid, owner: {
        "id": eid, "base_url": "http://localhost:8000/v1", "api_key": "sk-x", "name": "Local"})
    monkeypatch.setattr(tr, "_presets", lambda: [{"name": "Qwen3.6", "model": "unsloth/Qwen3.6-35B-A3B-GGUF", "port": "8000"}])
    monkeypatch.setattr(tr, "_serving", lambda port: [])
    app = FastAPI()
    app.include_router(tr.setup_trading_routes())
    return TestClient(app), seen, tr


def test_local_alias():
    import routes.trading_routes as tr
    assert tr.local_alias("http://localhost:8000/v1") == "http://odysseus:8000/v1"
    assert tr.local_alias("https://api.z.ai/api/paas/v4") == "https://api.z.ai/api/paas/v4"


def test_job_gets_model_and_key_injected(setup):
    c, seen, _ = setup
    r = c.post("/api/trading/lab/jobs", json={"ticker": "NVDA", "date": "2026-06-01",
                                              "endpoint_id": "e1", "model_name": "qwen"})
    assert r.status_code == 200 and r.json() == {"id": 7}
    body = json.loads(seen[-1].content)
    assert body["model"] == {"provider": "openai_compatible", "base_url": "http://odysseus:8000/v1",
                             "quick": "qwen", "deep": "qwen"}
    assert body["api_key"] == "sk-x" and "endpoint_id" not in body


def test_local_preset(setup):
    c, seen, _ = setup
    c.post("/api/trading/lab/jobs", json={"ticker": "NVDA", "date": "2026-06-01", "local_preset": "Qwen3.6"})
    body = json.loads(seen[-1].content)
    assert body["model"]["quick"] == "unsloth/Qwen3.6-35B-A3B-GGUF" and "api_key" not in body


def test_get_passthrough_and_lab_down(setup, monkeypatch):
    c, seen, tr = setup
    assert c.get("/api/trading/lab/health").json() == {"ok": True}

    def down(request):
        raise httpx.ConnectError("nope")
    monkeypatch.setattr(tr, "_transport", httpx.MockTransport(down))
    r = c.get("/api/trading/lab/health")
    assert r.status_code == 503 and "tradingagents-lab" in r.json()["detail"]


def test_models_never_expose_keys(setup, monkeypatch):
    c, _, tr = setup
    monkeypatch.setattr(tr, "_enabled_endpoints", lambda owner: [
        {"id": "e1", "name": "GLM", "models": ["glm-5.3-flash"], "api_key": "sk-secret", "base_url": "https://api.z.ai/v4"},
        {"id": "local-1", "name": "Qwen", "models": ["unsloth/Qwen3.6-35B-A3B-GGUF"], "base_url": "http://localhost:8000/v1"}])
    r = c.get("/api/trading/models")
    assert "sk-secret" not in r.text and r.json()["presets"][0]["name"] == "Qwen3.6"
    assert r.json()["presets"][0]["running"] is False
    assert [e["id"] for e in r.json()["endpoints"]] == ["e1"] and r.json()["endpoints"][0]["running"] is True


def test_is_serving_matches_gguf_path():
    import routes.trading_routes as tr
    p = {"model": "unsloth/Qwen3.6-35B-A3B-GGUF"}
    assert tr._is_serving(p, ["/app/.cache/huggingface/hub/x/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf"])
    assert tr._is_serving(p, ["Qwen3.6-35B-A3B-GGUF"]) and not tr._is_serving({"model": "unsloth/Qwen3.5-4B-GGUF"}, ["Qwen3.6-35B-A3B-GGUF"])
    assert not tr._is_serving(p, [])


def test_lab_error_never_returns_the_key(setup, monkeypatch):
    c, seen, tr = setup

    def echo(request):   # um 422 que ecoa o corpo (com a chave), como o FastAPI faz por padrao
        return httpx.Response(422, json={"detail": [{"input": json.loads(request.content)}]})
    monkeypatch.setattr(tr, "_transport", httpx.MockTransport(echo))
    r = c.post("/api/trading/lab/jobs", json={"date": "2026-06-01", "endpoint_id": "e1", "model_name": "qwen"})
    assert r.status_code == 422 and "sk-x" not in r.text


def test_toast_log_without_login_is_not_401(monkeypatch):
    """LOCAL_CHANGES §9: sem login, gravar o toast nao pode dar 401 (o fetch global iria a /login)."""
    monkeypatch.setenv("AUTH_ENABLED", "false")
    from routes.task.task_routes import setup_task_routes
    app = FastAPI()
    app.include_router(setup_task_routes(None))
    r = TestClient(app).post("/api/tasks/notification-logs", json={"body": "oi"})
    assert r.status_code == 200 and r.json()["stored"] is False
