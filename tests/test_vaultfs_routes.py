"""Tests for routes/vaultfs_routes.py — vault file API (fork-local)."""
import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def vault(tmp_path):
    v = tmp_path / "Test Vault"
    (v / "Sistema" / "Heróis").mkdir(parents=True)
    (v / "Nota.md").write_text("# Nota\n\nOlá [[Outra]]", encoding="utf-8")
    (v / "Sistema" / "Heróis" / "Dante.md").write_text("# Dante", encoding="utf-8")
    (v / ".obsidian").mkdir()
    (v / ".obsidian" / "app.json").write_text("{}")
    return v


@pytest.fixture
def client(vault, tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    import routes.vaultfs_routes as vr
    monkeypatch.setattr(
        vr, "get_setting",
        lambda key: [str(vault)] if key == "tool_path_extra_roots" else None,
    )
    app = FastAPI()
    app.include_router(vr.setup_vaultfs_routes())
    return TestClient(app)


def test_list_vaults(client, vault):
    r = client.get("/api/vaultfs/vaults")
    assert r.status_code == 200
    vs = r.json()["vaults"]
    assert vs[0]["id"] == "test-vault"
    assert vs[0]["name"] == "Test Vault"
    assert vs[0]["exists"] is True
    assert vs[0]["has_git"] is False


def test_unknown_vault_404(client):
    assert client.get("/api/vaultfs/tree", params={"vault": "nope"}).status_code == 404


def test_traversal_rejected(client):
    for bad in ["../x", "a/../../x", "/etc/passwd", "..", ""]:
        r = client.get("/api/vaultfs/file", params={"vault": "test-vault", "path": bad})
        assert r.status_code in (400, 404, 422), bad


def test_symlink_escape_rejected(client, vault, tmp_path):
    outside = tmp_path / "outside.txt"
    outside.write_text("secret")
    (vault / "link.md").symlink_to(outside)
    r = client.get("/api/vaultfs/file", params={"vault": "test-vault", "path": "link.md"})
    assert r.status_code == 400


def test_tree(client):
    r = client.get("/api/vaultfs/tree", params={"vault": "test-vault"})
    assert r.status_code == 200
    tree = r.json()["tree"]
    names = [n["name"] for n in tree]
    assert "Sistema" in names and "Nota.md" in names
    assert ".obsidian" not in names
    sistema = next(n for n in tree if n["name"] == "Sistema")
    assert sistema["type"] == "dir"
    assert sistema["children"][0]["name"] == "Heróis"
    assert sistema["children"][0]["children"][0]["path"] == "Sistema/Heróis/Dante.md"


def test_read_file(client):
    r = client.get("/api/vaultfs/file", params={"vault": "test-vault", "path": "Nota.md"})
    assert r.status_code == 200
    body = r.json()
    assert body["content"].startswith("# Nota")
    assert isinstance(body["mtime"], float)


def test_read_missing_404(client):
    r = client.get("/api/vaultfs/file", params={"vault": "test-vault", "path": "nao-existe.md"})
    assert r.status_code == 404


def test_raw_serves_bytes(client, vault):
    (vault / "img.png").write_bytes(b"\x89PNG\r\n")
    r = client.get("/api/vaultfs/raw", params={"vault": "test-vault", "path": "img.png"})
    assert r.status_code == 200
    assert r.content.startswith(b"\x89PNG")


def test_write_roundtrip_and_conflict(client, vault):
    r = client.get("/api/vaultfs/file", params={"vault": "test-vault", "path": "Nota.md"})
    m = r.json()["mtime"]
    r = client.put("/api/vaultfs/file", json={
        "vault": "test-vault", "path": "Nota.md", "content": "novo", "base_mtime": m})
    assert r.status_code == 200
    assert (vault / "Nota.md").read_text() == "novo"
    # base_mtime velho → 409
    r = client.put("/api/vaultfs/file", json={
        "vault": "test-vault", "path": "Nota.md", "content": "x", "base_mtime": m})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "mtime_conflict"
    # force sobrescreve
    r = client.put("/api/vaultfs/file", json={
        "vault": "test-vault", "path": "Nota.md", "content": "x", "base_mtime": m, "force": True})
    assert r.status_code == 200


def test_write_into_dot_git_forbidden(client, vault):
    (vault / ".git").mkdir()
    r = client.put("/api/vaultfs/file", json={
        "vault": "test-vault", "path": ".git/config", "content": "hack"})
    assert r.status_code == 403


def test_create_rename_delete(client, vault):
    r = client.post("/api/vaultfs/file", json={
        "vault": "test-vault", "path": "Novo/Sub/nota.md", "kind": "file", "content": "# oi"})
    assert r.status_code == 200
    assert (vault / "Novo" / "Sub" / "nota.md").exists()
    assert client.post("/api/vaultfs/file", json={
        "vault": "test-vault", "path": "Novo/Sub/nota.md", "kind": "file"}).status_code == 409
    r = client.post("/api/vaultfs/rename", json={
        "vault": "test-vault", "path": "Novo/Sub/nota.md", "new_path": "Novo/ren.md"})
    assert r.status_code == 200
    assert (vault / "Novo" / "ren.md").exists()
    # delete dir sem recursive → 400; com recursive → some
    assert client.delete("/api/vaultfs/file",
        params={"vault": "test-vault", "path": "Novo"}).status_code == 400
    assert client.delete("/api/vaultfs/file",
        params={"vault": "test-vault", "path": "Novo", "recursive": "true"}).status_code == 200
    assert not (vault / "Novo").exists()


def test_meta_frontmatter_and_tags(client, vault):
    (vault / "Meta.md").write_text(
        "---\nstatus: ativo\ntags:\n  - rpg\n  - heroi\n---\n\n# Meta\ncorpo #inline\n",
        encoding="utf-8")
    r = client.get("/api/vaultfs/meta", params={"vault": "test-vault"})
    assert r.status_code == 200
    note = next(n for n in r.json()["notes"] if n["path"] == "Meta.md")
    assert note["props"]["status"] == "ativo"
    assert "rpg" in note["tags"] and "inline" in note["tags"]
    assert note["name"] == "Meta"


def test_base_parse(client, vault):
    (vault / "Todos.base").write_text(
        "views:\n  - type: table\n    name: Todos\n    order:\n      - file.name\n      - status\n",
        encoding="utf-8")
    r = client.get("/api/vaultfs/base", params={"vault": "test-vault", "path": "Todos.base"})
    assert r.status_code == 200
    assert r.json()["base"]["views"][0]["type"] == "table"
