"""Fork-local: rotas do painel Life (routes/lifelog_routes.py) sobre bancos sintéticos."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.middleware import require_admin
from tests.life_fixtures import dbs  # noqa: F401


def _client(override=True) -> TestClient:
    from routes.lifelog_routes import setup_lifelog_routes
    app = FastAPI()
    app.include_router(setup_lifelog_routes())
    if override:
        app.dependency_overrides[require_admin] = lambda: None
    return TestClient(app)


@pytest.fixture
def client(dbs):
    return _client()


def test_requires_admin(dbs, monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "true")
    assert _client(override=False).get("/api/lifelog/meta").status_code == 403


def test_meta(client):
    j = client.get("/api/lifelog/meta").json()
    assert j["range"] == {"from": "2020-03-14", "to": "2023-03-14"} and len(j["sources"]) == 3 and j["today"]


def test_day_and_nearest(client):
    j = client.get("/api/lifelog/day", params={"d": "2023-03-14"}).json()
    assert j["weekday"] == "Tuesday" and len(j["blocks"]) == 3 and j["nearest"] is None
    e = client.get("/api/lifelog/day", params={"d": "2023-03-12"}).json()
    assert e["blocks"] == [] and e["nearest"] == {"prev": "2023-03-10", "next": "2023-03-14"}


@pytest.mark.parametrize("path,params", [
    ("/api/lifelog/day", {"d": "ontem"}), ("/api/lifelog/day", {"d": "2023-02-30"}),
    ("/api/lifelog/month", {"m": "2023-13"}), ("/api/lifelog/year", {"y": "23"}),
    ("/api/lifelog/onthisday", {"d": "x"}), ("/api/lifelog/search", {"q": "padaria", "from": "2023/01/01"}),
    ("/api/lifelog/year", {"y": "0000"}), ("/api/lifelog/month", {"m": "0000-05"}),
    ("/api/lifelog/month", {"m": "9999-12"}),
    ("/api/lifelog/day", {"d": "0001-01-01"}), ("/api/lifelog/day", {"d": "9999-12-31"}),
])
def test_bad_input_is_400(client, path, params):
    assert client.get(path, params=params).status_code == 400


def test_views(client):
    assert client.get("/api/lifelog/month", params={"m": "2023-03"}).json()["days"][13]["values"]["digital"] == 8
    assert client.get("/api/lifelog/year", params={"y": "2023"}).json()["year"] == 2023
    assert client.get("/api/lifelog/onthisday", params={"d": "2023-03-14"}).json()[0]["years_ago"] == 1
    s = client.get("/api/lifelog/search", params={"q": "padaria", "kinds": "money"}).json()
    assert s["total"] == 1 and s["kinds"] == {"digital": 1, "money": 1}
    assert {x["name"] for x in client.get("/api/lifelog/sources").json()} == {"takeout", "money", "work"}


def test_search_needs_two_chars(client):
    assert client.get("/api/lifelog/search", params={"q": " a "}).status_code == 400
