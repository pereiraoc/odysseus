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
    monkeypatch.setattr(ta, "POLL_S", 0)
    prompt = json.dumps({"portfolio_id": 3, "watchlist_id": 1, "endpoint_id": "e", "model_name": "q"})
    msg, ok = asyncio.run(ta.action_trading_run("u", prompt=prompt))
    assert ok and "PETR4.SA Buy" in msg and "VALE3.SA Buy" in msg


def test_radar_run_waits_for_picks(monkeypatch):
    import routes.trading_action as ta
    import routes.trading_routes as tr

    def handler(request):
        if request.url.path == "/radar/run":
            return httpx.Response(200, json={"id": 5})
        if request.url.path == "/jobs/5":
            return httpx.Response(200, json={"id": 5, "kind": "radar", "status": "done", "payload": {"picks": ["TSLA"], "jobs": [6]}})
        if request.url.path == "/jobs/6":
            return httpx.Response(200, json={"id": 6, "kind": "analysis", "ticker": "TSLA", "status": "done", "rating": "Buy"})
        return httpx.Response(404)

    monkeypatch.setattr(tr, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(tr, "_presets", lambda: [{"name": "Qwen3.6", "model": "m", "port": "8000"}])
    monkeypatch.setattr(ta, "POLL_S", 0)
    msg, ok = asyncio.run(ta.action_trading_run("u", prompt=json.dumps({"radar": True, "local_preset": "Qwen3.6"})))
    assert ok and "Radar escolheu TSLA" in msg and "TSLA Buy" in msg
