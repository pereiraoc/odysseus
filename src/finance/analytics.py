"""Analise mes a mes: patrimonio, ganhos x gastos, salario, taxa de poupanca, reserva.

Definicoes (documentadas tambem na UI):
  ganhos      categorias renda:* (+ entradas sem categoria; + Pix/TED recebidos de pessoas se people=True)
  gastos      tudo que sai e nao e movimento entre contas proprias (- estornos da mesma categoria)
  neutros     transferencias:interna/cambio/investimento, financeiro:rotativo, ajustes:* -- nao contam
  salario     renda:salario (base); adicional = renda:adicional:* (ex.: expatriacao) conta como ganho, nao como salario
  periodos    data/finance/ledger/periods.json: faixas de contexto (ex.: expatriado) desenhadas nos graficos
  poupanca    (ganhos - gastos) / ganhos
  patrimonio  soma do saldo de fim de mes das contas na moeda + passivo do cartao (ultima fatura
              fechada ate 45 dias antes). Moedas diferentes nao se somam (sem cambio inventado).
  aplicado    soma acumulada do que saiu para investimento (transferencias:investimento), SEM rendimento:
              estimativa ate os saldos de investimento chegarem pelo Open Finance
  investido   saldo real dos investimentos (snapshot do Open Finance mais recente ate o fim do periodo);
              antes do primeiro snapshot usa o 'aplicado' estimado
  reserva     (patrimonio + investido) / media de gastos dos ultimos 6 meses (em meses de gasto)
Mes 'incompleto' = teve transferencia interna sem a outra ponta (falta extrato/fatura do outro lado),
entao gasto de cartao daquele mes pode estar faltando.
"""
from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from datetime import date as Date

from src.finance import reconcile
from src.finance.rules import INTERNAL
from src.finance.store import Store

NEUTRAL_PREFIXES = ("transferencias:interna", "transferencias:cambio", "transferencias:investimento",
                    "financeiro:rotativo", "ajustes:")
PEOPLE = "transferencias:pessoas"
FIXED_PREFIXES = ("moradia:", "assinaturas:", "financeiro:tarifas", "contas:")
CARD_STALE_DAYS = 45


def _bucket(month: str, group: str) -> str:
    if group == "year":
        return month[:4]
    if group == "quarter":
        return f"{month[:4]}-T{(int(month[5:7]) - 1) // 3 + 1}"
    return month


