# Grupo "Trading" (painel fino sobre o Trading Lab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seção "Trading" na barra lateral do Odysseus que opera o Trading Lab (container `tradingagents-lab`) — analisar, relatórios, carteiras, backtest e agenda — sem regra de negócio no Odysseus.

**Architecture:** `routes/trading_routes.py` é um proxy autenticado para `http://tradingagents-lab:7100` que só acrescenta o que é do Odysseus: resolve o endpoint de modelo escolhido (base_url + chave decifrada, `localhost` reescrito para o host `odysseus`) e registra a ação agendável `trading_run`. `static/js/trading.js` desenha a janela com abas, no mesmo molde do `finance.js`.

**Tech Stack:** FastAPI, httpx (já dependência), SQLAlchemy (`ModelEndpoint`), JS módulo sem libs (CSP), SVG próprio.

**Spec:** `/data/projects/TradingAgents/docs/superpowers/specs/2026-10-26-trading-lab-design.md` (§5) · contrato da API: `/data/projects/TradingAgents/docs/lab.md`

## Global Constraints

- Nenhuma decisão de negócio aqui (tamanho, preço, fila, carteira): tudo vem da API do lab.
- Chave de API só no corpo do POST para o lab pela rede interna; nunca em resposta ao navegador, log ou query string.
- Arquivos novos + ganchos mínimos (`app.py`, `static/index.html`, `docker/pereiraoc.yml`), registrados em `LOCAL_CHANGES.md` §8.
- Relatório exibido em `<iframe sandbox srcdoc>` (X-Frame-Options DENY no app).
- Validação visual pelo navegador; **nunca** compositor aninhado.

---

### Task 1: Proxy + modelos (`routes/trading_routes.py`)

**Files:** Create `routes/trading_routes.py`; Test `tests/test_trading_routes.py`

**Interfaces:**
- Produces: `setup_trading_routes() -> APIRouter` (prefixo `/api/trading`); `GET /api/trading/models` → `{"endpoints": [{"id","name","models":[...]}], "presets": [{"name","model"}]}`; `ANY /api/trading/lab/{path}` → repassa ao lab; nos POST com `endpoint_id` o corpo ganha `model` + `api_key` e perde `endpoint_id`/`model_name`/`deep_model_name`; `resolve_model(endpoint_id, quick, deep, owner) -> tuple[dict, str | None]`; `local_alias(url) -> str`; módulo var `_transport` (testes injetam `httpx.MockTransport`).
- Corpo aceito do navegador: `{..., "endpoint_id": str, "model_name": str, "deep_model_name"?: str}` ou `{..., "local_preset": str}` (usa `http://localhost:8000/v1` + modelo do preset).

- [ ] **Step 1: Write the failing test**

```python
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
    monkeypatch.setattr(tr, "_presets", lambda: [{"name": "Qwen3.6", "model": "unsloth/Qwen3.6-35B-A3B-GGUF"}])
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
        {"id": "e1", "name": "GLM", "models": ["glm-5.3-flash"], "api_key": "sk-secret"}])
    r = c.get("/api/trading/models")
    assert "sk-secret" not in r.text and r.json()["presets"][0]["name"] == "Qwen3.6"
```

- [ ] **Step 2: Run** `./venv/bin/pytest tests/test_trading_routes.py -q` → FAIL (import).

- [ ] **Step 3: Implement** `routes/trading_routes.py`

