"""Fork-local: bancos sintéticos (Takeout, Finanças, Uso de IA) para os testes do painel Life.

Dia de referência: terça 2023-03-14. Horários em UTC no banco; o Life mostra em UTC-3 (11:01Z = 08:01)."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

LIFELOG_SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE events(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, day TEXT NOT NULL, source TEXT NOT NULL,
  title TEXT, url TEXT, detail TEXT, UNIQUE(ts, source, title));
CREATE TABLE fit_daily(day TEXT PRIMARY KEY, steps INTEGER, distance_m REAL, calories REAL, move_minutes INTEGER,
  heart_points REAL);
CREATE TABLE fit_sessions(start TEXT, end TEXT, activity TEXT, distance_m REAL, duration_s INTEGER,
  PRIMARY KEY(start, activity));
CREATE TABLE notes(id TEXT PRIMARY KEY, created TEXT, edited TEXT, title TEXT, text TEXT, labels TEXT, archived INTEGER,
  trashed INTEGER);
CREATE TABLE places(name TEXT, address TEXT, saved_at TEXT, list TEXT, url TEXT, PRIMARY KEY(name, list));
"""
EVENTS = [
    ("2023-03-14T11:01:00Z", "2023-03-14", "search", "Searched for 9AM PST", "https://www.google.com/search?q=9AM+PST", None),
    ("2023-03-14T11:03:00Z", "2023-03-14", "search", "Searched for 9am pst", "https://www.google.com/search?q=9am+pst", None),
    ("2023-03-14T11:16:00Z", "2023-03-14", "search", "Visited Razer Support", "https://www.razer.com/support", None),
    ("2023-03-14T12:38:00Z", "2023-03-14", "youtube_watch", "Watched Kwite Situation Is Horrible",
     "https://www.youtube.com/watch?v=a", "penguinz0"),
    ("2023-03-14T12:45:00Z", "2023-03-14", "youtube_watch", "Watched https://www.youtube.com/watch?v=b",
     "https://www.youtube.com/watch?v=b", None),
    ("2023-03-14T12:50:00Z", "2023-03-14", "youtube_watch", "Watched Kwite Situation Is Horrible",
     "https://www.youtube.com/watch?v=a", "penguinz0"),
    ("2023-03-14T15:00:00Z", "2023-03-14", "other:Google Analytics", "Used Google Analytics", None, None),
    ("2023-03-14T22:10:00Z", "2023-03-14", "maps", "Directions to Padaria Central", None, None),
    ("2023-03-15T02:30:00Z", "2023-03-14", "search", "Searched for gato", None, None),  # 23:30 local, ainda dia 14
    ("2020-03-14T13:00:00Z", "2020-03-14", "search", "Searched for pandemia", None, None),
    ("2022-03-15T13:00:00Z", "2022-03-15", "youtube_watch", "Watched Something", "https://www.youtube.com/watch?v=c", "Chan"),
]


def make_lifelog(path: Path) -> Path:
    con = sqlite3.connect(path)
    con.executescript(LIFELOG_SCHEMA)
    con.executemany("INSERT INTO events(ts,day,source,title,url,detail) VALUES(?,?,?,?,?,?)", EVENTS)
    con.execute("INSERT INTO fit_daily VALUES('2023-03-14', 5117, 4012.0, 2133.0, 56, 12.0)")
    con.execute("INSERT INTO fit_daily VALUES('2023-03-13', 0, 0, 1800.0, 0, 0)")
    con.execute("INSERT INTO fit_sessions VALUES('2023-03-14T12:58:00Z','2023-03-14T13:05:00Z','walking',200,420)")
    con.execute("INSERT INTO notes VALUES('n1','2023-03-14T13:00:00Z','2023-03-14T13:10:00Z','Lista','pão','casa',0,0)")
    con.execute("INSERT INTO notes VALUES('n2','2023-01-01T10:00:00Z','2023-03-14T20:00:00Z','','ideia solta','',0,0)")
    con.execute("INSERT INTO notes VALUES('n3','2023-03-14T10:00:00Z',NULL,'Lixo','x','',0,1)")
    con.execute("INSERT INTO meta VALUES('built_at','2026-11-05T04:51:52Z')")
    con.commit()
    con.close()
    return path


