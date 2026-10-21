"""Analise mes a mes: patrimonio, ganhos x gastos, salario, taxa de poupanca, reserva.

Definicoes (documentadas tambem na UI):
  ganhos      categorias renda:* (+ entradas sem categoria; + Pix/TED recebidos de pessoas se people=True)
  gastos      tudo que sai e nao e movimento entre contas proprias (- estornos da mesma categoria)
  neutros     transferencias:interna/cambio/investimento, financeiro:rotativo, ajustes:* -- nao contam
  salario     renda:salario (base); adicional = renda:adicional:* (ex.: expatriacao) conta como ganho, nao como salario
  13o/extra   ESTIMADOS (o extrato nao traz a quebra do holerite): base = mediana do salario dos ate 6 meses
              normais anteriores; base = mediana dos meses vizinhos (3 antes/3 depois, sem nov/dez); o que passar de 1,25x a base vira 13o em nov/dez e 'extra' nos outros meses
              (ferias ou outro pagamento avulso; o padrao tipico de ferias e deposito fora do dia + saldo menor no fim do mes). Hora extra fica dentro do salario normal e nao se separa.
  periodos    data/finance/ledger/periods.json: faixas de contexto (ex.: expatriado) desenhadas nos graficos
  poupanca    (ganhos - gastos) / ganhos
  patrimonio  soma do saldo de fim de mes das contas na moeda + passivo do cartao (ultima fatura
              fechada ate 45 dias antes). Moedas diferentes nao se somam (sem cambio inventado).
  aplicado    soma acumulada do que saiu para investimento (transferencias:investimento), SEM rendimento:
              estimativa ate os saldos de investimento chegarem pelo Open Finance
  investido   saldo real dos investimentos (snapshot do Open Finance mais recente ate o fim do periodo);
              antes do primeiro snapshot usa o 'aplicado' estimado
  cambio      no agregado (ALL), a diferenca entre a saida em BRL e a chegada na outra moeda (cotacao do dia)
              vira gasto 'custo de cambio'; as duas pontas em si nao sao ganho nem gasto
  reserva     (patrimonio + investido) / media de gastos dos ultimos 6 meses (em meses de gasto)
Mes 'incompleto' = teve transferencia interna sem a outra ponta (falta extrato/fatura do outro lado),
entao gasto de cartao daquele mes pode estar faltando.
"""
from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from datetime import date as Date, timedelta

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


ALL = "ALL"  # todas as moedas convertidas para BRL pela cotacao da data (fx.py)


def _amounts(store: Store, currency: str):
    """(filtro SQL de moeda, conversor). currency=ALL -> todas as contas, cada valor em BRL pela cotacao do dia."""
    if currency == ALL:
        from src.finance.fx import Converter
        conv = Converter(store)
        return "1=1", (), (lambda cents, cur, day: cents if cur == "BRL" else conv.to_brl(cents, cur, day)), conv
    return "c.currency=?", (currency,), (lambda cents, cur, day: cents), None