```python
"""Fork-local (ver LOCAL_CHANGES.md §8): grupo "Trading" -- painel fino sobre o Trading Lab.

Toda a logica (fila, carteiras ficticias, tamanho, preco, backtest) vive no fork
pereiraoc/TradingAgents (tradingagents/lab), servido pelo container tradingagents-lab.
Aqui so o que e do Odysseus: autenticar, resolver o modelo escolhido (base_url + chave
decifrada, localhost -> host do container) e a acao agendavel trading_run.

Rotas (todas exigem usuario):
  GET  /api/trading/models          endpoints habilitados (sem chave) + presets do Cookbook
  ANY  /api/trading/lab/{path}      repassa ao lab; POST com endpoint_id/local_preset ganha model + api_key
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from src.auth_helpers import require_user

LAB_URL = os.getenv("TRADING_LAB_URL", "http://tradingagents-lab:7100")
LOCAL_HOST = os.getenv("TRADING_LAB_LOCAL_HOST", "odysseus")
LOCAL_BASE = "http://localhost:8000/v1"
COOKBOOK_STATE = Path(os.getenv("APP_DATA_DIR", "/app/data")) / "cookbook_state.json"
_transport: httpx.BaseTransport | None = None


def local_alias(url: str) -> str:
    """O lab roda em outro container: localhost do Odysseus vira o host 'odysseus'."""
    parts = urlsplit(url)
    if parts.hostname in ("localhost", "127.0.0.1", "0.0.0.0"):
        netloc = LOCAL_HOST + (f":{parts.port}" if parts.port else "")
        return urlunsplit(parts._replace(netloc=netloc))
    return url


def _endpoint_row(endpoint_id: str, owner: str) -> dict | None:
    from core.database import ModelEndpoint, get_db_session
    from src.endpoint_resolver import resolve_endpoint_runtime

    with get_db_session() as db:
        ep = db.query(ModelEndpoint).filter(ModelEndpoint.id == endpoint_id,
                                            ModelEndpoint.is_enabled == True).first()  # noqa: E712
        if ep is None:
            return None
        base, key = resolve_endpoint_runtime(ep, owner=owner or None)
        return {"id": ep.id, "name": ep.name, "base_url": base, "api_key": key}


def _enabled_endpoints(owner: str) -> list[dict]:
    from core.database import ModelEndpoint, get_db_session

    with get_db_session() as db:
        rows = db.query(ModelEndpoint).filter(ModelEndpoint.is_enabled == True).all()  # noqa: E712
        out = []
        for ep in rows:
            if (ep.model_type or "llm") != "llm":
                continue
            models = json.loads(ep.pinned_models or "null") or json.loads(ep.cached_models or "null") or []
            out.append({"id": ep.id, "name": ep.name, "models": models})
        return out


def _presets() -> list[dict]:
    try:
        state = json.loads(COOKBOOK_STATE.read_text())
    except (OSError, ValueError):
        return []
    seen, out = set(), []
    for p in state.get("presets", []):
        if p.get("confirmedWorking") and p.get("name") not in seen:
            seen.add(p["name"])
            out.append({"name": p["name"], "model": p.get("model") or p["name"]})
    return out


def resolve_model(body: dict, owner: str) -> dict:
    """Troca a escolha do navegador pelo model/api_key que o lab entende."""
    body = dict(body)
    preset = body.pop("local_preset", None)
    endpoint_id = body.pop("endpoint_id", None)
    quick = body.pop("model_name", None)
    deep = body.pop("deep_model_name", None)
    if preset:
        p = next((x for x in _presets() if x["name"] == preset), None)
        if p is None:
            raise HTTPException(400, f"preset do Cookbook não encontrado: {preset}")
        body["model"] = {"provider": "openai_compatible", "base_url": local_alias(LOCAL_BASE),
                         "quick": quick or p["model"], "deep": deep or quick or p["model"]}
    elif endpoint_id:
        ep = _endpoint_row(endpoint_id, owner)
        if ep is None:
            raise HTTPException(400, "modelo não está habilitado no Odysseus")
        if not quick:
            raise HTTPException(400, "escolha o modelo")
        body["model"] = {"provider": "openai_compatible", "base_url": local_alias(ep["base_url"]),
                         "quick": quick, "deep": deep or quick}
        if ep["api_key"]:
            body["api_key"] = ep["api_key"]
    for key in ("replay",):
        if isinstance(body.get(key), dict) and ({"endpoint_id", "local_preset"} & body[key].keys()):
            body[key] = resolve_model(body[key], owner)
    return body


async def lab_request(method: str, path: str, *, json_body=None, params=None) -> httpx.Response:
    try:
        async with httpx.AsyncClient(base_url=LAB_URL, timeout=30, transport=_transport) as client:
            return await client.request(method, "/" + path.lstrip("/"), json=json_body, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(503, f"Trading Lab fora do ar (container tradingagents-lab): {exc}") from None


def setup_trading_routes() -> APIRouter:
    r = APIRouter(prefix="/api/trading", tags=["trading"])

    @r.get("/models")
    def models(user: str = Depends(require_user)):
        return {"endpoints": [{k: e[k] for k in ("id", "name", "models")} for e in _enabled_endpoints(user)],
                "presets": _presets()}

    @r.api_route("/lab/{path:path}", methods=["GET", "POST", "DELETE"])
    async def lab(path: str, request: Request, user: str = Depends(require_user)):
        body = None
        if request.method == "POST":
            raw = await request.body()
            body = resolve_model(json.loads(raw) if raw else {}, user)
        resp = await lab_request(request.method, path, json_body=body, params=dict(request.query_params))
        return Response(resp.content, status_code=resp.status_code,
                        media_type=resp.headers.get("content-type", "application/json"))

    from routes.trading_action import register_trading_action
    register_trading_action()
    return r
```

