"""Fase 0 (spike): o que o Meu Pluggy entrega DE FATO para cada banco. So leitura.

  ./venv/bin/python -m src.finance.pluggy_probe [--out DIR]

Le PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET / PLUGGY_ITEM_IDS do ambiente ou do .env
da raiz do repo. Grava cada resposta JSON bruta em --out (padrao: data/finance/pluggy-probe/,
chmod 700) e imprime um resumo: contas, meses de transacao, faturas, investimentos,
emprestimos e validade do consentimento. Nao grava nada no livro.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

from src.finance.pluggy_client import Pluggy, PluggyError

ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    env = ROOT / ".env"
    if not env.is_file():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data" / "finance" / "pluggy-probe"))
    a = ap.parse_args(argv)
    load_env()
    cid, secret = os.environ.get("PLUGGY_CLIENT_ID"), os.environ.get("PLUGGY_CLIENT_SECRET")
    items = [i.strip() for i in os.environ.get("PLUGGY_ITEM_IDS", "").split(",") if i.strip()]
    if not (cid and secret and items):
        print("faltam PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET ou PLUGGY_ITEM_IDS no .env")
        return 2
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    os.chmod(out, 0o700)

    def save(name: str, obj) -> None:
        (out / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")

    p = Pluggy(cid, secret)
    try:
        for item_id in items:
            try:
                item = p.get(f"/items/{item_id}")
            except PluggyError as exc:
                print(f"\n## item {item_id}: ERRO {exc}")
                continue
            save(f"item-{item_id}", item)
            conn = (item.get("connector") or {}).get("name")
            print(f"\n## item {item_id} · {conn} · status {item.get('status')}/{item.get('executionStatus')}")
            print(f"   atualizado {item.get('lastUpdatedAt')} · proximo auto-sync {item.get('nextAutoSyncAt')}"
                  f" · consentimento ate {item.get('consentExpiresAt')}")
            prods = (item.get("connector") or {}).get("products")
            if prods:
                print(f"   produtos do conector: {', '.join(prods)}")
            accounts = p.get("/accounts", itemId=item_id).get("results", [])
            save(f"accounts-{item_id}", accounts)
            for acc in accounts:
                print(f"   conta {acc.get('type')}/{acc.get('subtype')} · {acc.get('name')} · {acc.get('number')}"
                      f" · saldo {acc.get('balance')} {acc.get('currencyCode')}")
                txs = list(p.transactions(acc["id"]))
                save(f"transactions-{acc['id']}", txs)
                months = Counter(t["date"][:7] for t in txs)
                status = Counter(t.get("status") for t in txs)
                prov = sum(1 for t in txs if t.get("providerId"))
                if txs:
                    print(f"     transacoes: {len(txs)} · {min(months)} -> {max(months)} · {len(months)} meses"
                          f" · status {dict(status)} · com providerId {prov}")
                else:
                    print("     transacoes: 0")
                if acc.get("type") == "CREDIT":
                    try:
                        bills = list(p.pages("/bills", accountId=acc["id"]))
                        save(f"bills-{acc['id']}", bills)
                        ds = sorted(b.get("dueDate", "")[:10] for b in bills)
                        print(f"     faturas: {len(bills)}" + (f" · {ds[0]} -> {ds[-1]}" if ds else ""))
                    except PluggyError as exc:
                        print(f"     faturas: indisponivel ({exc})")
            for name, path in (("investimentos", "/investments"), ("emprestimos", "/loans"), ("identidade", "/identity")):
                try:
                    body = p.get(path, itemId=item_id)
                except PluggyError as exc:
                    print(f"   {name}: indisponivel ({str(exc)[:120]})")
                    continue
                save(f"{path.strip('/')}-{item_id}", body)
                res = body.get("results", body if isinstance(body, list) else None)
                if name == "identidade":
                    print("   identidade: ok" if body else "   identidade: vazio")
                    continue
                res = res or []
                print(f"   {name}: {len(res)}")
                for inv in res[:25]:
                    if name == "investimentos":
                        print(f"     {inv.get('type')}/{inv.get('subtype')} · {inv.get('name')} · saldo {inv.get('balance')}")
                        try:
                            itx = list(p.pages(f"/investments/{inv['id']}/transactions"))
                            save(f"investment-tx-{inv['id']}", itx)
                            if itx:
                                ds = sorted(t.get("date", "")[:10] for t in itx)
                                print(f"       movimentacoes: {len(itx)} · {ds[0]} -> {ds[-1]}")
                        except PluggyError as exc:
                            print(f"       movimentacoes: indisponivel ({str(exc)[:100]})")
                    else:
                        print(f"     {inv.get('productName') or inv.get('type')} · contrato {inv.get('contractNumber')}"
                              f" · saldo devedor {inv.get('outstandingBalance')}")
    finally:
        p.close()
    print(f"\nrespostas brutas em {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
