"""Login central por proxy confiavel (patch do fork pereiraoc, 04/11/2026).

O Caddy do NAS (odysseus.pereiraoc.com, so pela VPN) so deixa passar depois do Authelia (login central com 2FA) e
repassa com dois cabecalhos: ``Remote-User`` (quem o Authelia autenticou) e ``X-Odysseus-Proxy-Secret`` (um segredo que
so o NAS conhece, sobrescrito pelo Caddy em toda requisicao). Com os dois certos, o Odysseus abre a sessao do usuario
sozinho; sem eles, vale o login normal (senha + TOTP do proprio Odysseus).

Config (env): ``TRUSTED_PROXY_SECRET`` (>= 32 caracteres; vazio = desligado) e ``TRUSTED_PROXY_USER_MAP``
(``usuario-central:usuario-odysseus,...``; sem entrada no mapa = o mesmo nome). So usuarios que ja existem no Odysseus
entram: o proxy nunca cria conta.
"""
from __future__ import annotations

import hmac
from typing import Iterable, Mapping, Optional

SECRET_HEADER = "X-Odysseus-Proxy-Secret"
USER_HEADER = "Remote-User"
MIN_SECRET_LEN = 32


def parse_user_map(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for pair in (raw or "").split(","):
        if ":" in pair:
            a, b = pair.split(":", 1)
            a, b = a.strip().lower(), b.strip().lower()
            if a and b:
                out[a] = b
    return out


def trusted_proxy_user(headers: Mapping[str, str], secret: str, user_map: Mapping[str, str],
                       known_users: Iterable[str]) -> Optional[str]:
    """Usuario do Odysseus para esta requisicao, ou None (= segue o login normal)."""
    if not secret or len(secret) < MIN_SECRET_LEN:
        return None
    got = headers.get(SECRET_HEADER) or ""
    if not got or not hmac.compare_digest(got.encode(), secret.encode()):
        return None
    remote = (headers.get(USER_HEADER) or "").strip().lower()
    if not remote:
        return None
    user = user_map.get(remote, remote)
    return user if user in set(known_users) else None
