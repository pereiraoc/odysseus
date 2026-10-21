"""Cliente minimo da API Pluggy (Meu Pluggy, uso pessoal gratuito). So leitura.

Auth: POST /auth {clientId, clientSecret} -> apiKey (vale ~2h), enviada em X-API-KEY.
Meu Pluggy: itens atualizam sozinhos a cada 24h (PATCH /items/{id} e recusado) e
GET /items nao lista -> os itemIds vem da configuracao (PLUGGY_ITEM_IDS).
"""
from __future__ import annotations

import time
from typing import Iterator, Optional
from urllib.parse import parse_qs, urlparse

import httpx

BASE = "https://api.pluggy.ai"


class PluggyError(RuntimeError):
    pass


class Pluggy:
    def __init__(self, client_id: str, client_secret: str, timeout: float = 30):
        self._id, self._secret = client_id, client_secret
        self._key: Optional[str] = None
        self._key_at = 0.0
        self.http = httpx.Client(base_url=BASE, timeout=timeout)

    def close(self) -> None:
        self.http.close()

    def _auth(self) -> str:
        if self._key and time.time() - self._key_at < 90 * 60:
            return self._key
        r = self.http.post("/auth", json={"clientId": self._id, "clientSecret": self._secret})
        if r.status_code != 200:
            raise PluggyError(f"/auth HTTP {r.status_code}: {r.text[:300]}")
        self._key, self._key_at = r.json()["apiKey"], time.time()
        return self._key

    def get(self, path: str, **params) -> dict:
        params = {k: v for k, v in params.items() if v is not None}
        for attempt in range(4):
            r = self.http.get(path, params=params, headers={"X-API-KEY": self._auth()})
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            if r.status_code == 401 and attempt == 0:
                self._key = None
                continue
            if r.status_code != 200:
                raise PluggyError(f"GET {path} HTTP {r.status_code}: {r.text[:300]}")
            return r.json()
        raise PluggyError(f"GET {path}: muitas tentativas")

    def pages(self, path: str, **params) -> Iterator[dict]:
        """Paginacao classica (page/pageSize -> totalPages)."""
        page = 1
        while True:
            body = self.get(path, page=page, pageSize=500, **params)
            yield from body.get("results", [])
            if page >= int(body.get("totalPages") or 1):
                return
            page += 1

    def transactions(self, account_id: str, date_from: Optional[str] = None) -> Iterator[dict]:
        """/v2/transactions com cursor ('next' vem pronto; aceita URL, query string ou cursor puro)."""
        params = {"accountId": account_id, "dateFrom": date_from}
        while True:
            body = self.get("/v2/transactions", **params)
            yield from body.get("results", [])
            nxt = body.get("next")
            if not nxt:
                return
            # 'next' vem como query string pronta ('?accountId=...&after=<cursor url-encoded>')
            if "=" in nxt:
                qs = parse_qs(urlparse(nxt).query or nxt.lstrip("?"))
                params = {k: v[0] for k, v in qs.items()}
            else:
                params = {"accountId": account_id, "dateFrom": date_from, "after": nxt}
