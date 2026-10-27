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
from fastapi import HTTPException

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
    try:
        body = tr.resolve_model(cfg, owner)
        model, key = body["model"], body.get("api_key")
    except (HTTPException, KeyError) as exc:   # preset/endpoint sumiu ou config sem modelo
        return f"Modelo da agenda inválido: {getattr(exc, 'detail', exc)}", False
    # o lab enxerga o Odysseus como 'odysseus'; daqui, o mesmo servidor e localhost
    probe = model["base_url"].replace(f"//{tr.LOCAL_HOST}:", "//localhost:")
    deadline = time.monotonic() + 60 * float(cfg.get("wait_model_min", 20))
    while not await _model_up(probe, key):
        if time.monotonic() >= deadline:
            return f"Modelo {model['quick']} não respondeu em {cfg.get('wait_model_min', 20)} min", False
        say("esperando o modelo subir…")
        await asyncio.sleep(POLL_S or 0)
    payload = {k: body[k] for k in ("tickers", "watchlist_id", "analysts", "model", "api_key") if k in body}
    if cfg.get("radar"):
        resp = await tr.lab_request("POST", "radar/run", json_body={k: payload[k] for k in ("analysts", "model", "api_key")
                                                                    if k in payload})
        ids = [resp.json()["id"]] if resp.status_code == 200 else None
    elif cfg.get("portfolio_id"):
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
        return f"Trading Lab recusou: {resp.status_code} {tr.scrub_key(resp.text, key)[:300]}", False
    deadline = time.monotonic() + 3600 * float(cfg.get("max_hours", 12))
    results: dict[int, dict] = {}
    while len(results) < len(ids):
        for jid in list(ids):
            if jid in results:
                continue
            job = (await tr.lab_request("GET", f"jobs/{jid}")).json()
            if job.get("status") in ("done", "failed", "review"):
                results[jid] = job
                # o Radar enfileira as acoes escolhidas: espera por elas tambem
                ids += [j for j in (job.get("payload") or {}).get("jobs", []) if j not in ids]
        say(f"{len(results)}/{len(ids)} análises prontas")
        if len(results) < len(ids):
            if time.monotonic() >= deadline:
                break
            await asyncio.sleep(POLL_S or 0)
    lines = [f"Radar escolheu {', '.join((j.get('payload') or {}).get('picks') or []) or 'nada'}" if j.get("kind") == "radar"
             else f"{j['ticker']} {j.get('rating') or j['status']}" for j in results.values()]
    missing = len(ids) - len(results)
    failed = sum(1 for j in results.values() if j["status"] == "failed")
    text = ", ".join(lines) + (f" · {missing} ainda na fila" if missing else "")
    return f"Trading: {text}", failed == 0 and missing == 0


def register_trading_action() -> None:
    from src import builtin_actions as ba

    ba.BUILTIN_ACTIONS.setdefault("trading_run", action_trading_run)
    ba.BUILTIN_ACTION_INFO.setdefault("trading_run", INFO)
