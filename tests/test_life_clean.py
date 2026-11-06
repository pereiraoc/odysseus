"""Fork-local: limpeza dos títulos do Takeout e formatação do painel Life."""
from datetime import datetime, timezone

from src.life.clean import clean_event, count_phrase, domain
from src.life.common import hm, local_day, make_item, parse_ts
from src.life.fmt import compact, money, plural


def test_youtube_watch_strips_verb_and_keeps_channel():
    c = clean_event("youtube_watch", "Watched Banks Are Collapsing... Here's Why",
                    "https://www.youtube.com/watch?v=x", "Coffeezilla")
    assert (c["group"], c["action"]) == ("video", "watched")
    assert c["title"] == "Banks Are Collapsing... Here's Why" and c["subtitle"] == "Coffeezilla"
    assert not c["unavailable"] and not c["noise"]


def test_youtube_url_title_becomes_unavailable():
    c = clean_event("youtube_watch", "Watched https://www.youtube.com/watch?v=5NoPznZdtO8",
                    "https://www.youtube.com/watch?v=5NoPznZdtO8", None)
    assert c["title"] == "YouTube video (unavailable)" and c["unavailable"]


def test_search_query_and_visited_pages():
    s = clean_event("search", "Searched for 9AM PST", "https://www.google.com/search?q=9AM+PST", None)
    assert (s["group"], s["action"], s["title"]) == ("search", "searched", "9AM PST")
    v = clean_event("search", "Visited https://mysupport.razer.com/app/warranty-support",
                    "https://mysupport.razer.com/app/warranty-support", None)
    assert v["group"] == "web" and v["title"] == "mysupport.razer.com/app/warranty-support"
    p = clean_event("search", "Visited Razer Support", "https://www.razer.com/support", None)
    assert p["title"] == "Razer Support" and p["subtitle"] == "razer.com"


def test_youtube_search_counts_as_search():
    assert clean_event("youtube_watch", "Searched for lofi", None, None)["group"] == "search"


def test_noise_and_other_sources():
    assert clean_event("other:Google Analytics", "Used Google Analytics", None, None)["noise"]
    o = clean_event("other:Google Translate", "Translated hello", None, None)
    assert o["group"] == "other" and o["subtitle"] == "Google Translate" and not o["noise"]
    assert clean_event("other:Google TV", "Watched Dune", None, None)["group"] == "tv"
    assert clean_event("maps", "Directions to Padaria Central", None, None)["title"] == "Padaria Central"


def test_dedupe_key_ignores_case_for_searches_but_not_for_distinct_videos():
    a = clean_event("search", "Searched for Gato", "https://g/?q=Gato", None)["key"]
    b = clean_event("search", "Searched for gato", "https://g/?q=gato", None)["key"]
    assert a == b
    v1 = clean_event("youtube_watch", "Watched Intro", "https://y/1", None)["key"]
    v2 = clean_event("youtube_watch", "Watched Intro", "https://y/2", None)["key"]
    assert v1 != v2


def test_count_phrase_and_domain():
    assert count_phrase("search", 1) == "1 search" and count_phrase("video", 3) == "3 videos"
    assert domain("https://www.example.com/x") == "example.com" and domain(None) is None


def test_time_helpers_use_fixed_utc_minus_3():
    dt = parse_ts("2023-03-15T02:30:00Z")
    assert dt == datetime(2023, 3, 15, 2, 30, tzinfo=timezone.utc)
    assert (local_day(dt), hm(dt)) == ("2023-03-14", "23:30")
    assert parse_ts("2023-03-14T12:00:00.692000+00:00").hour == 12 and parse_ts("") is None
    it = make_item(id="x", kind="digital", source="search", ts=dt, title="t")
    assert it["ts"] == "2023-03-14T23:30:00-03:00" and it["time"] == "23:30" and it["day"] == "2023-03-14"
    assert it["open_url"] is None and it["meta"] == {}


def test_fmt():
    assert money(21200, "BRL") == "R$ 212" and money(1250, "EUR") == "€ 12.50" and money(-123456, "BRL") == "R$ 1,235"
    assert compact(5117) == "5.1k" and compact(5000) == "5k" and compact(950) == "950" and compact(1_250_000) == "1.2M"
    assert plural(1, "note") == "1 note" and plural(2, "AI session") == "2 AI sessions"