def monthly(store: Store, currency: str = "BRL", date_from: str = "", date_to: str = "",
            group: str = "month", people: bool = True) -> dict:
    db = store.db
    where, wargs, conv, converter = _amounts(store, currency)
    raw_rows = db.execute(
        "SELECT t.id, t.date, t.amount_cents, coalesce(a.category, '') cat, c.currency cur FROM transactions t"
        " JOIN accounts c ON c.key=t.account_key LEFT JOIN annotations a ON a.anchor_key=t.anchor_key"
        f" WHERE {where}", wargs).fetchall()
    rows, unconverted = [], 0
    for r in raw_rows:
        v = conv(r["amount_cents"], r["cur"], r["date"])
        if v is None:
            unconverted += 1
            continue
        rows.append({"id": r["id"], "date": r["date"], "amount_cents": v, "cat": r["cat"]})
    unpaired = {r["date"][:7] for r in db.execute(
        "SELECT t.date FROM transactions t JOIN annotations a ON a.anchor_key=t.anchor_key JOIN accounts c ON c.key=t.account_key"
        f" WHERE a.category=? AND {where} AND t.id NOT IN (SELECT tx_a FROM transfer_pairs UNION SELECT tx_b FROM transfer_pairs)",
        (INTERNAL, *wargs))}

    per = defaultdict(lambda: {"invested_flow": 0, "income": 0, "expenses": 0, "salary": 0, "salary_extra": 0, "salary_base": 0, "salary_13": 0, "salary_other": 0, "people_in": 0, "people_out": 0,
                               "fixed": 0, "variable": 0, "uncategorized": 0, "by_group": defaultdict(int), "n": 0})
    cambio_net: dict[str, int] = defaultdict(int)
    for r in rows:
        m, v, cat = r["date"][:7], r["amount_cents"], r["cat"]
        if currency == ALL and cat.startswith("transferencias:cambio"):
            cambio_net[m] += v  # saiu em BRL (-) + entrou na outra moeda (+, em BRL do dia) = custo do cambio
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

    # no agregado, o que se perdeu entre as duas pontas do cambio (spread/taxas) e gasto real
    for m, net in cambio_net.items():
        if net < 0:
            p = per[m]
            p["expenses"] -= net
            p["variable"] -= net
            p["by_group"]["custo de cambio"] -= net
            p["n"] += 1

    # decomposicao ESTIMADA do salario por mes: base x 13o x extra. Base = mediana dos meses vizinhos
    # (ate 3 antes e 3 depois, sem nov/dez): aumento de salario entra na base, pico isolado nao.
    from statistics import median
    sal_months = [m for m in sorted(per) if per[m]["salary"] > 0]
    regular = [m for m in sal_months if m[5:7] not in ("11", "12")]
    for m in sorted(per):
        p = per[m]
        total = p["salary"]
        p["salary_base"], p["salary_13"], p["salary_other"] = total, 0, 0
        if total <= 0:
            continue
        def dist(a: str, b: str) -> int:
            return abs((int(a[:4]) - int(b[:4])) * 12 + int(a[5:7]) - int(b[5:7]))
        before = [x for x in regular if x < m and dist(x, m) <= 6][-3:]
        after = [x for x in regular if x > m and dist(x, m) <= 6][:3]
        neigh = [per[x]["salary"] for x in before + after]
        if len(neigh) < 3:
            continue
        base = median(neigh)
        if total > base * 1.25:
            p["salary_base"] = round(base)
            if m[5:7] in ("11", "12"):
                p["salary_13"] = total - round(base)
            else:
                p["salary_other"] = total - round(base)

    # patrimonio de fim de mes (contas + carteiras na moeda; cartao = -ultima fatura recente)
    accs = db.execute(f"SELECT key, kind, currency FROM accounts c WHERE {where}", wargs).fetchall()
    fns = []
    cards = []
    for a in accs:
        if a["kind"] == "credit_card":
            cps = db.execute("SELECT date, balance_cents FROM checkpoints WHERE account_key=? AND kind='closing' ORDER BY date",
                             (a["key"],)).fetchall()
            cards.append(([c["date"] for c in cps], [c["balance_cents"] for c in cps], a["currency"]))
        else:
            f, _ = _balance_fn(store, a["key"])
            if f:
                fns.append((f, a["currency"]))
    months_all = sorted(per)
    if not months_all:
        return {"currency": currency, "group": group, "periods": [], "groups": []}
    snaps = db.execute("SELECT s.investment_id, s.date, s.balance_cents, i.currency FROM investment_snapshots s JOIN investments i"
                       " ON i.id=s.investment_id" + ("" if currency == ALL else " WHERE i.currency=?") + " ORDER BY s.date",
                       () if currency == ALL else (currency,)).fetchall()

    def real_investments(d: str):
        last: dict[str, int] = {}
        for sn in snaps:
            if sn["date"] > d:
                break
            last[sn["investment_id"]] = conv(sn["balance_cents"], sn["currency"], d) or 0
        return sum(last.values()) if last else None
    nw = {}
    invested = 0
    for d in _month_ends(months_all[0], months_all[-1]):
        invested += per[d[:7]]["invested_flow"] if d[:7] in per else 0
        vals = [f(d) for f, _ in fns]
        vals = [None if v is None else conv(v, cur, d) for v, (_, cur) in zip(vals, fns)]
        known = [v for v in vals if v is not None]
        card_total, card_ok = 0, True
        for dates, bals, ccur in cards:
            i = bisect_right(dates, d)
            if i and (Date.fromisoformat(d) - Date.fromisoformat(dates[i - 1])).days <= CARD_STALE_DAYS:
                card_total += conv(bals[i - 1], ccur, d) or 0
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
        b = buckets.setdefault(k, {"period": k, "months": 0, "income": 0, "expenses": 0, "salary": 0, "salary_extra": 0,
                                   "salary_base": 0, "salary_13": 0, "salary_other": 0, "people_in": 0,
                                   "people_out": 0, "fixed": 0, "variable": 0, "uncategorized": 0,
                                   "by_group": defaultdict(int), "incomplete": False, "card_known": True,
                                   "net_worth": None, "invested": 0, "investments": None, "n": 0, "data_months": 0})
        p = per[m] if m in per else None
        b["months"] += 1
        if p is None or not p["n"]:
            continue
        b["data_months"] += 1
        for f in ("income", "expenses", "salary", "salary_extra", "salary_base", "salary_13", "salary_other", "people_in", "people_out", "fixed", "variable", "uncategorized", "n"):
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
    return {"currency": currency, "display_currency": "BRL" if currency == ALL else currency, "unconverted": unconverted,
            "fx_source": "cotacao BCE do dia de cada lancamento (fim do mes para saldos)" if currency == ALL else None,
            "group": group, "periods": periods, "groups": groups, "context": ctx,
            "definitions": __doc__.split("Definicoes (documentadas tambem na UI):")[1].strip()}