FINANCE_SCHEMA = """
CREATE TABLE accounts (key TEXT PRIMARY KEY, institution TEXT NOT NULL, kind TEXT NOT NULL, number TEXT NOT NULL,
  currency TEXT NOT NULL, name TEXT);
CREATE TABLE transactions (id INTEGER PRIMARY KEY, anchor_key TEXT NOT NULL UNIQUE, account_key TEXT NOT NULL,
  date TEXT NOT NULL, amount_cents INTEGER NOT NULL, description TEXT NOT NULL, n_sources INTEGER NOT NULL);
CREATE TABLE annotations (anchor_key TEXT PRIMARY KEY, category TEXT, note TEXT, manual INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL);
CREATE TABLE splits (anchor_key TEXT NOT NULL, seq INTEGER NOT NULL, category TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  note TEXT, PRIMARY KEY (anchor_key, seq));
CREATE VIEW tx_lines AS
  SELECT t.id, t.anchor_key, t.account_key, t.date, t.amount_cents, t.description, a.category, a.note, a.manual
  FROM transactions t LEFT JOIN annotations a ON a.anchor_key=t.anchor_key
  WHERE coalesce(a.manual, 0)=1 OR NOT EXISTS (SELECT 1 FROM splits s WHERE s.anchor_key=t.anchor_key)
  UNION ALL
  SELECT t.id, t.anchor_key, t.account_key, t.date, s.amount_cents, t.description, s.category, s.note, 0
  FROM transactions t JOIN splits s ON s.anchor_key=t.anchor_key LEFT JOIN annotations a ON a.anchor_key=t.anchor_key
  WHERE coalesce(a.manual, 0)=0;
"""


def make_finance(path: Path) -> Path:
    con = sqlite3.connect(path)
    con.executescript(FINANCE_SCHEMA)
    con.executemany("INSERT INTO accounts VALUES(?,?,?,?,?,?)", [
        ("nubank:cc", "nubank", "card", "1", "BRL", "Nubank card"), ("wise:eur", "wise", "checking", "2", "EUR", "Wise EUR")])
    con.executemany("INSERT INTO transactions VALUES(?,?,?,?,?,?,1)", [
        (1, "a1", "nubank:cc", "2023-03-14", -4800, "Pasteis de Belem"),
        (2, "a2", "nubank:cc", "2023-03-14", -16400, "Supermercado"),
        (3, "a3", "nubank:cc", "2023-03-14", -50000, "Transferencia para Wise"),
        (4, "a4", "wise:eur", "2023-03-14", -1250, "Cafe Lisboa"),
        (5, "a5", "nubank:cc", "2023-03-14", 120000, "Salario"),
        (6, "a6", "nubank:cc", "2023-03-10", -2000, "Padaria")])
    con.executemany("INSERT INTO annotations VALUES(?,?,NULL,0,'2026-01-01')", [
        ("a1", "alimentacao:restaurante"), ("a2", "alimentacao:mercado"), ("a3", "transferencias:interna"),
        ("a4", "alimentacao:restaurante"), ("a5", "renda:salario"), ("a6", "alimentacao:padaria")])
    con.commit()
    con.close()
    return path


AI_SCHEMA = """
CREATE TABLE events(eid text primary key, machine text, source text, session_key text, ts text, day text, hour int,
  model text, total int, cost_usd real, superseded int default 0);
CREATE TABLE sessions(key text primary key, machine text, source text, cwd text, title text, ai_title text,
  first_ts text, last_ts text);
"""


def make_ai(path: Path) -> Path:
    con = sqlite3.connect(path)
    con.executescript(AI_SCHEMA)
    con.executemany("INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)", [
        ("s1", "pc", "claude", "/data/projects/odysseus", "fix login", "Fix NAS login buttons",
         "2023-03-14T12:00:00Z", "2023-03-14T13:30:00Z"),
        ("s2", "pc", "codex", "/data/projects/pleitost-app", "", "", "2023-03-14T23:00:00Z", "2023-03-15T01:00:00Z")])
    con.executemany("INSERT INTO events(eid,machine,source,session_key,ts,day,hour,model,total,cost_usd) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)", [
                        ("e1", "pc", "claude", "s1", "2023-03-14T12:00:00+00:00", "2023-03-14", 9, "opus", 1000, 0.5),
                        ("e2", "pc", "claude", "s1", "2023-03-14T13:30:00+00:00", "2023-03-14", 10, "opus", 3000, 1.5),
                        ("e3", "pc", "codex", "s2", "2023-03-14T23:00:00+00:00", "2023-03-14", 20, "gpt", 500, None)])
    con.commit()
    con.close()
    return path


@pytest.fixture
def dbs(tmp_path, monkeypatch):
    monkeypatch.setenv("LIFELOG_DB", str(make_lifelog(tmp_path / "lifelog.sqlite")))
    monkeypatch.setenv("LIFE_FINANCE_DB", str(make_finance(tmp_path / "finance.sqlite")))
    monkeypatch.setenv("AI_USAGE_DB", str(make_ai(tmp_path / "ai.sqlite")))
    return tmp_path
