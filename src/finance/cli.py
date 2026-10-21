"""CLI do arquivo financeiro.

  python -m src.finance.cli import <arquivos|pastas|.zip>...   [--root DIR] [--pdf-password-env VAR]
  python -m src.finance.cli rebuild | report | queue | reparse
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import zipfile
from pathlib import Path

from src.finance import dedup, pipeline, reconcile, rules
from src.finance.ingest import ingest_bytes, ingest_paths, reparse_all
from src.finance.money import fmt_cents
from src.finance.store import Store


def _import(store: Store, paths: list[str], password: str | None) -> list[dict]:
    results = []
    for p in paths:
        if p.lower().endswith(".zip"):
            with zipfile.ZipFile(p) as z:
                for info in sorted(z.infolist(), key=lambda i: i.filename):
                    if info.is_dir() or Path(info.filename).name.startswith("."):
                        continue
                    results.append(ingest_bytes(store, info.filename, z.read(info), password))
        else:
            base = Path(p).resolve()
            results += ingest_paths(store, [base], password, root=base.parent)
    return results


def _print_report(rep: list[dict]) -> None:
    for r in rep:
        cov = r["coverage"]
        print(f"\n== {r['account']}  [{r['status']}]  {r['transactions']} transacoes  {cov['first']} .. {cov['last']}")
        if cov["missing_months"]:
            print(f"   meses sem transacao: {', '.join(cov['missing_months'])}")
        if "checked" in r:
            print(f"   checkpoints conferidos: {r['checked']}  quebras: {len(r['breaks'])}")
            for b in r["breaks"][:20]:
                print(f"     entre {b['after']} e {b['until']}: {fmt_cents(b['delta'])}  ({b['hint']})")
        else:
            print(f"   faturas: {r['bills']}  nao fecham: {len(r['unbalanced'])}  quebras de encadeamento: {len(r['chain_breaks'])}")
            for b in r["unbalanced"]:
                print(f"     {b['file']}: diff {fmt_cents(b['diff'])}")
            for c in r["chain_breaks"]:
                print(f"     entre {c['between'][0]} e {c['between'][1]}: fechou {fmt_cents(c['prev_closing'] or 0)}"
                      f", abriu {fmt_cents(c['next_opening'] or 0)}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="finance")
    ap.add_argument("--root", help="diretorio de dados (default data/finance)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    imp = sub.add_parser("import")
    imp.add_argument("paths", nargs="+")
    imp.add_argument("--pdf-password-env", default="FINANCE_PDF_PASSWORD")
    sub.add_parser("rebuild")
    sub.add_parser("report")
    sub.add_parser("queue")
    sub.add_parser("wise-sync")
    un = sub.add_parser("uncategorized")
    un.add_argument("--limit", type=int, default=80)
    lg = sub.add_parser("ledger")
    lg.add_argument("--no-commit", action="store_true")
    rp = sub.add_parser("reparse")
    rp.add_argument("--pdf-password-env", default="FINANCE_PDF_PASSWORD")
    a = ap.parse_args(argv)
    store = Store(a.root)
    try:
        if a.cmd in ("import", "reparse"):
            pw = os.environ.get(a.pdf_password_env) or None
            if a.cmd == "import":
                res = _import(store, a.paths, pw)
                # 2a passada: planilhas sem numero de conta dependem de a conta ja existir
                retry = {r["sha256"]: r for r in reparse_all(store, pw, only_errors=True)}
                res = [retry.get(r["sha256"], r) for r in res]
            else:
                res = reparse_all(store, pw)
            ok = [r for r in res if r["status"] == "parsed"]
            err = [r for r in res if r["status"] != "parsed"]
            print(f"arquivos: {len(res)}  ok: {len(ok)}  erro: {len(err)}  registros novos: {sum(r['new_records'] for r in ok)}")
            for r in err:
                print(f"  ERRO {r['name']}: {r['error']}")
            for r in ok:
                for w in r["warnings"]:
                    print(f"  AVISO {r['name']}: {w}")
            print("refresh:", json.dumps(pipeline.refresh(store)["categories"] | {"hits": None}))
        elif a.cmd == "rebuild":
            r = pipeline.refresh(store)
            print(json.dumps({k: v for k, v in r.items() if k != "categories"}))
            print("categorias:", json.dumps({k: v for k, v in r["categories"].items() if k != "hits"}))
        elif a.cmd == "report":
            _print_report(reconcile.report(store))
        elif a.cmd == "wise-sync":
            from src.finance import wise_api
            token = os.environ.get("WISE_API_TOKEN")
            if not token:
                print("defina WISE_API_TOKEN"); return 2
            res = wise_api.sync(store, token)
            print(json.dumps({k: v for k, v in res.items() if k != "results"}, ensure_ascii=False))
            for r in res["results"]:
                print(" ", r.get("name") or r, r.get("status", ""), r.get("error", ""))
            print("refresh:", json.dumps(pipeline.refresh(store)["transfers"]))
        elif a.cmd == "uncategorized":
            for g in rules.uncategorized(store, a.limit):
                print(f"{g['count']:5d} {fmt_cents(g['sum_cents']):>12s} {g['currency']} {g['institution']}/{g['kind']:12s} "
                      f"{g['merchant'][:45]:45s} | {g['examples'][0][:70]}")
        elif a.cmd == "ledger":
            from src.finance.ledger import export
            print(json.dumps(export(store, commit=not a.no_commit)))
        elif a.cmd == "queue":
            for q in store.db.execute("SELECT q.reason, s.* FROM review_queue q JOIN source_records s ON s.id=q.record_id"
                                      " ORDER BY s.account_key, s.date"):
                print(f"{q['reason']:20s} {q['account_key']:40s} {q['date']} {fmt_cents(q['amount_cents']):>10s}  {q['description'][:70]}")
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
