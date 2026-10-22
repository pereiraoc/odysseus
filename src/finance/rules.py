"""Categorizacao por regras deterministicas (spec F3).

Regras em data/finance/ledger/rules.json (fica nos SEUS dados, versionado no git do
ledger: tem nomes de pessoas/estabelecimentos, nao vai para o repo do codigo).

  {"id": "ifood", "priority": 100,
   "when": {"text_any": ["ifood"], "kind": "credit_card", "sign": "debit"},
   "then": {"category": "alimentacao:delivery"}}

Condicoes (todas precisam bater; texto e normalizado sem acento/caixa):
  text_any / text_all / text_none   substrings da descricao
  merchant_any                      substrings do estabelecimento extraido (merchant())
  regex                             regex na descricao normalizada
  institution / kind / currency     da conta ('nubank', 'credit_card', 'BRL'...)
  sign                              'debit' (saida) | 'credit' (entrada)
  min / max                         valor absoluto em reais
  provider_category_any             categoria que o Open Finance/Pluggy mandou (ingles: 'Eating out', ...)
  flag                              marca do importador ('self_transfer' = de/para o seu proprio CPF)
  counterparty_account_any          conta da outra ponta ('033/3735/713086548'; substring, so Open Finance)
  date_from / date_to               periodo (AAAA-MM ou AAAA-MM-DD, inclusivo)
Acoes: category (obrigatoria). Vence a regra de MAIOR priority; empate -> ordem no arquivo.
Categoria manual (annotations.manual=1) nunca e sobrescrita.

Transferencias entre contas proprias: categoria 'transferencias:interna' (ou filha).
pair_transfers() casa as duas pernas (valor oposto, contas diferentes, +-5 dias).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date as Date
from pathlib import Path

from src.finance.money import norm_desc
from src.finance.store import Store, now

INTERNAL = "transferencias:interna"
PAIR_WINDOW_DAYS = 5

# extrai o estabelecimento/contraparte de descricoes de banco (para agrupar e para regras)
_MERCHANT = [
    re.compile(r"emitida por (.+)$", re.I),                                   # Wise cartao
    re.compile(r"^(?:compra cartao maestro|compra cartao deb mc) \| \d\d/\d\d (.+)$", re.I),
    re.compile(r"^compra no d[eé]bito(?: via nupay)? - (.+)$", re.I),
    re.compile(r"^transfer[eê]ncia (?:enviada|recebida)(?: pelo pix)? - (.+?)(?: - .*)?$", re.I),
    re.compile(r"^(?:pix enviado|pix recebido)[^|]*\| (.+)$", re.I),
    re.compile(r"^pix (?:enviado|recebido)(?: outra inst)?(?: -? ?(?:dif tit|mesma tit|mesmatit))?\s+(?!\|)(.+)$", re.I),  # 'PIX RECEBIDO Suelen Valentini' (Santander antigo)
    re.compile(r"^(?:ted|doc|transferencia|a doc|emissao de doc)[^|]*\| (.+)$", re.I),
    re.compile(r"^enviou dinheiro para (.+)$", re.I),
    re.compile(r"^recebeu dinheiro de (.+?)(?: com a refer.*)?$", re.I),
    re.compile(r'^iof de "(.+)"$', re.I),
    re.compile(r"^iof de volta de (.+)$", re.I),
]


_GENERIC_HEAD = re.compile(r"^(transfer[eê]ncia|pix|pagamento|compra no d[eé]bito|compra cartao|ted|doc|estorno|dep[oó]sito)", re.I)


def merchant(desc: str) -> str:
    d = " ".join((desc or "").split())
    if "|" in d:  # Open Finance: 'Transferência enviada pelo Pix|Márcia Steemburgo', 'Pagamento efetuado|CIA ESTADUAL'
        head, rest = d.split("|", 1)
        if _GENERIC_HEAD.match(head.strip()) and rest.strip():
            d = re.sub(r"^\d\d/\d\d\s+", "", rest.split("|", 1)[0].strip())  # '25/02 ZAFFARI' (Santander)
    for rx in _MERCHANT:
        m = rx.search(d)
        if m:
            d = m.group(1)
            break
    d = re.sub(r"\s-\s\d{1,2}/\d{1,2}$", "", d)          # parcela ' - 3/10'
    d = re.sub(r"^antecipada - ", "", d, flags=re.I)
    return norm_desc(d)


@dataclass
class Rule:
    id: str
    priority: int
    when: dict
    then: dict
    order: int

    def matches(self, tx: dict) -> bool:
        w = self.when
        text, merch = tx["text"], tx["merchant"]
        if "text_any" in w and not any(norm_desc(s) in text for s in w["text_any"]):
            return False
        if "text_all" in w and not all(norm_desc(s) in text for s in w["text_all"]):
            return False
        if "text_none" in w and any(norm_desc(s) in text for s in w["text_none"]):
            return False
        if "merchant_any" in w and not any(norm_desc(s) in merch for s in w["merchant_any"]):
            return False
        if "regex" in w and not re.search(w["regex"], text):
            return False
        for field in ("institution", "kind", "currency"):
            if field in w:
                allowed = w[field] if isinstance(w[field], list) else [w[field]]
                if tx[field] not in allowed:
                    return False
        if w.get("sign") == "debit" and tx["amount_cents"] >= 0:
            return False
        if w.get("sign") == "credit" and tx["amount_cents"] <= 0:
            return False
        if "provider_category_any" in w and tx["provider_category"] not in w["provider_category_any"]:
            return False
        if "flag" in w and not tx["flags"].get(w["flag"]):
            return False
        if "counterparty_account_any" in w and not any(x in tx["counterparty_account"] for x in w["counterparty_account_any"]):
            return False
        if "date_from" in w and tx["date"] < w["date_from"]:
            return False
        if "date_to" in w and tx["date"][: len(w["date_to"])] > w["date_to"]:
            return False
        a = abs(tx["amount_cents"]) / 100
        if "min" in w and a < w["min"]:
            return False
        if "max" in w and a > w["max"]:
            return False
        return True


def rules_path(store: Store) -> Path:
    return store.root / "ledger" / "rules.json"


def user_rules_path(store: Store) -> Path:
    """Regras criadas por voce na aba Revisar: vencem as minhas (prioridade 990+)."""
    return store.root / "ledger" / "rules_user.json"


# baldes que dizem "o que" mas nao "para que": aparecem na revisao como confianca baixa
GENERIC = ("transferencias:pessoas", "contas:boletos", "servicos:outros", "compras:geral", "renda:outros", "outros:")
NEUTRAL = ("transferencias:interna", "transferencias:cambio", "transferencias:investimento", "financeiro:rotativo", "ajustes:")


def confidence(category: str | None, note: str | None, manual: int | None) -> str:
    """alta | media | baixa | sem | neutra"""
    cat, note = category or "", note or ""
    if manual or note.startswith("regra:u-"):
        return "alta"
    if not cat:
        return "sem"
    if cat.startswith(NEUTRAL):
        return "neutra"
    if cat.startswith(GENERIC):
        return "baixa"
    if note.startswith("regra:of-"):
        return "media"
    return "alta"


def _read(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw.get("rules", raw) if isinstance(raw, dict) else raw


def load_rules(store: Store) -> list[Rule]:
    raw = _read(user_rules_path(store)) + _read(rules_path(store))
    rules = [Rule(r["id"], int(r.get("priority", 100)), r.get("when", {}), r["then"], i) for i, r in enumerate(raw)]
    ids = [r.id for r in rules]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise ValueError(f"ids de regra repetidos: {sorted(dup)}")
    for r in rules:
        if not r.when:
            raise ValueError(f"regra {r.id} sem condicao (pegaria tudo)")
        if not r.then.get("category"):
            raise ValueError(f"regra {r.id} sem category")
    return sorted(rules, key=lambda r: (-r.priority, r.order))


def _txs(store: Store) -> list[dict]:
    rows = store.db.execute(
        "SELECT t.id, t.anchor_key, t.account_key, t.date, t.amount_cents, t.description,"
        " a.institution, a.kind, a.currency FROM transactions t JOIN accounts a ON a.key=t.account_key").fetchall()
    extras: dict[int, dict] = {}
    for r in store.db.execute("SELECT l.tx_id, s.extra_json FROM tx_links l JOIN source_records s ON s.id=l.record_id"
                              " WHERE s.extra_json IS NOT NULL"):
        e = json.loads(r["extra_json"])
        cur = extras.setdefault(r["tx_id"], {})
        for k, v in e.items():
            cur.setdefault(k, v)
    out = []
    for r in rows:
        d = dict(r)
        e = extras.get(r["id"], {})
        d["provider_category"] = e.get("category") if isinstance(e.get("category"), str) else None
        d["flags"] = {k: v for k, v in e.items() if k in ("self_transfer",)}
        d["counterparty_account"] = e.get("counterparty_account") or ""
        d["text"] = norm_desc(r["description"])
        d["merchant"] = merchant(r["description"])
        out.append(d)
    return out


def categorize(store: Store, rules: list[Rule] | None = None, dry_run: bool = False) -> dict:
    """Aplica as regras a todo o livro. Retorna cobertura e hits por regra."""
    rules = load_rules(store) if rules is None else rules
    db = store.db
    manual = {r["anchor_key"] for r in db.execute("SELECT anchor_key FROM annotations WHERE manual=1")}
    hits = {r.id: 0 for r in rules}
    results = []
    for tx in _txs(store):
        if tx["anchor_key"] in manual:
            continue
        rule = next((r for r in rules if r.matches(tx)), None)
        if rule:
            hits[rule.id] += 1
        results.append((tx["anchor_key"], rule.then["category"] if rule else None, rule.id if rule else None))
    if not dry_run:
        db.execute("DELETE FROM annotations WHERE manual=0")
        db.executemany("INSERT INTO annotations (anchor_key, category, note, manual, updated_at) VALUES (?,?,?,0,?)",
                       [(a, c, f"regra:{rid}", now()) for a, c, rid in results if c])
        db.commit()
    total = len(results) + len(manual)
    done = sum(1 for _, c, _ in results if c) + len(manual)
    return {"transactions": total, "categorized": done, "manual": len(manual),
            "coverage": round(done / total, 4) if total else 1.0, "hits": hits,
            "unused_rules": [k for k, v in hits.items() if v == 0]}


def pair_transfers(store: Store) -> dict:
    """Casa as pernas de transferencias internas. Sem par = falta extrato da outra conta (ou regra errada)."""
    db = store.db
    rows = [dict(r) for r in db.execute(
        "SELECT t.id, t.account_key, t.date, t.amount_cents, t.description FROM transactions t"
        " JOIN annotations a ON a.anchor_key=t.anchor_key WHERE a.category LIKE ? ORDER BY t.date, t.id",
        (INTERNAL + "%",))]
    used: set[int] = set()
    pairs = []
    for i, a in enumerate(rows):
        if a["id"] in used:
            continue
        for b in rows[i + 1:]:
            if (Date.fromisoformat(b["date"]) - Date.fromisoformat(a["date"])).days > PAIR_WINDOW_DAYS:
                break
            if b["id"] in used or b["account_key"] == a["account_key"] or b["amount_cents"] != -a["amount_cents"]:
                continue
            used |= {a["id"], b["id"]}
            pairs.append((a["id"], b["id"]))
            break
    db.execute("DELETE FROM transfer_pairs")
    db.executemany("INSERT INTO transfer_pairs VALUES (?, ?)", pairs)
    db.commit()
    unpaired = [r for r in rows if r["id"] not in used]
    return {"internal": len(rows), "pairs": len(pairs), "unpaired": len(unpaired)}


def uncategorized(store: Store, limit: int = 200) -> list[dict]:
    """Sem categoria, agrupado por (instituicao, tipo, estabelecimento): insumo para escrever regras."""
    cats = {r["anchor_key"] for r in store.db.execute("SELECT anchor_key FROM annotations WHERE category IS NOT NULL")}
    groups: dict[tuple, dict] = {}
    for tx in _txs(store):
        if tx["anchor_key"] in cats:
            continue
        k = (tx["institution"], tx["kind"], tx["merchant"])
        g = groups.setdefault(k, {"institution": k[0], "kind": k[1], "merchant": k[2], "count": 0, "sum_cents": 0,
                                  "currency": tx["currency"], "examples": [], "first": tx["date"], "last": tx["date"]})
        g["count"] += 1
        g["sum_cents"] += tx["amount_cents"]
        g["first"], g["last"] = min(g["first"], tx["date"]), max(g["last"], tx["date"])
        if len(g["examples"]) < 3:
            g["examples"].append(tx["description"])
    return sorted(groups.values(), key=lambda g: (-g["count"], g["sum_cents"]))[:limit]


RECUR_MIN_COUNT, RECUR_MIN_MONTHS = 3, 3


def recurring_clusters(txs: list[tuple[str, int]]) -> tuple[list[dict], list[int]]:
    """txs = [(data, valor absoluto em centavos)]. Agrupa valores iguais ou parecidos (ate 10% ou R$ 5) que se
    repetem em >= 3 meses diferentes. Retorna (clusters, indices que sobraram = valores avulsos)."""
    from statistics import median
    order = sorted(range(len(txs)), key=lambda i: txs[i][1])
    groups: list[list[int]] = []
    for i in order:
        v = txs[i][1]
        if groups:
            med = median(txs[j][1] for j in groups[-1])
            if abs(v - med) <= max(500, 0.10 * med):
                groups[-1].append(i)
                continue
        groups.append([i])
    # valores vizinhos que se sobrepoem (R$ 53 e R$ 60 com tolerancia) sao o mesmo recorrente: junta
    merged: list[list[int]] = []
    for g in groups:
        if merged:
            prev = merged[-1]
            pmax = max(txs[i][1] for i in prev)
            pmed = median(txs[i][1] for i in prev)
            gmin = min(txs[i][1] for i in g)
            if gmin - pmax <= max(500, 0.10 * pmed) and len(prev) >= 2 and len(g) >= 2:
                prev.extend(g)
                continue
        merged.append(list(g))
    groups = merged
    clusters, rest = [], []
    for g in groups:
        months = {txs[i][0][:7] for i in g}
        if len(g) >= RECUR_MIN_COUNT and len(months) >= RECUR_MIN_MONTHS:
            vals = sorted(txs[i][1] for i in g)
            med = median(vals)
            tol = max(500, round(0.10 * med))
            span = (len({m for m in months}))
            first, last = min(txs[i][0] for i in g), max(txs[i][0] for i in g)
            n_months = max(1, (int(last[:4]) - int(first[:4])) * 12 + int(last[5:7]) - int(first[5:7]) + 1)
            freq = "mensal" if 0.6 <= span / n_months and len(g) <= n_months * 1.5 else ("varias por mes" if len(g) > n_months * 1.5 else "irregular")
            clusters.append({"members": g, "typical": round(med), "min": max(0, vals[0] - tol), "max": vals[-1] + tol,
                             "months": span, "frequency": freq})
        else:
            rest.extend(g)
    # faixas vizinhas nunca se sobrepoem: corta no meio entre os valores reais (um valor = uma regra)
    clusters.sort(key=lambda c: c["typical"])
    for a, b in zip(clusters, clusters[1:]):
        if a["max"] >= b["min"]:
            hi_a = max(txs[i][1] for i in a["members"])
            lo_b = min(txs[i][1] for i in b["members"])
            cut = (hi_a + lo_b) // 2
            a["max"], b["min"] = cut, cut + 1
    return clusters, rest


def add_user_rule(store: Store, merchant_key: str, sign: str, category: str, institution: str | None = None,
                  amount_min: int | None = None, amount_max: int | None = None) -> dict:
    """Uma escolha na revisao vira regra permanente (vale para o passado e o futuro desse estabelecimento/pessoa)."""
    path = user_rules_path(store)
    rules = _read(path)
    slug = re.sub(r"[^a-z0-9]+", "-", norm_desc(merchant_key))[:50].strip("-")
    band = amount_min is not None and amount_max is not None
    rid = f"u-{slug}-{sign}" + (f"-{institution}" if institution else "") + (f"-{amount_min}-{amount_max}" if band else "")
    when = {"merchant_any": [merchant_key], "sign": sign}
    if institution:
        when["institution"] = institution
    if band:  # so esse valor recorrente (ex.: futebol R$ 150); outros Pix para a mesma pessoa ficam de fora
        when["min"], when["max"] = amount_min / 100, amount_max / 100
    rule = {"id": rid, "priority": 995 if band else 990, "when": when, "then": {"category": category}, "created": now(),
            "origem": "revisao"}
    rules = [r for r in rules if r["id"] != rid] + [rule]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"rules": rules}, ensure_ascii=False, indent=1), encoding="utf-8")
    return rule


def review_queue(store: Store, since: str = "", limit: int = 100) -> dict:
    """Grupos (pessoa/estabelecimento x direcao) com categoria incerta, ordenados pelo impacto em R$."""
    from collections import defaultdict
    from src.finance.fx import Converter
    conv = Converter(store)
    groups: dict[tuple, dict] = defaultdict(lambda: {"count": 0, "impact": 0, "net": 0, "categories": defaultdict(int),
                                                       "confidence": set(), "examples": [], "first": None, "last": None,
                                                       "provider": defaultdict(int), "accounts": set()})
    extras: dict[int, dict] = {}
    for r in store.db.execute("SELECT l.tx_id, s.extra_json FROM tx_links l JOIN source_records s ON s.id=l.record_id"
                              " WHERE s.extra_json LIKE '%category%'"):
        e = json.loads(r["extra_json"])
        if isinstance(e.get("category"), str):
            extras.setdefault(r["tx_id"], e)
    totals = defaultdict(lambda: [0, 0])
    for r in store.db.execute(
            "SELECT t.id, t.date, t.amount_cents, t.description, a.currency cur, a.institution inst, a.kind,"
            " n.category, n.note, n.manual FROM transactions t JOIN accounts a ON a.key=t.account_key"
            " LEFT JOIN annotations n ON n.anchor_key=t.anchor_key WHERE t.date >= ?", (since or "0000",)):
        v = conv.to_brl(r["amount_cents"], r["cur"], r["date"])
        if v is None:
            continue
        conf = confidence(r["category"], r["note"], r["manual"])
        totals[conf][0] += 1
        totals[conf][1] += abs(v)
        if conf not in ("sem", "baixa", "media"):
            continue
        sign = "debit" if v < 0 else "credit"
        key = merchant(r["description"]) or norm_desc(r["description"])
        g = groups[(key, sign)]
        g.setdefault("txs", []).append((r["date"], abs(v), r["category"] or "", r["description"]))
        g["count"] += 1
        g["impact"] += abs(v)
        g["net"] += v
        g["categories"][r["category"] or ""] += 1
        g["confidence"].add(conf)
        g["accounts"].add(f"{r['inst']}/{r['kind']}")
        g["first"] = min(g["first"] or r["date"], r["date"])
        g["last"] = max(g["last"] or r["date"], r["date"])
        if len(g["examples"]) < 3 and r["description"] not in g["examples"]:
            g["examples"].append(r["description"])
        if r["id"] in extras:
            g["provider"][extras[r["id"]]["category"]] += 1
    items = []

    def make(key, sign, g, txs, extra=None):
        cats: dict[str, int] = defaultdict(int)
        for t in txs:
            cats[t[2]] += 1
        cats_s = sorted(cats.items(), key=lambda kv: -kv[1])
        ex = []
        for t in txs:
            if t[3] not in ex and len(ex) < 3:
                ex.append(t[3])
        return {"merchant": key, "sign": sign, "count": len(txs), "impact": sum(t[1] for t in txs),
                "net": sum(t[1] for t in txs) * (-1 if sign == "debit" else 1),
                "current": cats_s[0][0] if cats_s else "", "categories": dict(cats_s),
                "confidence": "sem" if "sem" in g["confidence"] else ("baixa" if "baixa" in g["confidence"] else "media"),
                "examples": ex, "first": min(t[0] for t in txs), "last": max(t[0] for t in txs), "accounts": sorted(g["accounts"]),
                "provider_category": max(g["provider"], key=g["provider"].get) if g["provider"] else None, **(extra or {})}

    for (key, sign), g in groups.items():
        txs = g["txs"]
        # pessoa (Pix/TED): separa o valor recorrente (mesmo valor todo mes) dos envios avulsos
        if any(t[2].startswith("transferencias:pessoas") or not t[2] for t in txs) and len(txs) >= RECUR_MIN_COUNT:
            clusters, rest = recurring_clusters([(t[0], t[1]) for t in txs])
            for c in clusters:
                items.append(make(key, sign, g, [txs[i] for i in c["members"]],
                                  {"band": {"min": c["min"], "max": c["max"], "typical": c["typical"]},
                                   "recurring": {"months": c["months"], "frequency": c["frequency"]}}))
            if rest:
                items.append(make(key, sign, g, [txs[i] for i in rest], {"rest_of_recurring": bool(clusters)}))
            continue
        items.append(make(key, sign, g, txs))
    items.sort(key=lambda i: -i["impact"])
    tot_all = sum(v[1] for v in totals.values()) or 1
    return {"items": items[:limit], "groups": len(items),
            "totals": {k: {"count": v[0], "impact": v[1], "share": round(v[1] / tot_all, 4)} for k, v in totals.items()}}