(`routes/trading_action.py` vem na Task 2; para a Task 1 passar sozinha, crie-o já com `def register_trading_action(): pass` e complete na Task 2.)

- [ ] **Step 4: Run** `./venv/bin/pytest tests/test_trading_routes.py -q` → PASS.
- [ ] **Step 5: Commit** `git add routes/trading_routes.py routes/trading_action.py tests/test_trading_routes.py && git commit -m "feat(fork): Trading -- proxy autenticado para o Trading Lab com modelo/chave do Odysseus"`

---

### Task 2: Ação agendável `trading_run` (`routes/trading_action.py`)

**Files:** Modify `routes/trading_action.py`; Test `tests/test_trading_action.py`

**Interfaces:**
- Consumes: `trading_routes.resolve_model`, `trading_routes.lab_request`.
- Produces: `register_trading_action()` (idempotente: põe `trading_run` em `src.builtin_actions.BUILTIN_ACTIONS` e `BUILTIN_ACTION_INFO`); `async action_trading_run(owner, task_name="", progress_cb=None, prompt="", **kw) -> tuple[str, bool]`.
- `prompt` (JSON): `{"portfolio_id"?: int, "watchlist_id"?: int, "tickers"?: [..], "analysts"?: [..], "endpoint_id"+"model_name" | "local_preset", "wait_model_min"?: 20, "max_hours"?: 12}`.

- [ ] **Step 1: Write the failing test**

```python
"""Fork-local: acao agendavel trading_run (routes/trading_action.py)."""
import asyncio
import json

import httpx


def test_registers_once():
    from routes.trading_action import register_trading_action
    from src.builtin_actions import BUILTIN_ACTION_INFO, BUILTIN_ACTIONS
    register_trading_action(); register_trading_action()
    assert "trading_run" in BUILTIN_ACTIONS and "trading_run" in BUILTIN_ACTION_INFO


def test_runs_portfolio_and_summarizes(monkeypatch):
    import routes.trading_action as ta
    import routes.trading_routes as tr
    calls = {"polls": 0}

    def handler(request):
        if request.url.path == "/portfolios/3/run":
            assert json.loads(request.content)["model"]["quick"] == "q"
            return httpx.Response(200, json={"ids": [10, 11]})
        if request.url.path.startswith("/jobs/"):
            calls["polls"] += 1
            jid = int(request.url.path.rsplit("/", 1)[1])
            return httpx.Response(200, json={"id": jid, "ticker": {10: "PETR4.SA", 11: "VALE3.SA"}[jid],
                                             "status": "done", "rating": "Buy"})
        return httpx.Response(404)

    monkeypatch.setattr(tr, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(tr, "_endpoint_row", lambda eid, owner: {"id": eid, "base_url": "http://x/v1",
                                                                  "api_key": None, "name": "n"})
    monkeypatch.setattr(ta, "_model_up", lambda base, key: asyncio.sleep(0, True))
    monkeypatch.setattr(ta, "POLL_S", 0)
    prompt = json.dumps({"portfolio_id": 3, "watchlist_id": 1, "endpoint_id": "e", "model_name": "q"})
    msg, ok = asyncio.run(ta.action_trading_run("u", prompt=prompt))
    assert ok and "PETR4.SA Buy" in msg and "VALE3.SA Buy" in msg


def test_gives_up_when_model_never_comes_up(monkeypatch):
    import routes.trading_action as ta
    monkeypatch.setattr(ta, "_model_up", lambda base, key: asyncio.sleep(0, False))
    monkeypatch.setattr(ta, "POLL_S", 0)
    prompt = json.dumps({"tickers": ["NVDA"], "local_preset": "Qwen3.6", "wait_model_min": 0})
    import routes.trading_routes as tr
    monkeypatch.setattr(tr, "_presets", lambda: [{"name": "Qwen3.6", "model": "m"}])
    msg, ok = asyncio.run(ta.action_trading_run("u", prompt=prompt))
    assert not ok and "não respondeu" in msg
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `routes/trading_action.py`

```python
"""Fork-local (ver LOCAL_CHANGES.md §8): acao agendavel trading_run.

O agendador do Odysseus passa task.prompt como prompt= e autoriza scheduled__trading_run.
A acao so dispara o Trading Lab e espera: o que rodar e como fica no fork. Ligar o Qwen
NAO e feito aqui (a autoridade da tarefa nao inclui serve_model): a aba Agenda cria uma
tarefa cookbook_serve com then_task_id apontando para esta.
"""
from __future__ import annotations