# ---------------------------------------------------------------------------------------------
# custo mensal: essencial fixo x assinaturas x variavel (media dos ultimos 3 meses FECHADOS)
DEFAULT_COST_CLASSES = {
    "essencial": ["moradia:aluguel", "moradia:condominio", "moradia:energia", "moradia:agua", "moradia:gas",
                  "moradia:telefone-internet", "moradia:contas", "financeiro:seguros", "saude:plano", "educacao:mensalidade"],
    "assinaturas": ["assinaturas:"],
    "ignorar": ["transferencias:interna", "transferencias:cambio", "transferencias:investimento", "financeiro:rotativo",
                "ajustes:", "renda:"],
}


def _cost_classes(store: Store) -> dict:
    import json
    p = store.root / "ledger" / "cost_classes.json"
    if not p.is_file():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(DEFAULT_COST_CLASSES, ensure_ascii=False, indent=1), encoding="utf-8")
    return json.loads(p.read_text(encoding="utf-8"))


def _class_of(cat: str, classes: dict) -> str:
    def hit(prefixes):
        return any(cat == p or cat.startswith(p if p.endswith(":") else p + ":") or (p.endswith(":") and cat.startswith(p))
                   for p in prefixes)
    if not cat:
        return "variavel"
    if hit(classes.get("ignorar", [])):
        return "ignorar"
    if hit(classes.get("essencial", [])):
        return "essencial"
    if hit(classes.get("assinaturas", [])):
        return "assinaturas"
    return "variavel"


def _shift_late(per_month: dict[str, list], months: list[str]) -> list[str]:
    """Regra do usuario: pagamento feito no mes seguinte mas que e do anterior conta no anterior.
    Mes fechado sem pagamento + mes seguinte com pagamento(s) -> o primeiro do seguinte volta 1 mes."""
    moved = []
    for i, m in enumerate(months[:-1]):
        nxt = months[i + 1]
        if not per_month.get(m) and per_month.get(nxt):
            if len(per_month[nxt]) >= 2 or i + 1 == len(months) - 1:
                per_month[nxt].sort(key=lambda r: r["date"])
                per_month.setdefault(m, []).append(per_month[nxt].pop(0))
                moved.append(f"{nxt} -> {m}")
    return moved


