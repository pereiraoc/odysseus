"""Fork-local: montagem da página do dia do painel Life (src/life/assemble.py)."""
from datetime import date

from src.life.assemble import assemble_day, digital_group, entries_for
from src.life.registry import providers
from tests.life_fixtures import dbs  # noqa: F401

D = date(2023, 3, 14)


def _dig(id, time, title, group="search", unavailable=False):
    return {"id": id, "kind": "digital", "time": time, "ts": f"2023-03-14T{time}:00-03:00", "title": title,
            "subtitle": None, "url": None, "open_url": None,
            "meta": {"group": group, "action": "watched", "key": f"{group}|{title.lower()}", "unavailable": unavailable}}


def test_digital_group_dedupes_and_counts_views():
    g = digital_group([_dig("1", "09:00", "A", "video"), _dig("2", "09:05", "A", "video"),
                       _dig("3", "09:10", "B", "video", unavailable=True), _dig("4", "09:12", "q")])
    assert g["summary"] == "1 search, 2 videos (3 views)"
    assert (g["time"], g["end_time"], g["unavailable"], g["total"]) == ("09:00", "09:12", 1, 3)
    video = [s for s in g["sources"] if s["group"] == "video"][0]
    assert video["items"][0]["times"] == ["09:00", "09:05"] and video["items"][-1]["unavailable"]


def test_runs_break_on_long_gap_and_on_other_items():
    work = {"id": "w", "kind": "work", "time": "10:10", "ts": "2023-03-14T10:10:00-03:00", "meta": {}}
    e = entries_for([_dig("1", "08:00", "a"), _dig("2", "08:30", "b"), _dig("3", "10:00", "c"), work,
                     _dig("4", "10:20", "d")])
    assert [x["kind"] for x in e] == ["digital_group", "digital_group", "work", "digital_group"]
    assert e[0]["total"] == 2


def test_assemble_day(dbs):
    day = assemble_day(D, providers())
    assert day["weekday"] == "Tuesday"
    assert [b["key"] for b in day["blocks"]] == ["morning", "afternoon", "evening"]
    morning = day["blocks"][0]["entries"]
    assert [e["kind"] for e in morning] == ["digital_group", "work", "digital_group", "health", "note"]
    assert morning[0]["summary"] == "1 search, 1 page" and morning[2]["summary"] == "2 videos (3 views)"
    assert (day["blocks"][0]["start"], day["blocks"][2]["end"]) == ("06:00", "24:00")
    assert len(day["all_day"]) == 5 and all(i["kind"] == "money" for i in day["all_day"])
    assert day["counts_by_kind"] == {"digital": 8, "work": 2, "health": 1, "note": 2, "money": 5}
    assert day["summary"]["text"] == "R$ 212 + € 12.50 spent · 5.1k steps · 2 AI sessions · 2 notes · 8 digital"
    rows = {r["key"]: r["value"] for r in day["stats"]}
    assert rows["steps"] == "5,117" and rows["ai"] == "2" and rows["distance"] == "4.0 km"
    assert {s["name"]: s["state"] for s in day["sources"]} == {"takeout": "ok", "money": "ok", "work": "ok"}


def test_broken_source_does_not_break_the_day(dbs, monkeypatch):
    from src.life.work import WorkProvider
    monkeypatch.setattr(WorkProvider, "day", lambda self, d: 1 / 0)
    day = assemble_day(D, providers())
    assert {s["name"]: s["state"] for s in day["sources"]}["work"] == "error" and day["blocks"]


def test_empty_day(dbs):
    day = assemble_day(date(2019, 1, 1), providers())
    assert day["blocks"] == [] and day["all_day"] == [] and day["summary"] == {"text": "", "parts": []}