import asyncio
import json
import time

import httpx

POLL_S = 20
INFO = ("Trading Lab: roda as análises de uma lista/carteira no Trading Lab "
        "(container tradingagents-lab) e resume as notas. Config JSON no prompt.")


async def _model_up(base_url: str, api_key: str | None) -> bool:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            return (await c.get(base_url.rstrip("/") + "/models", headers=headers)).status_code < 500
    except httpx.HTTPError:
        return False


async def action_trading_run(owner: str, task_name: str = "", progress_cb=None, prompt: str = "", **kwargs):
    from routes import trading_routes as tr

    try:
        cfg = json.loads(prompt or "{}")
    except ValueError:
        return f"Config JSON inválida: {prompt!r}", False
    say = progress_cb or (lambda _m: None)
    body = tr.resolve_model(cfg, owner)
    model, key = body["model"], body.get("api_key")
    # o lab enxerga o Odysseus como 'odysseus'; daqui, o mesmo servidor e localhost
    probe = model["base_url"].replace(f"//{tr.LOCAL_HOST}:", "//localhost:")
    deadline = time.monotonic() + 60 * float(cfg.get("wait_model_min", 20))
    while not await _model_up(probe, key):
        if time.monotonic() >= deadline:
            return f"Modelo {model['quick']} não respondeu em {cfg.get('wait_model_min', 20)} min", False
        say("esperando o modelo subir…")
        await asyncio.sleep(POLL_S or 0)
    payload = {k: body[k] for k in ("tickers", "watchlist_id", "analysts", "model", "api_key") if k in body}
    if cfg.get("portfolio_id"):
        resp = await tr.lab_request("POST", f"portfolios/{cfg['portfolio_id']}/run", json_body=payload)
        ids = resp.json().get("ids", []) if resp.status_code == 200 else None
    else:
        ids = []
        for t in body.get("tickers", []):
            resp = await tr.lab_request("POST", "jobs", json_body={
                "ticker": t, "date": time.strftime("%Y-%m-%d"), **{k: v for k, v in payload.items() if k != "tickers"}})
            if resp.status_code != 200:
                ids = None
                break
            ids.append(resp.json()["id"])
    if ids is None:
        return f"Trading Lab recusou: {resp.status_code} {resp.text[:300]}", False
    deadline = time.monotonic() + 3600 * float(cfg.get("max_hours", 12))
    results: dict[int, dict] = {}
    while len(results) < len(ids):
        for jid in ids:
            if jid in results:
                continue
            job = (await tr.lab_request("GET", f"jobs/{jid}")).json()
            if job.get("status") in ("done", "failed", "review"):
                results[jid] = job
        say(f"{len(results)}/{len(ids)} análises prontas")
        if len(results) < len(ids):
            if time.monotonic() >= deadline:
                break
            await asyncio.sleep(POLL_S or 0)
    lines = [f"{j['ticker']} {j.get('rating') or j['status']}" for j in results.values()]
    missing = len(ids) - len(results)
    failed = sum(1 for j in results.values() if j["status"] == "failed")
    text = ", ".join(lines) + (f" · {missing} ainda na fila" if missing else "")
    return f"Trading: {text}", failed == 0 and missing == 0


def register_trading_action() -> None:
    from src import builtin_actions as ba

    ba.BUILTIN_ACTIONS.setdefault("trading_run", action_trading_run)
    ba.BUILTIN_ACTION_INFO.setdefault("trading_run", INFO)
```

- [ ] **Step 4: Run** `./venv/bin/pytest tests/test_trading_routes.py tests/test_trading_action.py -q` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(fork): Trading -- acao agendavel trading_run"` (add test file).

---

### Task 3: Janela "Trading" (`static/js/trading.js`, `static/css/zz-fork-trading.css`) + ganchos

