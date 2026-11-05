"""Fork-local: rotas do painel "Life log" (routes/lifelog_routes.py) sobre um banco sintético."""
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.auth_helpers import require_user

SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE events(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, day TEXT NOT NULL, source TEXT NOT NULL,
  title TEXT, url TEXT, detail TEXT, UNIQUE(ts, source, title));
CREATE TABLE fit_daily(day TEXT PRIMARY KEY, steps INTEGER, distance_m REAL, calories REAL, move_minutes INTEGER, heart_points REAL);
CREATE TABLE fit_sessions(start TEXT, end TEXT, activity TEXT, distance_m REAL, duration_s INTEGER, PRIMARY KEY(start, activity));
CREATE TABLE notes(id TEXT PRIMARY KEY, created TEXT, edited TEXT, title TEXT, text TEXT, labels TEXT, archived INTEGER, trashed INTEGER);
CREATE TABLE places(name TEXT, address TEXT, saved_at TEXT, list TEXT, url TEXT, PRIMARY KEY(name, list));
"""


def _db(path):
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO events(ts,day,source,title,url,detail) VALUES(?,?,?,?,?,?)", [
        ("2024-01-01T13:00:00Z", "2024-01-01", "search", "Pesquisou por gato", "https://g/?q=gato", None),
        ("2024-01-01T15:00:00Z", "2024-01-01", "youtube_watch", "Assistiu a Vídeo", "https://y/v", "Canal"),
        ("2024-02-10T12:00:00Z", "2024-02-10", "maps", "Pesquisou por padaria", None, None),
    ])
    con.execute("INSERT INTO fit_daily VALUES('2024-01-01', 1000, 800.0, 1900.0, 30, 4.0)")
    con.execute("INSERT INTO fit_sessions VALUES('2024-01-01T12:00:00Z','2024-01-01T12:30:00Z','Running',5000,1800)")
    con.execute("INSERT INTO notes VALUES('n1','2024-01-01T10:00:00Z','2024-01-01T11:00:00Z','Lista','pão','casa',0,0)")
    con.execute("INSERT INTO meta VALUES('built_at','2026-11-05T04:51:52Z')")
    con.commit(); con.close()


@pytest.fixture
def client(tmp_path, monkeypatch):
    p = tmp_path / "lifelog.sqlite"; _db(p)
    monkeypatch.setenv("LIFELOG_DB", str(p))
    from routes.lifelog_routes import setup_lifelog_routes
    app = FastAPI(); app.include_router(setup_lifelog_routes())
    app.dependency_overrides[require_user] = lambda: "tester"
    return TestClient(app)


@pytest.fixture
def client_nodb(tmp_path, monkeypatch):
    monkeypatch.setenv("LIFELOG_DB", str(tmp_path / "nao-existe.sqlite"))
    import routes.lifelog_routes as m
    monkeypatch.setattr(m, "CANDIDATES", [str(tmp_path / "nao-existe.sqlite")])
    app = FastAPI(); app.include_router(m.setup_lifelog_routes())
    app.dependency_overrides[require_user] = lambda: "tester"
    return TestClient(app)


def test_meta(client):
    j = client.get("/api/lifelog/meta").json()
    assert j["range"] == {"from": "2024-01-01", "to": "2024-02-10"}
    assert {"source": "search", "count": 1} in j["sources"] and j["built_at"].startswith("2026-11-05")


def test_day(client):
    j = client.get("/api/lifelog/day", params={"d": "2024-01-01"}).json()
    assert [e["source"] for e in j["events"]] == ["search", "youtube_watch"]
    assert j["fit"]["steps"] == 1000 and j["sessions"][0]["activity"] == "Running" and j["notes"][0]["title"] == "Lista"


def test_day_bad_date(client):
    assert client.get("/api/lifelog/day", params={"d": "ontem"}).status_code == 400


def test_search(client):
    r = client.get("/api/lifelog/search", params={"q": "gato"}).json()
    assert len(r) == 1 and r[0]["title"] == "Pesquisou por gato"
    assert len(client.get("/api/lifelog/search", params={"q": "Pesquisou", "source": "maps"}).json()) == 1


def test_series(client):
    j = client.get("/api/lifelog/series").json()
    assert {"bucket": "2024-01", "source": "search", "count": 1} in j
    assert {"bucket": "2024-02", "source": "maps", "count": 1} in j


def test_fit(client):
    assert client.get("/api/lifelog/fit", params={"from": "2024-01-01", "to": "2024-12-31"}).json()[0]["steps"] == 1000


def test_missing_db_404(client_nodb):
    assert client_nodb.get("/api/lifelog/meta").status_code == 404
