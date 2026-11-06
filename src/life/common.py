"""Utilidades comuns do Life: fuso fixo, abertura só leitura, itens e interface dos provedores."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Iterator, Optional

LOCAL = timezone(timedelta(hours=-3))  # UTC-3 fixo, igual ao nas-lifelog-export (DST até 2019 e viagens: limitação conhecida)


def find_db(env: str, candidates: Iterable[str]) -> Optional[Path]:
    v = os.environ.get(env, "") if env else ""
    for c in ([v] if v else []) + list(candidates):
        if c and Path(c).is_file():
            return Path(c)
    return None


@contextmanager
def ro(path: Path) -> Iterator[sqlite3.Connection]:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        yield con
    finally:
        con.close()


def parse_ts(value) -> Optional[datetime]:
    """ISO 8601 ('Z', '+00:00' ou sem fuso = UTC) -> datetime aware em UTC."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def local_day(dt: datetime) -> str:
    return dt.astimezone(LOCAL).date().isoformat()


def hm(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(LOCAL).strftime("%H:%M") if dt else None


def today() -> date:
    return datetime.now(LOCAL).date()


def make_item(*, id: str, kind: str, source: str, title: str, ts: Optional[datetime] = None,
              end_ts: Optional[datetime] = None, subtitle: Optional[str] = None, url: Optional[str] = None,
              open_url: Optional[str] = None, day: Optional[str] = None, **meta) -> dict:
    return {
        "id": id, "kind": kind, "source": source,
        "ts": ts.astimezone(LOCAL).isoformat() if ts else None,
        "end_ts": end_ts.astimezone(LOCAL).isoformat() if end_ts else None,
        "time": hm(ts), "end_time": hm(end_ts),
        "day": day or (local_day(ts) if ts else None),
        "title": title, "subtitle": subtitle, "url": url,
        "open_url": open_url if open_url is not None else url,
        "place_ref": None, "meta": meta,
    }


def status(name: str, label: str, state: str, **extra) -> dict:
    return {"name": name, "label": label, "state": state, **extra}


class Provider:
    """Interface das fontes do Life. O arquivo é resolvido a cada chamada (env > candidatos)."""
    name = ""
    label = ""
    env = ""
    candidates: tuple = ()

    def path(self) -> Optional[Path]:
        return find_db(self.env, self.candidates)

    def status(self) -> dict:
        raise NotImplementedError

    def day(self, d: date) -> list[dict]:
        return []

    def stats(self, d: date) -> dict:
        return {}

    def counts(self, a: date, b: date) -> dict:
        return {}

    def search(self, q: str, limit: int) -> list[dict]:
        return []


def safe_status(p: Provider) -> dict:
    try:
        return p.status()
    except Exception as e:  # banco corrompido/trancado: a fonte aparece com erro, o resto segue
        return status(p.name, p.label, "error", detail=str(e)[:200])