**Files:** Create `static/js/trading.js`, `static/css/zz-fork-trading.css`; Modify `app.py` (include router after finance), `static/index.html` (section `#trading-section` after `#finance-section`, `<link>` and `<script type="module">` next to finance's).

**Interfaces:**
- Consumes: `/api/trading/models`, `/api/trading/lab/*` (contract in `docs/lab.md` of the fork), `/api/tasks` (`TaskCreate` fields: `name, prompt, task_type="action", action, schedule, scheduled_time, scheduled_day, then_task_id, notifications_enabled`).
- Same shell as `finance.js`: `buildPanel()` (modal, draggable, z-order, Modals.register + minimize), `switchTab`, `mountSidebar()` adding one `.list-item` into `#trading-list`, prefix `trd-` for CSS classes, tab remembered in `localStorage['odysseus-trd-tab']` (try/catch).

Tabs and what each does (all data from the lab; no math besides formatting):

| Aba | Conteúdo |
|---|---|
| Analisar | Form: ticker, data (padrão hoje), analistas (4 checkboxes), modelo (select com grupos "Ligado agora" = `endpoints[].models`, "Cookbook (precisa estar ligado)" = `presets`), modelo de decisão opcional, carteira opcional. Botão Rodar → `POST lab/jobs`. Abaixo, "Fila": `GET lab/jobs?limit=30` com status chip, nota, agentes concluídos (de `events`), botões tentar de novo/cancelar; polling 5 s enquanto houver `queued|running`. |
| Relatórios | Lista `GET lab/jobs?status=done` + `review`; clicar abre `<iframe sandbox class="trd-report" srcdoc=…>` com o texto de `GET lab/reports/{id}`; botão "Markdown" baixa `reports/{id}/md`. Job em `review`: seletor de nota + "Aplicar" → `POST lab/jobs/{id}/resolve`. |
| Carteiras | Lista `GET lab/portfolios`; criar (nome, moeda BRL/USD, dinheiro inicial, modo ao vivo / reencenação com ações, início, fim, intervalo, modelo). Detalhe `GET lab/portfolios/{id}`: KPIs (valor, caixa, retorno %, índice %), gráfico SVG de linha `curve` × `benchmark_curve`, tabela de posições, extrato (`trades`: data, ação, nota, lado, qtd, preço, fonte do tamanho, status/motivo, link para o relatório do job). Botão "Rodar agora" (lista de ações ou watchlist + modelo) → `POST lab/portfolios/{id}/run`. |
| Backtest | Form (ações, início, fim, intervalo, analistas, modelo) → `POST lab/backtests`; lista `GET lab/backtests` com status e, quando pronto, `summary.text` em `<pre>` e tabela `by_rating` (n, acerto %, alfa médio). |
| Agenda | Listas de ações (`GET/POST/DELETE lab/watchlists`). Nova agenda: lista, carteira opcional, modelo (preset local ou endpoint), frequência (diária/semanal + dia + hora). Salvar: cria Tarefa `trading_run` (`schedule:"once"` far-future placeholder NÃO — usar: com preset local → primeiro `POST /api/tasks` da `trading_run` com `schedule:null`/`trigger_type:"schedule"` desativada? → ver Step 1). Lista as tarefas `trading_run` existentes (`GET /api/tasks`, filtro `action==='trading_run'`) com pausar/excluir pelas rotas existentes. |

- [ ] **Step 1: Confirm chaining semantics before coding Agenda** — read `routes/task/task_routes.py` `create_task` and `src/task_scheduler.py` (`then_task_id`) to learn how a task that only runs when chained is created (expected: a task with `schedule="once"` in the past or a paused task is still fired by `then_task_id`). Write the finding as a comment at the top of the Agenda code; if a chained-only task is not supported, fall back to: `cookbook_serve` scheduled at H:M−10 and `trading_run` at H:M with `wait_model_min: 30` (both visible in Tasks).
- [ ] **Step 2:** Write `trading.js` + CSS following the table; reuse `esc`, `showError` from `ui.js` and the shell of `finance.js` (copy `buildPanel/openPanel/mountSidebar` adapting ids). Lab down → body shows "Trading Lab fora do ar — `docker compose up -d tradingagents-lab`".
- [ ] **Step 3:** Hooks: `app.py` after `app.include_router(setup_finance_routes())`:
  ```python
  # Fork-local (LOCAL_CHANGES.md §8): grupo Trading (painel fino sobre o Trading Lab)
  from routes.trading_routes import setup_trading_routes
  app.include_router(setup_trading_routes())
  ```
  `static/index.html`: section after finance's (same markup, id `trading-section`, list `trading-list`, title "Trading", chart-line icon), `<link rel="stylesheet" href="/static/css/zz-fork-trading.css?v=20261026trd1">`, `<script type="module" src="/static/js/trading.js?v=20261026trd1"></script>`.
- [ ] **Step 4:** `node --check static/js/trading.js` → OK; `./venv/bin/pytest tests/test_trading_routes.py tests/test_trading_action.py -q` → PASS.
- [ ] **Step 5: Commit** `git add -A static/js/trading.js static/css/zz-fork-trading.css app.py static/index.html && git commit -m "feat(fork): Trading -- janela com Analisar, Relatórios, Carteiras, Backtest e Agenda"`

---

### Task 4: Container do lab + docs do fork

**Files:** Modify `docker/pereiraoc.yml`, `LOCAL_CHANGES.md` (§8).

- [ ] **Step 1:** `docker/pereiraoc.yml` — add service and env:
  ```yaml
    # Trading Lab (LOCAL_CHANGES.md §8): motor do fork pereiraoc/TradingAgents. So rede
    # interna (sem ports); o painel Trading fala com ele em http://tradingagents-lab:7100.
    tradingagents-lab:
      build: /data/projects/TradingAgents
      image: tradingagents-lab:latest
      pull_policy: build
      command: ["lab", "serve", "--host", "0.0.0.0", "--port", "7100"]
      environment:
        - TRADINGAGENTS_LAB_DIR=/home/appuser/.tradingagents
      volumes:
        - /data/trading:/home/appuser/.tradingagents
      restart: unless-stopped
  ```
  and under `services.odysseus.environment`: `- TRADING_LAB_URL=http://tradingagents-lab:7100`.
  Host prep (once): `install -d -m 700 /data/trading` (owner pereiraoc, uid 1000 = appuser in the image — verify with `docker run --rm --entrypoint id tradingagents-lab:latest`).
- [ ] **Step 2:** `LOCAL_CHANGES.md` §8 "Trading — painel fino sobre o Trading Lab [feature local + serviço extra no compose]": o que é, onde está a lógica (fork), arquivos novos (`routes/trading_routes.py`, `routes/trading_action.py`, `static/js/trading.js`, `static/css/zz-fork-trading.css`, testes), ganchos (`app.py`, `index.html`, `docker/pereiraoc.yml`), dados `/data/trading`, como atualizar (`git pull` no fork + `docker compose build tradingagents-lab && docker compose up -d tradingagents-lab`), e a regra "Qwen da agenda = tarefa cookbook_serve encadeada".
- [ ] **Step 3: Bring up** (avisar o usuário antes — mexe no stack vivo; recriar o `odysseus` derruba o serve do Cookbook): `docker compose build tradingagents-lab && docker compose up -d tradingagents-lab` e então `docker compose up -d odysseus` (env nova + código novo). Check: `docker compose exec odysseus curl -s http://tradingagents-lab:7100/health`.
- [ ] **Step 4: Commit** `git commit -am "feat(fork): Trading -- container tradingagents-lab e LOCAL_CHANGES §8"`

---

### Task 5: Ponta a ponta (com o usuário)

- [ ] Ligar o Qwen3.6 no Cookbook (fora de jogo — checar janela ativa antes de mexer na tela).
- [ ] Analisar PETR4.SA numa data passada pelo painel; acompanhar eventos; abrir relatório.
- [ ] Carteira de reencenação pequena (1 ação × 3 datas, BRL 10.000); conferir extrato, preço do pregão seguinte e curva × Ibovespa.
- [ ] Uma agenda de teste para daqui a alguns minutos; conferir notificação.
- [ ] Usuário valida visualmente; fechar pendências validadas.

## Self-review

- Spec §5: proxy+modelos (T1), `trading_run` sem `serve_model` (T2), abas + srcdoc + agenda por tarefa encadeada (T3), container e LOCAL_CHANGES (T4), ponta a ponta (T5). §6 "lab fora do ar" (T1 503 + T3 aviso), "Qwen não sobe" (T2 `wait_model_min`).
- A Task 3 é UI: código guiado pela tabela e pelo shell do `finance.js`; validação é visual (Task 5).
