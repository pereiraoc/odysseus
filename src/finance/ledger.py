"""Export do livro canonico para hledger (data/finance/ledger/), versionado em git local.

  main.journal         include de cada ano, em ordem (assercoes sao cumulativas)
  AAAA.journal         transacoes + assercoes de saldo dos checkpoints de conta/carteira
Cada lacuna detectada pelo reconcile vira uma transacao EXPLICITA em ajustes:lacunas
(com o intervalo e o motivo), para `hledger check` passar sem esconder o buraco.
Valores: ponto decimal, sem milhar, codigo da moeda depois ('-169.67 BRL').
"""
from __future__ import annotations

import re
import subprocess
from collections import defaultdict
from pathlib import Path

from src.finance.money import fmt_cents
from src.finance.reconcile import reconcile_balances
from src.finance.store import Store

HEADER = "; gerado por src/finance/ledger.py a partir de data/finance/finance.sqlite -- nao editar a mao\n"


def account_name(row) -> str:
    inst, kind, number, cur = row["institution"], row["kind"], row["number"], row["currency"]
    num = re.sub(r"[^0-9A-Za-z]", "", number) or "x"
    if kind == "credit_card":
        return f"passivos:{inst}:cartao-{num}"
    if kind == "wallet":
        return f"ativos:{inst}:{cur.lower()}-{num}"
    return f"ativos:{inst}:conta-{num}"


def _clean(text: str) -> str:
    # ';' abre comentario e '|' e separador de payee no hledger
    return " ".join(text.replace(";", ",").replace("|", "/").split())[:120] or "(sem descricao)"


def export(store: Store, out_dir: Path | None = None, commit: bool = True) -> dict:
    out = Path(out_dir) if out_dir else store.root / "ledger"
    out.mkdir(parents=True, exist_ok=True)
    db = store.db
    accounts = {r["key"]: r for r in db.execute("SELECT * FROM accounts")}
    entries: dict[str, list[tuple]] = defaultdict(list)  # ano -> (data, ordem, texto)

    for t in db.execute("SELECT t.*, (SELECT group_concat(s.importer || ':' || substr(s.first_blob,1,12), ' ')"
                        " FROM tx_links l JOIN source_records s ON s.id=l.record_id WHERE l.tx_id=t.id) AS src"
                        " FROM transactions t ORDER BY t.date, t.id"):
        acc = accounts[t["account_key"]]
        cur = acc["currency"]
        ann = db.execute("SELECT category FROM annotations WHERE anchor_key=?", (t["anchor_key"],)).fetchone()
        other = f"categorias:{ann['category']}" if ann and ann["category"] else "categorias:a-categorizar"
        text = (f"{t['date']} {_clean(t['description'])}\n"
                f"    ; src:{(t['src'] or '').replace(' ', ',')}\n"
                f"    {account_name(acc)}    {fmt_cents(t['amount_cents'])} {cur}\n"
                f"    {other}\n")
        entries[t["date"][:4]].append((t["date"], 0, text))

    gaps = 0
    asserts = 0
    for key, acc in accounts.items():
        if acc["kind"] == "credit_card":
            continue  # fatura: conferida por reconcile_bills (datas de corte ambiguas para assercao diaria)
        rec = reconcile_balances(store, key)
        if rec["status"] == "sem_checkpoint":
            continue
        cur = acc["currency"]
        name = account_name(acc)
        anchor = rec["anchor"]
        # abertura: saldo antes da primeira transacao conhecida
        first = db.execute("SELECT min(date) d FROM transactions WHERE account_key=?", (key,)).fetchone()["d"] or anchor["date"]
        before = db.execute("SELECT coalesce(sum(amount_cents),0) FROM transactions WHERE account_key=? AND date<=?",
                            (key, anchor["date"])).fetchone()[0]
        opening = anchor["balance_cents"] - before
        if opening:
            entries[first[:4]].append((first, -1, f"{first} * saldo inicial {name}\n    {name}    {fmt_cents(opening)} {cur}\n"
                                                    f"    patrimonio:saldo-inicial\n"))
        for b in rec["breaks"]:
            gaps += 1
            entries[b["until"][:4]].append((b["until"], 1,
                f"{b['until']} ! lacuna de dados {name}\n    ; lacuna: entre {b['after']} e {b['until']}, {b['hint']}\n"
                f"    {name}    {fmt_cents(-b['delta'])} {cur}\n    ajustes:lacunas\n"))
        for cp in db.execute("SELECT DISTINCT date, balance_cents FROM checkpoints WHERE account_key=? AND kind='closing'"
                             " ORDER BY date", (key,)):
            asserts += 1
            entries[cp["date"][:4]].append((cp["date"], 2,
                f"{cp['date']} * conferencia de saldo\n    {name}    0 {cur} = {fmt_cents(cp['balance_cents'])} {cur}\n"))

    years = sorted(entries)
    used_accounts = {"ajustes:lacunas", "patrimonio:saldo-inicial", "categorias:a-categorizar"}
    used_accounts |= {account_name(a) for a in accounts.values()}
    used_accounts |= {f"categorias:{r['category']}" for r in db.execute(
        "SELECT DISTINCT category FROM annotations WHERE category IS NOT NULL")}
    currencies = sorted({a["currency"] for a in accounts.values()})
    decls = "".join(f"commodity 1000.00 {c}\n" for c in currencies) + "".join(f"account {a}\n" for a in sorted(used_accounts))
    for y in years:
        body = "".join(text + "\n" for _, _, text in sorted(entries[y], key=lambda e: (e[0], e[1])))
        (out / f"{y}.journal").write_text(HEADER + "\n" + body, encoding="utf-8")
    (out / "main.journal").write_text(HEADER + decls + "\n" + "".join(f"include {y}.journal\n" for y in years),
                                      encoding="utf-8")
    result = {"dir": str(out), "years": years, "assertions": asserts, "gaps": gaps}
    if commit:
        result["commit"] = _git_commit(out)
    return result


def _git_commit(repo: Path) -> str:
    def git(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=60)
    if not (repo / ".git").exists():
        git("init", "-q")
    git("add", "-A")
    if not git("status", "--porcelain").stdout.strip():
        return "sem mudancas"
    r = git("-c", "user.name=odysseus-finance", "-c", "user.email=finance@localhost",
            "commit", "-q", "-m", "export automatico do livro canonico")
    return "ok" if r.returncode == 0 else f"falhou: {r.stderr.strip()}"
