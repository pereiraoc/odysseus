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


def test_meta_ignores_tags_inside_code_blocks(client, vault):
    (vault / "Query.md").write_text(
        "# Q\n\n```dataview\nLIST FROM #naoconta\n```\ntexto `#inline-code` e #valido\n",
        encoding="utf-8")
    r = client.get("/api/vaultfs/meta", params={"vault": "test-vault"})
    note = next(n for n in r.json()["notes"] if n["path"] == "Query.md")
    assert "naoconta" not in note["tags"]
    assert "inline-code" not in note["tags"]
    assert "valido" in note["tags"]


def test_meta_outlinks_inline_fields_aliases(client, vault):
    (vault / "Rica.md").write_text(
        "---\naliases: [Apelido]\n---\n# Rica\n\nVeja [[Nota]] e [[Sistema/Heróis/Dante|o cara]].\n"
        "Chave Inline:: valor x\n- rank:: A\n\n```\n[[NaoConta]]\n```\n",
        encoding="utf-8")
    r = client.get("/api/vaultfs/meta", params={"vault": "test-vault"})
    note = next(n for n in r.json()["notes"] if n["path"] == "Rica.md")
    assert note["outlinks"] == ["Nota", "Sistema/Heróis/Dante"]
    assert note["props"]["Chave Inline"] == "valor x"
    assert note["props"]["rank"] == "A"
    assert note["aliases"] == ["Apelido"]
    assert isinstance(note["ctime"], float)


def test_meta_inline_field_vazio_nao_engole_linha(client, vault):
    (vault / "Dash.md").write_text(
        "## Info\naliases::\nproject:: [[Alvo]]\nparent::\narchive:: true\n",
        encoding="utf-8")
    r = client.get("/api/vaultfs/meta", params={"vault": "test-vault"})
    note = next(n for n in r.json()["notes"] if n["path"] == "Dash.md")
    assert note["props"]["aliases"] is None       # vazio ≠ linha seguinte
    assert note["props"]["project"] == "[[Alvo]]"
    assert note["props"]["parent"] is None
    assert note["props"]["archive"] == "true"


def test_tasks_parse_e_toggle(client, vault):
    (vault / "Tarefas.md").write_text(
        "# T\n\n- [ ] Comprar pão 📅 2026-08-01 ⏫\n- [x] Feita ✅ 2026-07-20\n"
        "- [-] Cancelada ❌ 2026-07-01\n- [/] Em progresso 🔁 every week ⏳ 2026-07-30\n"
        "```\n- [ ] dentro de code fence não conta\n```\n",
        encoding="utf-8")
    r = client.get("/api/vaultfs/tasks", params={"vault": "test-vault"})
    assert r.status_code == 200
    ts = [t for t in r.json()["tasks"] if t["path"] == "Tarefas.md"]
    assert len(ts) == 4
    todo = next(t for t in ts if t["status"] == " ")
    assert todo["text"] == "Comprar pão" and todo["due"] == "2026-08-01" and todo["priority"] == "high"
    prog = next(t for t in ts if t["status"] == "/")
    assert prog["recurrence"] == "every week" and prog["scheduled"] == "2026-07-30"
    # toggle → done com ✅ de hoje
    r = client.post("/api/vaultfs/tasks/toggle", json={
        "vault": "test-vault", "path": "Tarefas.md", "line": todo["line"], "done": True})
    assert r.status_code == 200
    content = (vault / "Tarefas.md").read_text()
    assert "- [x] Comprar pão" in content and content.count("✅") == 2
    # untoggle remove o ✅
    r = client.post("/api/vaultfs/tasks/toggle", json={
        "vault": "test-vault", "path": "Tarefas.md", "line": todo["line"], "done": False})
    assert "- [ ] Comprar pão 📅 2026-08-01 ⏫" in (vault / "Tarefas.md").read_text()
    # linha errada → 409
    r = client.post("/api/vaultfs/tasks/toggle", json={
        "vault": "test-vault", "path": "Tarefas.md", "line": 0, "done": True})
    assert r.status_code == 409


def test_roots_union_e_is_vault(client, vault, tmp_path, monkeypatch):
    import routes.vaultfs_routes as vr
    extra = tmp_path / "Projetos"
    extra.mkdir()
    monkeypatch.setattr(vr, "get_setting", lambda key: {
        "tool_path_extra_roots": [str(vault)],
        "file_browser_roots": [str(extra), str(vault)],  # dup da vault → dedup
    }.get(key))
    r = client.get("/api/vaultfs/vaults")
    vs = r.json()["vaults"]
    assert [v["name"] for v in vs] == ["Test Vault", "Projetos"]
    assert vs[0]["is_vault"] is True and vs[1]["is_vault"] is False


