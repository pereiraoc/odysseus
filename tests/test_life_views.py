"""Fork-local: visões de mês, ano, On this day e busca do painel Life (src/life/views.py)."""
from datetime import date

from src.life.registry import providers
from src.life.views import month_view, nearest_days, on_this_day, search_all, year_view
from tests.life_fixtures import dbs  # noqa: F401


def test_month_view_separates_no_data_from_zero(dbs):
    m = month_view(2023, 3, providers())
    assert (m["month"], m["label"], m["first_weekday"]) == ("2023-03", "March 2023", 3)  # 1/3/2023 = quarta
    v = m["days"][13]["values"]
    assert (v["digital"], v["spent"], v["steps"], v["work"]) == (8, 21200, 5117, 2)
    first = m["days"][0]["values"]
    assert first["spent"] is None and first["digital"] == 0
    assert m["totals"]["spent"] == 23200 and {x["key"] for x in m["metrics"]} >= {"digital", "spent", "steps"}


def test_year_view(dbs):
    y = year_view(2023, providers())
    assert y["year"] == 2023 and y["first_weekday"] == 7  # 1/1/2023 = domingo
    assert y["days"]["2023-03-14"]["digital"] == 8 and y["days"]["2023-06-01"]["digital"] is None
    assert y["months"][2]["digital"] == 8 and y["months"][5]["digital"] is None


def test_on_this_day_uses_nearby_dates(dbs):
    r = on_this_day(date(2023, 3, 14), providers())
    assert [(x["years_ago"], x["day"], x["offset"]) for x in r] == [(1, "2022-03-15", 1), (3, "2020-03-14", 0)]
    assert r[0]["summary"] == "1 digital"


def test_search_groups_by_day_and_counts_kinds_before_filter(dbs):
    r = search_all("padaria", providers())
    assert [d["day"] for d in r["days"]] == ["2023-03-14", "2023-03-10"] and r["kinds"] == {"digital": 1, "money": 1}
    f = search_all("padaria", providers(), kinds={"money"})
    assert f["total"] == 1 and f["kinds"] == {"digital": 1, "money": 1}
    assert search_all("padaria", providers(), frm="2023-03-12")["total"] == 1


def test_nearest_days(dbs):
    assert nearest_days(date(2023, 3, 12), providers()) == {"prev": "2023-03-10", "next": "2023-03-14"}


def test_failing_counts_is_no_data_not_zero(dbs, monkeypatch):
    def boom(self, a, b):
        raise RuntimeError("banco trancado")

    monkeypatch.setattr("src.life.money.MoneyProvider.counts", boom)
    m = month_view(2023, 3, providers())
    assert m["days"][13]["values"]["spent"] is None and m["totals"]["spent"] is None
    assert m["days"][13]["values"]["digital"] == 8


def test_search_truncated_when_a_provider_is_capped(dbs):
    r = search_all("Watched", providers(), limit=2)
    assert r["truncated"] is True and r["total"] == 2


def test_month_totals_none_without_data(dbs):
    assert month_view(2019, 1, providers())["totals"]["spent"] is None


def test_search_date_range_is_applied_before_the_cap(dbs):
    r = search_all("Watched", providers(), frm="2022-01-01", to="2022-12-31", limit=2)
    assert r["total"] == 1
