"""Fork-local (ver LOCAL_CHANGES.md, item 1): admin com AUTH_ENABLED=false atrás do Docker.

O navegador no host chega pelo docker-proxy, então o container vê o gateway
da bridge como cliente. O patch aceita SÓ esse IP, e com o mesmo contrato de
transporte do upstream (sem headers de proxy, sem fetch cross-site, Origin
igual) — o CSRF de um site qualquer contra localhost:7000 segue barrado.
"""
import pytest
from fastapi import HTTPException

from core.middleware import INTERNAL_TOOL_HEADER, INTERNAL_TOOL_TOKEN
from routes import shell_routes
from tests.test_wave3_local_control import request

GATEWAY = "172.18.0.1"


@pytest.mark.parametrize("host,headers,allowed", [
    (GATEWAY, {}, True),
    (GATEWAY, {"origin": "http://127.0.0.1:7000", "sec-fetch-site": "same-origin"}, True),
    ("172.18.0.5", {}, False),  # outro container da rede (ex.: sessão do Obsidian)
    ("192.0.2.1", {}, False),
    (GATEWAY, {"sec-fetch-site": "cross-site"}, False),
    (GATEWAY, {"origin": "https://evil.example"}, False),
    (GATEWAY, {"x-forwarded-for": "192.0.2.1"}, False),
    (GATEWAY, {INTERNAL_TOOL_HEADER: INTERNAL_TOOL_TOKEN}, False),
])
def test_docker_gateway_operator_transport(monkeypatch, host, headers, allowed):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    monkeypatch.setattr(shell_routes, "_docker_gateway", lambda: GATEWAY)
    req = request(host, headers)
    if allowed:
        shell_routes._require_admin(req)
    else:
        with pytest.raises(HTTPException) as error:
            shell_routes._require_admin(req)
        assert error.value.status_code == 403


def test_gateway_not_trusted_off_docker(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    monkeypatch.setattr(shell_routes, "_docker_gateway", lambda: None)
    with pytest.raises(HTTPException):
        shell_routes._require_admin(request(GATEWAY))


def test_gateway_parsed_from_proc_net_route(monkeypatch, tmp_path):
    route = tmp_path / "route"
    route.write_text("Iface\tDestination\tGateway\n"
                     "eth0\t00000000\t010012AC\t0003\n"
                     "eth0\t000012AC\t00000000\t0001\n")
    real_open = open
    monkeypatch.setattr(shell_routes.os.path, "exists", lambda p: p == "/.dockerenv")
    monkeypatch.setattr("builtins.open", lambda p, *a, **k: real_open(route if p == "/proc/net/route" else p, *a, **k))
    assert shell_routes._docker_gateway() == "172.18.0.1"