def test_put_roots(client, monkeypatch):
    import routes.vaultfs_routes as vr
    saved = {}
    monkeypatch.setattr(vr, "load_settings", lambda: {"outra": 1})
    monkeypatch.setattr(vr, "save_settings", lambda s: saved.update(s))
    r = client.put("/api/vaultfs/roots", json={"roots": ["/data/projects", "  "]})
    assert r.status_code == 200
    assert saved["file_browser_roots"] == ["/data/projects"] and saved["outra"] == 1
    assert client.put("/api/vaultfs/roots", json={"roots": ["relativo/x"]}).status_code == 400


def test_tree_lazy_depth_e_path(client):
    r = client.get("/api/vaultfs/tree", params={"vault": "test-vault", "depth": 1})
    tree = r.json()["tree"]
    sistema = next(n for n in tree if n["name"] == "Sistema")
    assert sistema["children"] is None and sistema["has_children"] is True
    r = client.get("/api/vaultfs/tree",
                   params={"vault": "test-vault", "path": "Sistema", "depth": 1})
    sub = r.json()["tree"]
    assert sub[0]["name"] == "Heróis" and sub[0]["children"] is None
    r = client.get("/api/vaultfs/tree",
                   params={"vault": "test-vault", "path": "Sistema/Heróis", "depth": 1})
    assert r.json()["tree"][0]["path"] == "Sistema/Heróis/Dante.md"


def test_obsidian_sync_status_shape(client):
    r = client.get("/api/vaultfs/obsidian-sync")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"available", "sessions"}
    assert body["sessions"][0]["id"] == "test-vault"
    assert set(body["sessions"][0]) == {"id", "name", "mounted", "exists", "running", "port", "ui_url", "sync_allowed", "sync_plugin", "foreign_refs"}


def test_host_path_e_session_spec(monkeypatch):
    import pytest as _pt
    import routes.vaultfs_routes as vr
    from fastapi import HTTPException
    monkeypatch.setenv("VAULTFS_HOST_MAP",
                       "/app/vaults=/data/vaults,/app/vaults/x=/data/projects/x")
    assert vr._host_path("/app/vaults/OP Vault") == "/data/vaults/OP Vault"
    assert vr._host_path("/app/vaults/x/sub") == "/data/projects/x/sub"  # prefixo mais longo
    with _pt.raises(HTTPException) as ei:
        vr._host_path("/outro/lugar")
    assert ei.value.status_code == 501
    spec = vr._session_spec("odysseus-obsidian-v", "Minha V", "/data/vaults/Minha V",
                            "/data/projects/odysseus/data/obsidian-sessions/v", 3011)
    assert spec["HostConfig"]["Binds"] == [
        "/data/projects/odysseus/data/obsidian-sessions/v:/config",
        "/data/vaults/Minha V:/vaults/Minha V"]
    assert spec["HostConfig"]["PortBindings"]["3000/tcp"][0]["HostPort"] == "3011"
    assert spec["HostConfig"]["ShmSize"] == 1 << 30


