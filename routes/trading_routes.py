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
from src.constants import DATA_DIR

LAB_URL = os.getenv("TRADING_LAB_URL", "http://tradingagents-lab:7100")
LOCAL_HOST = os.getenv("TRADING_LAB_LOCAL_HOST", "odysseus")
COOKBOOK_STATE = Path(DATA_DIR) / "cookbook_state.json"
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
            out.append({"id": ep.id, "name": ep.name, "models": models, "base_url": ep.base_url or ""})
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
            port = str((p.get("fields") or {}).get("port") or p.get("port") or "8000")
            out.append({"name": p["name"], "model": p.get("model") or p["name"], "port": port})
    return out


def _serving(port: str) -> list[str]:
    """Modelos que o servidor local na porta responde agora ([] = desligado)."""
    try:
        r = httpx.get(f"http://localhost:{port}/v1/models", timeout=1.5)
        return [m.get("id") for m in r.json().get("data", [])] if r.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        return []


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
        body["model"] = {"provider": "openai_compatible", "base_url": local_alias(f"http://localhost:{p.get('port', '8000')}/v1"),
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
        presets = _presets()
        up = {port: _serving(port) for port in {p["port"] for p in presets}}
        preset_models = {p["model"] for p in presets}
        endpoints = []
        for e in _enabled_endpoints(user):
            host = urlsplit(e.get("base_url", "")).hostname
            local = host in ("localhost", "127.0.0.1", "0.0.0.0")
            if local and set(e["models"]) <= preset_models:
                continue  # o mesmo modelo ja aparece como preset do Cookbook (com "Ligar")
            port = str(urlsplit(e["base_url"]).port or 80) if local else None
            endpoints.append({"id": e["id"], "name": e["name"], "models": e["models"],
                              "running": bool(_serving(port)) if local else True})
        return {"endpoints": endpoints, "presets": [{**p, "running": bool(up.get(p["port"]))} for p in presets]}

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
