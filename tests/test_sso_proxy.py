"""Login central por proxy confiavel (core/sso_proxy.py)."""
from core.sso_proxy import parse_user_map, trusted_proxy_user

SECRET = "s" * 40
USERS = {"admin", "alice"}
MAP = parse_user_map("pereiraoc:admin, Bob:alice")


def h(**kw):
    d = {}
    if "secret" in kw:
        d["X-Odysseus-Proxy-Secret"] = kw["secret"]
    if "user" in kw:
        d["Remote-User"] = kw["user"]
    return d


def test_maps_central_user_to_odysseus_user():
    assert trusted_proxy_user(h(secret=SECRET, user="pereiraoc"), SECRET, MAP, USERS) == "admin"
    assert trusted_proxy_user(h(secret=SECRET, user="BOB"), SECRET, MAP, USERS) == "alice"


def test_same_name_when_not_in_map():
    assert trusted_proxy_user(h(secret=SECRET, user="alice"), SECRET, {}, USERS) == "alice"


def test_wrong_or_missing_secret_is_ignored():
    assert trusted_proxy_user(h(secret="x" * 40, user="pereiraoc"), SECRET, MAP, USERS) is None
    assert trusted_proxy_user(h(user="pereiraoc"), SECRET, MAP, USERS) is None


def test_disabled_when_secret_unset_or_short():
    assert trusted_proxy_user(h(secret="", user="pereiraoc"), "", MAP, USERS) is None
    assert trusted_proxy_user(h(secret="curto", user="pereiraoc"), "curto", MAP, USERS) is None


def test_never_creates_users_or_accepts_empty_user():
    assert trusted_proxy_user(h(secret=SECRET, user="estranho"), SECRET, MAP, USERS) is None
    assert trusted_proxy_user(h(secret=SECRET, user=""), SECRET, MAP, USERS) is None
    assert trusted_proxy_user(h(secret=SECRET), SECRET, MAP, USERS) is None


def test_parse_user_map_ignores_junk():
    assert parse_user_map("a:b,,semdoispontos, :x, y: ,C:D") == {"a": "b", "c": "d"}
