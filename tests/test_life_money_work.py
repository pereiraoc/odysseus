"""Fork-local: provedores de Finanças e Uso de IA do painel Life."""
from datetime import date

from src.life.money import MoneyProvider
from src.life.registry import providers
from src.life.work import WorkProvider
from tests.life_fixtures import dbs  # noqa: F401

D = date(2023, 3, 14)


def test_money_day_lists_every_line_without_time(dbs):
    items = MoneyProvider().day(D)
    assert len(items) == 5 and all(i["time"] is None and i["kind"] == "money" for i in items)
    salary = [i for i in items if i["title"] == "Salario"][0]
    assert salary["meta"]["amount_cents"] == 120000 and salary["subtitle"] == "Salario · Nubank card"
    assert [i for i in items if i["title"] == "Transferencia para Wise"][0]["meta"]["neutral"] is True


def test_money_stats_skip_internal_transfers_and_keep_currencies_apart(dbs):
    assert MoneyProvider().stats(D) == {"spent": {"BRL": 21200, "EUR": 1250}, "income": {"BRL": 120000}}


def test_money_counts_status_search(dbs):
    c = MoneyProvider().counts(date(2023, 3, 1), date(2023, 3, 31))
    assert c["2023-03-14"]["spent"] == 21200 and c["2023-03-10"]["spent"] == 2000
    st = MoneyProvider().status()
    assert st["state"] == "ok" and st["coverage"]["spent"] == ["2023-03-10", "2023-03-14"]
    assert [h["title"] for h in MoneyProvider().search("padaria", 10)] == ["Padaria"]


def test_money_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("LIFE_FINANCE_DB", str(tmp_path / "x.sqlite"))
    monkeypatch.delenv("FINANCE_DATA_DIR", raising=False)
    monkeypatch.setattr(MoneyProvider, "candidates", ())
    assert MoneyProvider().status()["state"] == "missing" and MoneyProvider().day(D) == []


def test_work_day_sessions(dbs):
    items = WorkProvider().day(D)
    assert [i["title"] for i in items] == ["Fix NAS login buttons", "Session in pleitost-app"]
    a = items[0]
    assert (a["time"], a["end_time"]) == ("09:00", "10:30")
    assert a["subtitle"] == "Claude Code · odysseus · 2 calls" and a["meta"]["tokens"] == 4000


def test_work_stats_counts_search(dbs):
    assert WorkProvider().stats(D) == {"ai_sessions": 2, "ai_tokens": 4500, "ai_cost_usd": 2.0}
    assert WorkProvider().counts(date(2023, 3, 1), date(2023, 3, 31)) == {"2023-03-14": {"work": 2}}
    hits = WorkProvider().search("pleitost", 10)
    assert len(hits) == 1 and hits[0]["day"] == "2023-03-14"
    assert WorkProvider().status()["coverage"]["work"] == ["2023-03-14", "2023-03-14"]


def test_registry_order(dbs):
    assert [p.name for p in providers()] == ["takeout", "money", "work"]