def test_obsidian_open_cria_sessao(client, vault, tmp_path, monkeypatch):
    import json as j
    import routes.vaultfs_routes as vr
    sessions_dir = tmp_path / "sessions"
    monkeypatch.setenv("OBSIDIAN_SESSIONS_DIR", str(sessions_dir))
    monkeypatch.setenv("VAULTFS_HOST_MAP", f"{tmp_path}=/host{tmp_path}")
    calls = []
    state = {"created": False}

    def fake_api(method, endpoint, body=None):
        calls.append((method, endpoint, body))
        if endpoint.startswith("/containers/odysseus-obsidian-") and endpoint.endswith("/json"):
            if not state["created"]:
                return 404, ""
            return 200, ('{"State": {"Running": false}, "HostConfig": '
                         '{"PortBindings": {"3000/tcp": [{"HostPort": "3010"}]}}}')
        if endpoint == "/containers/json?all=1":
            return 200, "[]"
        if "/containers/create" in endpoint:
            state["created"] = True
            return 201, "{}"
        if endpoint.endswith("/start"):
            return 204, ""
        return 500, "?"

    monkeypatch.setattr(vr, "_docker_api", fake_api)
    r = client.post("/api/vaultfs/obsidian-open", json={"vault": "test-vault"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ui_url"] == "http://localhost:3010" and body["started"] is True
    create = next(c for c in calls if "/containers/create" in c[1])
    assert create[1] == "/containers/create?name=odysseus-obsidian-test-vault"
    binds = create[2]["HostConfig"]["Binds"]
    assert binds[1].endswith(":/vaults/Test Vault") and binds[1].startswith("/host")
    cfg = j.load(open(sessions_dir / "test-vault" / ".config" / "obsidian" / "obsidian.json"))
    entry = list(cfg["vaults"].values())[0]
    assert entry["path"] == "/vaults/Test Vault" and entry["open"] is True


def test_obsidian_open_vault_desconhecida(client, monkeypatch):
    import routes.vaultfs_routes as vr
    monkeypatch.setattr(vr, "_docker_api", lambda *a, **k: (200, "[]"))
    assert client.post("/api/vaultfs/obsidian-open",
                       json={"vault": "nope"}).status_code == 404


def test_meta_assets_e_ignore_dirs(client, vault):
    (vault / "anexo.png").write_bytes(b"x")
    nm = vault / "node_modules" / "pacote"
    nm.mkdir(parents=True)
    (nm / "lib.md").write_text("# não conta")
    (nm / "lib.js").write_text("x")
    r = client.get("/api/vaultfs/meta", params={"vault": "test-vault"})
    body = r.json()
    assert {"name": "anexo.png", "path": "anexo.png"} in body["assets"]
    assert not any("node_modules" in n["path"] for n in body["notes"])
    assert not any("node_modules" in a["path"] for a in body["assets"])


def test_sync_policy_default_e_strip(client, vault, monkeypatch):
    import json as j
    import routes.vaultfs_routes as vr
    # default: allowlist = ["op-vault"] → test-vault NÃO pode sync
    (vault / ".obsidian" / "core-plugins.json").write_text('{"sync": true, "graph": true}')
    assert vr._enforce_sync_policy("test-vault", str(vault)) is True
    assert j.load(open(vault / ".obsidian" / "core-plugins.json"))["sync"] is False
    # formato lista (versões antigas)
    (vault / ".obsidian" / "core-plugins.json").write_text('["sync", "graph"]')
    assert vr._enforce_sync_policy("test-vault", str(vault)) is True
    assert j.load(open(vault / ".obsidian" / "core-plugins.json")) == ["graph"]
    # na allowlist → intocada
    monkeypatch.setattr(vr, "get_setting", lambda k: {
        "obsidian_sync_allowed": ["test-vault"],
        "tool_path_extra_roots": [str(vault)],
    }.get(k))
    (vault / ".obsidian" / "core-plugins.json").write_text('{"sync": true}')
    assert vr._enforce_sync_policy("test-vault", str(vault)) is False
    assert j.load(open(vault / ".obsidian" / "core-plugins.json"))["sync"] is True


def test_sync_status_policy_fields(client, vault):
    (vault / ".obsidian" / "core-plugins.json").write_text('{"sync": true}')
    r = client.get("/api/vaultfs/obsidian-sync").json()
    s0 = r["sessions"][0]
    assert s0["sync_allowed"] is False and s0["sync_plugin"] is True
    assert s0["foreign_refs"] == []


def test_foreign_refs_scan(client, vault, tmp_path, monkeypatch):
    import routes.vaultfs_routes as vr
    outra = tmp_path / "Outra"
    outra.mkdir()
    monkeypatch.setattr(vr, "get_setting", lambda k: {
        "tool_path_extra_roots": [str(vault), str(outra)],
    }.get(k))
    sess = tmp_path / "sessions" / "test-vault" / ".config" / "obsidian" / "IndexedDB"
    sess.mkdir(parents=True)
    (sess / "000001.ldb").write_bytes(b"xx Outra xx")
    monkeypatch.setenv("OBSIDIAN_SESSIONS_DIR", str(tmp_path / "sessions"))
    assert vr._foreign_refs("test-vault") == ["Outra"]


def test_sync_allow_endpoint(client, monkeypatch):
    import routes.vaultfs_routes as vr
    saved = {}
    monkeypatch.setattr(vr, "load_settings", lambda: {})
    monkeypatch.setattr(vr, "save_settings", lambda s: saved.update(s))
    monkeypatch.setattr(vr, "_docker_api", lambda *a, **k: (204, ""))
    r = client.post("/api/vaultfs/obsidian-sync-allow",
                    json={"vault": "test-vault", "allow": True})
    assert r.status_code == 200 and "test-vault" in saved["obsidian_sync_allowed"]
    r = client.post("/api/vaultfs/obsidian-sync-allow",
                    json={"vault": "test-vault", "allow": False})
    assert saved["obsidian_sync_allowed"] == ["op-vault"]