def cost_structure(store: Store, today: str | None = None, currency: str = "BRL", n_months: int = 3) -> dict:
    import re
    from datetime import date as _date
    from src.finance.rules import merchant
    t = _date.fromisoformat(today) if today else _date.today()
    open_month = f"{t.year:04d}-{t.month:02d}"
    y, m = t.year, t.month
    closed = []
    for _ in range(n_months):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        closed.insert(0, f"{y:04d}-{m:02d}")
    window = closed + [open_month]  # o mes aberto so serve para trazer pagamento atrasado do ultimo fechado
    classes = _cost_classes(store)
    where, wargs, conv, _ = _amounts(store, currency)
    rows = []
    for r in store.db.execute(
            "SELECT t.id, t.date, t.amount_cents, t.description, coalesce(a.category, '') cat, c.currency cur FROM transactions t"
            " JOIN accounts c ON c.key=t.account_key LEFT JOIN annotations a ON a.anchor_key=t.anchor_key"
            f" WHERE {where} AND t.date >= ? AND t.date < ?",
            (*wargs, closed[0] + "-01", _month_ends(open_month, open_month)[0] + "T")).fetchall():
        v = conv(r["amount_cents"], r["cur"], r["date"])
        if v is not None:
            rows.append({**dict(r), "amount_cents": v})

    buckets: dict[str, dict[str, dict[str, list]]] = {"essencial": {}, "assinaturas": {}, "variavel": {}}
    for r in rows:
        klass = _class_of(r["cat"], classes)
        if klass == "ignorar" or (r["cat"].startswith("transferencias:pessoas") and r["amount_cents"] > 0):
            continue
        if klass == "variavel" and r["amount_cents"] > 0 and not r["cat"]:
            continue  # entrada sem categoria nao e "gasto negativo"
        if klass == "essencial":
            key = r["cat"]
        elif klass == "assinaturas":
            key = re.sub(r"\s*(parc\s*\d+|\d+/\d+)$", "", merchant(r["description"])) or r["cat"]
        else:
            key = (r["cat"].split(":")[0] if r["cat"] else "sem categoria")
            if r["cat"].startswith("transferencias:pessoas"):
                key = "pix/ted para pessoas"
        buckets[klass].setdefault(key, {}).setdefault(r["date"][:7], []).append(dict(r))

    out: dict = {"months": closed, "open_month": open_month, "currency": currency,
                 "display_currency": "BRL" if currency == ALL else currency, "classes": {}}
    for klass, series in buckets.items():
        items = []
        for key, per_month in series.items():
            moved = _shift_late(per_month, window) if klass != "variavel" else []
            vals = {mm: -sum(x["amount_cents"] for x in per_month.get(mm, [])) for mm in closed}
            total = sum(vals.values())
            if total <= 0 and klass != "variavel":
                continue
            items.append({"key": key, "months": vals, "avg": round(total / len(closed)),
                          "payments": sum(len(per_month.get(mm, [])) for mm in closed), "shifted": moved,
                          "category": next((x["cat"] for mm in closed for x in per_month.get(mm, [])), "")})
        items.sort(key=lambda i: -i["avg"])
        out["classes"][klass] = {"avg": sum(i["avg"] for i in items), "items": items}
    out["total_avg"] = sum(c["avg"] for c in out["classes"].values())

    # salario base medio dos mesmos meses (para %); vem da analise mensal
    mon = {p["period"]: p for p in monthly(store, currency)["periods"]}
    base = [mon[mm]["salary_base"] for mm in closed if mm in mon]
    out["salary_base_avg"] = round(sum(base) / len(base)) if base else None
    out["incomplete_months"] = [mm for mm in closed if mm in mon and (mon[mm]["incomplete"] or mon[mm]["no_data"])]
    out["future_installments"] = future_installments(store, t.isoformat())
    out["open_bill"] = open_bill(store)
    return out


