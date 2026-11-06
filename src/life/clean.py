"""Limpeza dos títulos do Google Takeout (Minha atividade) para a linha do tempo do Life.

O exportador grava o título cru ("Watched …", "Searched for …", "Visited https://…"). Aqui o verbo vira `action`,
o resto vira o título, e cada evento cai num grupo da linha "Digital" (src/life/assemble.py)."""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

VERBS = (  # prefixos mais longos primeiro
    ("Searched for ", "searched"), ("Directions to ", "directions"), ("Watched ", "watched"),
    ("Visited ", "visited"), ("Viewed ", "viewed"), ("Used ", "used"), ("Said ", "said"),
    ("Explored ", "explored"), ("Liked ", "liked"), ("Launched ", "launched"), ("Received ", "received"),
    ("Read ", "read"), ("Saw ", "saw"), ("Opened ", "opened"), ("Translated ", "translated"),
    ("Searched ", "searched"),
)
# Telemetria/anúncios: fora do dia e das contagens; a busca ainda acha.
NOISE_SOURCES = frozenset({"other:Google Analytics", "other:Ads", "other:My Ad Center", "other:Help",
                           "other:Voice Match", "other:Takeout"})
GROUP_LABELS = {  # grupo -> (singular, plural, título da sublista)
    "search": ("search", "searches", "Searches"),
    "web": ("page", "pages", "Pages"),
    "video": ("video", "videos", "YouTube"),
    "news": ("article", "articles", "News"),
    "maps": ("Maps action", "Maps actions", "Maps"),
    "apps": ("app", "apps", "Play Store"),
    "assistant": ("Assistant request", "Assistant requests", "Assistant"),
    "tv": ("TV item", "TV items", "Google TV"),
    "other": ("other item", "other items", "Other"),
}
GROUP_ORDER = tuple(GROUP_LABELS)
_URL = re.compile(r"^https?://", re.I)


def domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return None
    return (host[4:] if host.startswith("www.") else host) or None


def _group(source: str, action: str) -> str:
    if source == "youtube_watch":
        return "search" if action == "searched" else "video"
    if source == "search":
        return "search" if action == "searched" else "web"
    return {"chrome": "web", "maps": "maps", "play": "apps", "assistant": "assistant", "other:Google TV": "tv",
            "other:Google News": "news", "other:Discover": "news"}.get(source, "other")


def clean_event(source: str, title: Optional[str], url: Optional[str], detail: Optional[str]) -> dict:
    raw = (title or "").strip()
    action, text = "", raw
    for prefix, verb in VERBS:
        if raw.startswith(prefix):
            action, text = verb, raw[len(prefix):].strip()
            break
    group = _group(source, action)
    unavailable = False
    subtitle = detail.strip() if detail and detail.strip() else None
    if group == "video" and (not text or _URL.match(text)):
        text, unavailable = "YouTube video (unavailable)", True
    elif _URL.match(text):  # "Visited https://…" sem título de página: domínio + caminho
        path = urlparse(text).path
        text = (domain(text) or text) + (path if path not in ("", "/") else "")
    if not subtitle and group in ("web", "news") and url:
        subtitle = domain(url)
    if source.startswith("other:") and group == "other":
        subtitle = subtitle or source[6:]
    base = (text or raw).casefold()
    key = f"{group}|{action}|{base}" + (f"|{url}" if group in ("video", "web") and url else "")
    return {"group": group, "action": action or "used", "title": text or raw or "(untitled)", "subtitle": subtitle,
            "unavailable": unavailable, "noise": source in NOISE_SOURCES, "key": key}


def count_phrase(group: str, n: int) -> str:
    one, many, _ = GROUP_LABELS[group]
    return f"{n} {one if n == 1 else many}"
