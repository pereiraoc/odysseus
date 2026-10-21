"""Wise via token pessoal (Read only), custo zero.

Cada resposta da API vira um blob bruto JSON ({"_source": "wise_api", "kind": ...})
e passa pelo mesmo ingest/dedup dos arquivos, entao API e CSV nunca duplicam:
  balances    -> checkpoint de saldo por moeda (data do snapshot)
  statement   -> transacoes; native_id = '<referenceNumber>:<centavos>' == o do CSV
  activities  -> guardado bruto; o parse vem depois de ver a forma real com o token
Statement com token pessoal e bloqueado fora de US/CA/AU/NZ/SG/MY (403): nesse caso
fica so saldo + activities e as transacoes continuam vindo do CSV exportado.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx

from src.finance.ingest import ingest_bytes
from src.finance.store import Store

BASE = "https://api.wise.com"


def _get(client: httpx.Client, path: str, **params) -> tuple[int, object]:
    r = client.get(f"{BASE}{path}", params={k: v for k, v in params.items() if v is not None})
    try:
        body = r.json()
    except ValueError:
        body = r.text[:500]
    return r.status_code, body


def _blob(store: Store, kind: str, profile: int, payload: dict, extra: Optional[dict] = None) -> dict:
    doc = {"_source": "wise_api", "kind": kind, "profile": profile, "fetched_at": datetime.now(timezone.utc).isoformat(),
           **(extra or {}), "data": payload}
    stamp = doc["fetched_at"][:19].replace(":", "")
    name = f"wise_api/{kind}-{profile}-{(extra or {}).get('currency', '')}-{stamp}.json"
    return ingest_bytes(store, name, json.dumps(doc, ensure_ascii=False, sort_keys=True).encode())


def sync(store: Store, token: str, since: Optional[date] = None) -> dict:
    """Puxa saldos, statements (se permitido) e activities. Idempotente."""
    since = since or (date.today() - timedelta(days=60))
    out: dict = {"profiles": [], "results": [], "statement_blocked": False}
    with httpx.Client(headers={"Authorization": f"Bearer {token}"}, timeout=30) as client:
        status, profiles = _get(client, "/v2/profiles")
        if status != 200:
            raise RuntimeError(f"Wise /v2/profiles: HTTP {status} {profiles}")
        for prof in profiles:
            pid = prof["id"]
            out["profiles"].append({"id": pid, "type": prof.get("type")})
            status, balances = _get(client, f"/v4/profiles/{pid}/balances", types="STANDARD")
            if status != 200:
                out["results"].append({"profile": pid, "error": f"balances HTTP {status}"})
                continue
            out["results"].append(_blob(store, "balances", pid, balances))
            end = datetime.now(timezone.utc)
            start = datetime.combine(since, datetime.min.time(), tzinfo=timezone.utc)
            for bal in balances:
                status, stmt = _get(client, f"/v1/profiles/{pid}/balance-statements/{bal['id']}/statement.json",
                                    currency=bal["currency"], intervalStart=start.isoformat().replace("+00:00", "Z"),
                                    intervalEnd=end.isoformat().replace("+00:00", "Z"), type="COMPACT")
                if status == 200:
                    out["results"].append(_blob(store, "statement", pid, stmt,
                                                {"balance_id": bal["id"], "currency": bal["currency"]}))
                else:
                    out["statement_blocked"] = True
            status, acts = _get(client, f"/v1/profiles/{pid}/activities", size=100)
            if status == 200:
                out["results"].append(_blob(store, "activities", pid, acts))
            else:
                out["results"].append({"profile": pid, "error": f"activities HTTP {status}"})
    return out
