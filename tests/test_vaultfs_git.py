"""Tests for vaultfs git routes — real temp git repos (fork-local)."""
import os
import subprocess
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

GIT_ENV = {
    "GIT_AUTHOR_NAME": "T", "GIT_AUTHOR_EMAIL": "t@t",
    "GIT_COMMITTER_NAME": "T", "GIT_COMMITTER_EMAIL": "t@t",
}


def _git(cwd, *args):
    env = {**os.environ, **GIT_ENV}
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr
    return r.stdout


@pytest.fixture
def repo(tmp_path):
    v = tmp_path / "GitVault"
    v.mkdir()
    _git(v, "init", "-b", "main")
    (v / "a.md").write_text("# a")
    _git(v, "add", ".")
    _git(v, "commit", "-m", "primeiro")
    return v


@pytest.fixture
def client(repo, monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    for k, val in GIT_ENV.items():
        monkeypatch.setenv(k, val)
    import routes.vaultfs_routes as vr
    monkeypatch.setattr(
        vr, "get_setting",
        lambda key: [str(repo)] if key == "tool_path_extra_roots" else None,
    )
    app = FastAPI()
    app.include_router(vr.setup_vaultfs_routes())
    return TestClient(app)


def _post(client, route, **body):
    return client.post(f"/api/vaultfs/git/{route}", json=body)


# ── status ──

def test_status_clean(client):
    r = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"})
    assert r.status_code == 200
    s = r.json()
    assert s["has_git"] is True and s["branch"] == "main"
    assert s["staged"] == [] and s["unstaged"] == [] and s["untracked"] == []


def test_status_dirty(client, repo):
    (repo / "a.md").write_text("# mudou")
    (repo / "novo.md").write_text("x")
    r = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert r["unstaged"] == [{"path": "a.md", "code": "M"}]
    assert r["untracked"] == ["novo.md"]


def test_status_no_git(client, repo):
    import shutil as sh
    sh.rmtree(repo / ".git")
    r = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert r["has_git"] is False


# ── stage / commit / discard / undo ──

def test_stage_commit_flow(client, repo):
    (repo / "a.md").write_text("# v2")
    assert _post(client, "stage", vault="gitvault", paths=["a.md"]).status_code == 200
    s = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert s["staged"] == [{"path": "a.md", "code": "M"}] and s["unstaged"] == []
    r = _post(client, "commit", vault="gitvault", message="segundo")
    assert r.status_code == 200 and r.json()["hash"]
    log = client.get("/api/vaultfs/git/log", params={"vault": "gitvault"}).json()["commits"]
    assert log[0]["subject"] == "segundo" and len(log) == 2


def test_unstage_discard(client, repo):
    (repo / "a.md").write_text("# v3")
    _post(client, "stage", vault="gitvault", paths=["a.md"])
    _post(client, "unstage", vault="gitvault", paths=["a.md"])
    s = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert s["staged"] == []
    _post(client, "discard", vault="gitvault", paths=["a.md"])
    assert (repo / "a.md").read_text() == "# a"
    (repo / "solto.md").write_text("x")
    _post(client, "discard", vault="gitvault", paths=["solto.md"])
    assert not (repo / "solto.md").exists()


def test_commit_empty_message_400(client):
    assert _post(client, "commit", vault="gitvault", message="  ").status_code == 400


def test_stage_traversal_rejected(client):
    assert _post(client, "stage", vault="gitvault", paths=["../fora"]).status_code == 400
    assert _post(client, "stage", vault="gitvault", paths=[".git/config"]).status_code == 403


def test_undo_commit(client, repo):
    (repo / "a.md").write_text("# v2")
    _post(client, "stage", vault="gitvault", paths=["a.md"])
    _post(client, "commit", vault="gitvault", message="segundo")
    assert _post(client, "undo_commit", vault="gitvault").status_code == 200
    log = client.get("/api/vaultfs/git/log", params={"vault": "gitvault"}).json()["commits"]
    assert len(log) == 1
    s = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert s["staged"] == [{"path": "a.md", "code": "M"}]


def test_undo_first_commit_400(client):
    assert _post(client, "undo_commit", vault="gitvault").status_code == 400


# ── diff ──

def test_diff_working_and_commit(client, repo):
    (repo / "a.md").write_text("# mudou")
    r = client.get("/api/vaultfs/git/diff", params={"vault": "gitvault", "path": "a.md"})
    assert r.status_code == 200 and "+# mudou" in r.text
    log = client.get("/api/vaultfs/git/log", params={"vault": "gitvault"}).json()["commits"]
    r = client.get("/api/vaultfs/git/diff", params={"vault": "gitvault", "commit": log[0]["hash"]})
    assert "+# a" in r.text


# ── branches / checkout / init ──

def test_branches_checkout_create(client, repo):
    r = _post(client, "checkout", vault="gitvault", branch="nova", create=True)
    assert r.status_code == 200
    bs = client.get("/api/vaultfs/git/branches", params={"vault": "gitvault"}).json()["branches"]
    assert {"name": "nova", "current": True} in bs
    assert {"name": "main", "current": False} in bs
    assert _post(client, "checkout", vault="gitvault", branch="main").status_code == 200


def test_checkout_bad_branch_name(client):
    assert _post(client, "checkout", vault="gitvault", branch="-x").status_code == 400
    assert _post(client, "checkout", vault="gitvault", branch="a b").status_code == 400


def test_init(client, repo):
    import shutil as sh
    sh.rmtree(repo / ".git")
    assert _post(client, "init", vault="gitvault").status_code == 200
    assert (repo / ".git").is_dir()
    assert _post(client, "init", vault="gitvault").status_code == 400


# ── push / pull / fetch (remote local file://) ──

def test_push_pull_local_remote(client, repo, tmp_path):
    bare = tmp_path / "bare.git"
    _git(tmp_path, "init", "--bare", "-b", "main", str(bare))
    _git(repo, "remote", "add", "origin", str(bare))
    r = _post(client, "push", vault="gitvault")
    assert r.status_code == 200, r.text
    (repo / "a.md").write_text("# push2")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "x")
    assert _post(client, "push", vault="gitvault").status_code == 200
    assert _post(client, "fetch", vault="gitvault").status_code == 200
    assert _post(client, "pull", vault="gitvault").status_code == 200


# ── graph ──

def test_graph_two_branches(client, repo):
    _git(repo, "checkout", "-b", "feat")
    (repo / "f.md").write_text("f")
    _git(repo, "add", ".")
    _git(repo, "commit", "-m", "na feat")
    _git(repo, "checkout", "main")
    r = client.get("/api/vaultfs/git/graph", params={"vault": "gitvault"})
    assert r.status_code == 200
    commits = r.json()["commits"]
    assert len(commits) == 2
    feat = next(c for c in commits if c["subject"] == "na feat")
    assert "feat" in " ".join(feat["refs"])
    assert len(feat["parents"]) == 1