def future_installments(store: Store, today: str, months_ahead: int = 12) -> list[dict]:
    """Parcelas ja contratadas que ainda vao cair nos cartoes. O Open Finance nao lista as parcelas futuras,
    entao elas sao projetadas das parcelas ja lancadas: ultima vista k/N (nos ultimos 70 dias) -> faltam N-k
    do mesmo valor, uma por mes."""
    import re
    from datetime import date as _date
    t = _date.fromisoformat(today)
    rx = re.compile(r"^(.*?)[\s-]*(?:parcela\s*)?(\d{1,2})/(\d{1,2})\s*$", re.I)
    series: dict[tuple, dict] = {}
    import json
    for r in store.db.execute(
            "SELECT t.date, t.amount_cents, t.description, t.account_key,"
            " (SELECT group_concat(s.extra_json, '\x1e') FROM tx_links l JOIN source_records s ON s.id=l.record_id WHERE l.tx_id=t.id) ex"
            " FROM transactions t JOIN accounts a ON a.key=t.account_key"
            " WHERE a.kind='credit_card' AND t.amount_cents < 0 AND t.date >= ?", ((t.replace(day=1) - timedelta(days=75)).isoformat(),)):
        desc = " ".join(r["description"].split())
        k = n = None
        for e in (r["ex"] or "").split("\x1e"):
            if e:
                d = json.loads(e)
                if d.get("installments"):
                    k, n = int(d.get("installment") or 0), int(d["installments"])
                    break
        m = rx.match(desc)
        if n is None and m:
            k, n = int(m.group(2)), int(m.group(3))
        if not n or n < 2 or not k or k > n:
            continue
        base = (m.group(1) if m else desc).strip(" -*").lower()
        key = (r["account_key"], base, r["amount_cents"], n)
        cur = series.get(key)
        if not cur or k > cur["k"]:
            series[key] = {"k": k, "n": n, "date": r["date"], "description": base, "amount": -r["amount_cents"],
                           "account": r["account_key"]}
    by_month: dict[str, dict] = {}
    for sr in series.values():
        last = _date.fromisoformat(sr["date"])
        if (t - last).days > 70 or sr["k"] >= sr["n"]:  # parcela do mes corrente pode estar so na fatura aberta
            continue
        y, mo = last.year, last.month
        for i in range(sr["k"] + 1, sr["n"] + 1):
            mo += 1
            if mo > 12:
                y, mo = y + 1, 1
            key = f"{y:04d}-{mo:02d}"
            if key <= f"{t.year:04d}-{t.month:02d}":
                continue  # ja caiu (ou cai na fatura aberta)
            b = by_month.setdefault(key, {"total": 0, "items": []})
            b["total"] += sr["amount"]
            b["items"].append({"description": sr["description"], "amount": sr["amount"], "installment": f"{i}/{sr['n']}",
                               "account": sr["account"]})
    return [{"month": k, **v} for k, v in sorted(by_month.items())][:months_ahead]


def open_bill(store: Store) -> list[dict]:
    """Fatura aberta ate agora: lancamentos PENDING do ultimo bruto completo de cada cartao no Open Finance."""
    import json
    from src.finance.importers.pluggy import account_ref, cents
    latest: dict[str, tuple] = {}
    for r in store.db.execute("SELECT sha256, first_seen_at FROM raw_blobs WHERE source_name LIKE 'pluggy/%'"
                              " AND source_name NOT LIKE '%investments%' AND status='parsed' ORDER BY first_seen_at"):
        doc = json.loads(store.blob_bytes(r["sha256"]))
        acc = doc.get("account") or {}
        if acc.get("type") == "CREDIT":
            latest[acc["id"]] = (doc, r["first_seen_at"])
    out = []
    for doc, seen in latest.values():
        pend = [t for t in doc.get("transactions", []) if t.get("status") == "PENDING"
                and not (t.get("creditCardMetadata") or {}).get("totalInstallments")]
        purchases = sum(cents(t["amount"]) for t in pend if t["amount"] > 0)
        credits = -sum(cents(t["amount"]) for t in pend if t["amount"] < 0)
        out.append({"account": account_ref(doc["institution"], doc["account"]).key, "as_of": doc.get("item_last_updated"),
                    "purchases": purchases, "credits": credits, "count": len(pend)})
    return out