def _month_ends(first: str, last: str) -> list[str]:
    import calendar
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= last[:7]:
        out.append(f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _balance_fn(store: Store, key: str):
    """saldo(d) = ancora + soma do livro + ajustes de lacuna conhecidos (igual ao ledger)."""
    txs = store.db.execute("SELECT date, amount_cents FROM transactions WHERE account_key=? ORDER BY date, id", (key,)).fetchall()
    if not txs:
        return None, None
    rec = reconcile.reconcile_balances(store, key)
    dates, cum, total = [], [], 0
    for t in txs:
        total += t["amount_cents"]
        dates.append(t["date"]); cum.append(total)

    def until(d: str) -> int:
        i = bisect_right(dates, d)
        return cum[i - 1] if i else 0
    base = rec["anchor"]["balance_cents"] - until(rec["anchor"]["date"]) if rec.get("anchor") else 0
    gaps = [(b["until"], -b["delta"]) for b in rec.get("breaks", [])]
    first = dates[0]

    def bal(d: str):
        if d < first[:7] + "-01":
            return None
        return base + until(d) + sum(v for gd, v in gaps if gd <= d)
    return bal, first


def monthly(store: Store, currency: str = "BRL", date_from: str = "", date_to: str = "",
            group: str = "month", people: bool = True) -> dict:
    db = store.db
    rows = db.execute(
        "SELECT t.id, t.date, t.amount_cents, coalesce(a.category, '') cat FROM transactions t"
        " JOIN accounts c ON c.key=t.account_key LEFT JOIN annotations a ON a.anchor_key=t.anchor_key"
        " WHERE c.currency=?", (currency,)).fetchall()
    unpaired = {r["date"][:7] for r in db.execute(
        "SELECT t.date FROM transactions t JOIN annotations a ON a.anchor_key=t.anchor_key JOIN accounts c ON c.key=t.account_key"
        " WHERE a.category=? AND c.currency=? AND t.id NOT IN (SELECT tx_a FROM transfer_pairs UNION SELECT tx_b FROM transfer_pairs)",
        (INTERNAL, currency))}

    per = defaultdict(lambda: {"invested_flow": 0, "income": 0, "expenses": 0, "salary": 0, "salary_extra": 0, "people_in": 0, "people_out": 0,
                               "fixed": 0, "variable": 0, "uncategorized": 0, "by_group": defaultdict(int), "n": 0})
    for r in rows:
        m, v, cat = r["date"][:7], r["amount_cents"], r["cat"]
        if cat.startswith("transferencias:investimento"):
            per[m]["invested_flow"] -= v  # aplicacao sai da conta (-) e entra no investimento (+)
        if any(cat.startswith(p) for p in NEUTRAL_PREFIXES):
            continue
        p = per[m]
        p["n"] += 1
        if cat == PEOPLE or cat.startswith(PEOPLE + ":"):
            p["people_in" if v > 0 else "people_out"] += v
            if not people:
                continue
            if v > 0:
                p["income"] += v
            else:
                p["expenses"] -= v
                p["variable"] -= v
                p["by_group"]["pessoas"] -= v
            continue
        if cat.startswith("renda:") or (not cat and v > 0):
            p["income"] += v
            if cat == "renda:salario":
                p["salary"] += v
            elif cat.startswith("renda:adicional"):
                p["salary_extra"] += v
            if not cat:
                p["uncategorized"] += v
            continue
        # gasto (estorno positivo na mesma categoria reduz o gasto)
        p["expenses"] -= v
        grp = cat.split(":")[0] if cat else "sem categoria"
        p["by_group"][grp] -= v
        if not cat:
            p["uncategorized"] -= v
        if any(cat.startswith(f) for f in FIXED_PREFIXES):
            p["fixed"] -= v
        else:
            p["variable"] -= v

    # patrimonio de fim de mes (contas + carteiras na moeda; cartao = -ultima fatura recente)
    accs = db.execute("SELECT key, kind FROM accounts WHERE currency=?", (currency,)).fetchall()
    fns = []
    cards = []
    for a in accs:
        if a["kind"] == "credit_card":
            cps = db.execute("SELECT date, balance_cents FROM checkpoints WHERE account_key=? AND kind='closing' ORDER BY date",
                             (a["key"],)).fetchall()
            cards.append(([c["date"] for c in cps], [c["balance_cents"] for c in cps]))
        else:
            f, _ = _balance_fn(store, a["key"])
            if f:
                fns.append(f)
    months_all = sorted(per)
    if not months_all:
        return {"currency": currency, "group": group, "periods": [], "groups": []}
    snaps = db.execute("SELECT s.investment_id, s.date, s.balance_cents FROM investment_snapshots s JOIN investments i"
                       " ON i.id=s.investment_id WHERE i.currency=? ORDER BY s.date", (currency,)).fetchall()

    def real_investments(d: str):
        last: dict[str, int] = {}
        for sn in snaps:
            if sn["date"] > d:
                break
            last[sn["investment_id"]] = sn["balance_cents"]
        return sum(last.values()) if last else None
    nw = {}
    invested = 0
    for d in _month_ends(months_all[0], months_all[-1]):
        invested += per[d[:7]]["invested_flow"] if d[:7] in per else 0
        vals = [f(d) for f in fns]
        known = [v for v in vals if v is not None]
        card_total, card_ok = 0, True
        for dates, bals in cards:
            i = bisect_right(dates, d)
            if i and (Date.fromisoformat(d) - Date.fromisoformat(dates[i - 1])).days <= CARD_STALE_DAYS:
                card_total += bals[i - 1]
            elif i or dates and dates[0] <= d:
                card_ok = False  # cartao existia mas sem fatura recente: divida desconhecida
        nw[d[:7]] = {"net_worth": sum(known) + card_total if known else None, "card_known": card_ok, "invested": invested,
                     "investments": real_investments(d)}

    # agregacao por periodo + filtros de data
    buckets: dict[str, dict] = {}
    # todos os meses entre o primeiro e o ultimo dado: mes sem nenhum lancamento aparece vazio (no_data)
    # em vez de sumir do eixo e fazer a linha "pular" o buraco
    all_months = [d[:7] for d in _month_ends(months_all[0], months_all[-1])]
    for m in all_months:
        if (date_from and m < date_from[:7]) or (date_to and m > date_to[:7]):
            continue
        k = _bucket(m, group)
        b = buckets.setdefault(k, {"period": k, "months": 0, "income": 0, "expenses": 0, "salary": 0, "salary_extra": 0, "people_in": 0,
                                   "people_out": 0, "fixed": 0, "variable": 0, "uncategorized": 0,
                                   "by_group": defaultdict(int), "incomplete": False, "card_known": True,
                                   "net_worth": None, "invested": 0, "investments": None, "n": 0, "data_months": 0})
        p = per[m] if m in per else None
        b["months"] += 1
        if p is None or not p["n"]:
            continue
        b["data_months"] += 1
        for f in ("income", "expenses", "salary", "salary_extra", "people_in", "people_out", "fixed", "variable", "uncategorized", "n"):
            b[f] += p[f]
        for g, v in p["by_group"].items():
            b["by_group"][g] += v
        b["incomplete"] = b["incomplete"] or m in unpaired
        if m in nw:  # ultimo mes do periodo define o patrimonio do periodo
            b["net_worth"] = nw[m]["net_worth"]
            b["card_known"] = nw[m]["card_known"]
            b["invested"] = nw[m]["invested"]
            b["investments"] = nw[m]["investments"]
    periods = [buckets[k] for k in sorted(buckets)]
    # periodo que contem o ultimo dia com dado e nao chegou ao fim do mes: parcial (fica fora dos KPIs)
    last_date = max(r["date"] for r in rows)
    month_end = _month_ends(last_date, last_date)[0]
    if periods and (Date.fromisoformat(month_end) - Date.fromisoformat(last_date)).days > 3:
        tail = _bucket(last_date[:7], group)
        for b in periods:
            if b["period"] == tail:
                b["partial"], b["last_date"] = True, last_date
    for b in periods:
        b.setdefault("partial", False)
        b["no_data"] = b["data_months"] == 0
    exp_hist = [per[m]["expenses"] for m in months_all]
    idx = {m: i for i, m in enumerate(months_all)}
    for b in periods:
        b["net"] = b["income"] - b["expenses"]
        b.pop("nw_plus_raw", None)
        inv = b["investments"] if b["investments"] is not None else b["invested"]
        b["investments_source"] = "real" if b["investments"] is not None else "estimado"
        b["nw_plus"] = b["net_worth"] + inv if b["net_worth"] is not None else None
        b["savings_rate"] = round(b["net"] / b["income"], 4) if b["income"] > 0 and not b["no_data"] else None
        if b["no_data"]:
            b["net_worth"] = b["nw_plus"] = None
        b["by_group"] = dict(b["by_group"])
        last_m = max((m for m in months_all if _bucket(m, group) == b["period"]), default=None)
        if last_m is None:
            b["avg_expenses_6m"], b["reserve_months"] = 0, None
            continue
        window = exp_hist[max(0, idx[last_m] - 5): idx[last_m] + 1]
        avg = sum(window) / len(window) if window else 0
        b["avg_expenses_6m"] = round(avg)
        b["reserve_months"] = round(b["nw_plus"] / avg, 1) if b["nw_plus"] is not None and avg > 0 else None
    totals = defaultdict(int)
    for b in periods:
        for g, v in b["by_group"].items():
            totals[g] += v
    groups = [g for g, _ in sorted(totals.items(), key=lambda kv: -kv[1])]
    ctx = []
    pf = store.root / "ledger" / "periods.json"
    if pf.is_file():
        import json
        ctx = json.loads(pf.read_text(encoding="utf-8")).get("periods", [])
    return {"currency": currency, "group": group, "periods": periods, "groups": groups, "context": ctx,
            "definitions": __doc__.split("Definicoes (documentadas tambem na UI):")[1].strip()}
