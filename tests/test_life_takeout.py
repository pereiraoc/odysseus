"""Fork-local: provedor do Takeout do painel Life (src/life/takeout.py)."""
import os
import sqlite3
from datetime import date

from src.life.takeout import TakeoutProvider
from tests.life_fixtures import dbs  # noqa: F401  (fixture)

D = date(2023, 3, 14)


def test_status_ok(dbs):
    st = TakeoutProvider().status()
    assert st["state"] == "ok" and (st["from"], st["to"]) == ("2020-03-14", "2023-03-14")
    assert st["built_at"].startswith("2026-11-05") and st["coverage"]["steps"] == ["2023-03-13", "2023-03-14"]


def test_status_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("LIFELOG_DB", str(tmp_path / "nope.sqlite"))
    monkeypatch.setattr(TakeoutProvider, "candidates", ())
    assert TakeoutProvider().status()["state"] == "missing" and TakeoutProvider().day(D) == []


def test_day_items_are_clean_and_local(dbs):
    items = TakeoutProvider().day(D)
    dig = [i for i in items if i["kind"] == "digital"]
    assert (dig[0]["time"], dig[0]["title"], dig[0]["meta"]["group"]) == ("08:01", "9AM PST", "search")
    assert dig[0]["open_url"] == "https://www.google.com/search?q=9AM+PST"
    late = [i for i in dig if i["title"] == "gato"][0]
    assert late["time"] == "23:30" and late["open_url"] == "https://www.google.com/search?q=gato"
    assert any(i["meta"]["noise"] for i in dig)  # Analytics vem marcado; quem filtra é a montagem do dia
    walk = [i for i in items if i["kind"] == "health"][0]
    assert (walk["time"], walk["title"], walk["subtitle"]) == ("09:58", "Walking", "7 min · 0.2 km")
    notes = {i["title"]: i for i in items if i["kind"] == "note"}
    assert notes["Lista"]["subtitle"] == "Keep · created" and notes["ideia solta"]["subtitle"] == "Keep · edited"
    assert "Lixo" not in notes


def test_stats(dbs):
    assert TakeoutProvider().stats(D) == {"steps": 5117, "distance_km": 4.0, "move_minutes": 56, "calories": 2133}


def test_counts_skip_noise_and_zero_steps(dbs):
    c = TakeoutProvider().counts(date(2023, 3, 1), date(2023, 3, 31))
    assert c["2023-03-14"]["digital"] == 8 and c["2023-03-14"]["steps"] == 5117
    assert "steps" not in c.get("2023-03-13", {})


def test_search_with_context_and_notes(dbs):
    hits = TakeoutProvider().search("razer", 50)
    assert len(hits) == 1 and hits[0]["day"] == "2023-03-14" and hits[0]["title"] == "Razer Support"
    ctx = hits[0]["meta"]["context"]
    assert [(c["rel"], c["title"]) for c in ctx] == [("before", "9am pst"), ("after", "Kwite Situation Is Horrible")]
    assert TakeoutProvider().search("ideia", 50)[0]["kind"] == "note"


def test_note_counts_follow_local_days(dbs):
    con = sqlite3.connect(os.environ["LIFELOG_DB"])
    con.execute("INSERT INTO notes VALUES('n4','2023-03-10T12:00:00Z','2023-03-16T02:30:00Z','Viagem','x','',0,0)")
    con.commit()
    con.close()
    c = TakeoutProvider().counts(date(2023, 3, 1), date(2023, 3, 31))
    assert c["2023-03-10"]["notes"] == 1  # criada no dia 10
    assert c["2023-03-15"]["notes"] == 1  # editada 02:30Z do dia 16 = 23:30 do dia 15 (UTC-3)
    assert "notes" not in c.get("2023-03-16", {})


def test_search_context_skips_telemetry(dbs):
    con = sqlite3.connect(os.environ["LIFELOG_DB"])
    con.execute("INSERT INTO events(ts,day,source,title,url,detail) VALUES(?,?,?,?,?,?)",
                ("2023-03-14T11:20:00Z", "2023-03-14", "other:Google Analytics", "Used Google Analytics", None, None))
    con.commit()
    con.close()
    hits = TakeoutProvider().search("razer", 50)
    ctx = {c["rel"]: c["title"] for c in hits[0]["meta"]["context"]}
    assert ctx["after"] == "Kwite Situation Is Horrible"
