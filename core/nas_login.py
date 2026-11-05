"""Login pelo NAS na tela do proprio Odysseus (patch do fork pereiraoc, 05/11/2026; setup CF-38).

A tela de login do Odysseus ganha "Sign in with admin approval" e "Sign in with a passkey". As duas pedem ao
nas-approve do NAS (NAS_APPROVE_URL, ex. https://approve.pereiraoc.com, so pela VPN) um pedido de aprovacao:
  - aprovacao por admin: o admin aprova no Nexus (notificacao com botoes) ou no celular;
  - passkey: o app abre a tela de revisao no Chromium, que faz a passkey do celular por QR, e voce aprova.
O Odysseus guarda o segredo do pedido (nunca vai ao navegador), pergunta o estado ao NAS e, aprovado, abre a sessao
do usuario mapeado (TRUSTED_PROXY_USER_MAP; so usuarios que ja existem). O token do aparelho aprovado fica num cookie
httpOnly (odysseus_nas_device): enquanto o NAS disser que vale, a tela de login entra sozinha. Logout esquece o
aparelho (NAS /api/forget) e apaga o cookie.
"""
from __future__ import annotations

import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
from typing import Iterable, Mapping, Optional

DEVICE_COOKIE = "odysseus_nas_device"
PENDING_TTL = 180
SITE = os.getenv("NAS_APPROVE_SITE", "https://odysseus.pereiraoc.com/")

_lock = threading.Lock()
_pending: dict[str, dict] = {}


def base_url() -> str:
    return (os.getenv("NAS_APPROVE_URL", "") or "").rstrip("/")


def enabled() -> bool:
    return bool(base_url())


def _call(method: str, path: str, *, body: Optional[dict] = None, headers: Optional[dict] = None,
          timeout: float = 6.0) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base_url() + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except (OSError, ValueError):
        return 0, {}


def _gc() -> None:
    t = time.time()
    for k in [k for k, v in _pending.items() if v["at"] < t - PENDING_TTL]:
        _pending.pop(k, None)


def start(user_agent: str) -> dict:
    """Cria o pedido no NAS. Devolve o que a tela mostra (codigo, tipo do aparelho, link de revisao)."""
    if not enabled():
        return {"ok": False, "error": "Sign-in through the home server is not set up"}
    st, r = _call("POST", "/api/request", body={"ua": user_agent, "site": SITE})
    if st != 200 or not r.get("ok"):
        return {"ok": False, "error": r.get("error") or "The home server did not answer (is NetBird on?)"}
    login_id = secrets.token_urlsafe(18)
    with _lock:
        _gc()
        _pending[login_id] = {"id": r["id"], "poll": r["poll"], "at": time.time()}
    return {"ok": True, "login_id": login_id, "code": r["code"], "kind": r.get("kind", ""),
            "review": r.get("review", ""), "expires_in": r.get("expires_in", 120)}


def map_user(remote: str, user_map: Mapping[str, str], known_users: Iterable[str]) -> Optional[str]:
    remote = (remote or "").strip().lower()
    user = user_map.get(remote, remote)
    return user if user and user in set(known_users) else None


def status(login_id: str) -> dict:
    """Estado do pedido. Aprovado: {state: approved, user (do NAS), token, max_age}."""
    with _lock:
        _gc()
        p = _pending.get(login_id or "")
    if p is None:
        return {"state": "expired"}
    st, r = _call("GET", f"/api/status/{p['id']}", headers={"X-Poll": p["poll"]})
    if st != 200:
        return {"state": "pending" if st == 0 else "unknown"}
    state = r.get("state", "unknown")
    if state != "pending":
        with _lock:
            _pending.pop(login_id, None)
    return r if state == "approved" else {"state": state}


def device_user(token: str) -> Optional[str]:
    """Usuario do NAS para o aparelho guardado, se ainda aprovado (rapido: a tela de login espera por isso)."""
    if not token or not enabled():
        return None
    st, r = _call("GET", "/api/device", headers={"X-Device-Token": token}, timeout=2.5)
    return r.get("user") if st == 200 and r.get("valid") else None


def forget(token: str) -> None:
    if token and enabled():
        _call("POST", "/api/forget", headers={"X-Device-Token": token}, timeout=2.5)
