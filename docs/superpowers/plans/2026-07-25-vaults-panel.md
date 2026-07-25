# Painel de Vaults — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel dockado à direita para navegar/editar as vaults Obsidian (markdown com wikilinks) com integração git estilo VS Code (status, stage/commit, branches, push/pull, lista + grafo de commits).

**Architecture:** Backend novo `routes/vaultfs_routes.py` (FastAPI, factory `setup_vaultfs_routes()`), vaults vindas de `get_setting("tool_path_extra_roots")`, git via subprocess confinado à raiz da vault. Frontend novo `static/js/vaults.js` (vanilla ES module) que constrói o painel dinamicamente, docka com `applyEdgeDock(modal,'right')` e registra no `modalManager` (com `label`/`icon` custom — sem editar o manager). Markdown reusa `mdToHtml()` com pré-processamento de wikilinks feito no módulo de vaults.

**Tech Stack:** FastAPI + pytest (TestClient), vanilla JS ES modules, git CLI via subprocess.

**Spec:** `docs/superpowers/specs/2026-07-25-vaults-panel-design.md`

## Global Constraints

- Feature **local do fork**: máximo em arquivos novos; edições em arquivos upstream restritas a: `static/index.html` (seção sidebar + script tag), `app.py` (2 linhas de registro), `static/style.css` (bloco append-only). Registrar tudo no `LOCAL_CHANGES.md`.
- Auth: toda rota com `Depends(require_user)` de `src.auth_helpers` (honra `AUTH_ENABLED=false`).
- Segurança de caminho: `os.path.realpath` + `os.path.commonpath == root` em TODA rota que recebe `path`; escrita/rename/delete recusam alvos sob `.git/`.
- Sem lib python de git — só subprocess do binário `git`, `cwd` = raiz validada, timeout por comando, stderr sempre repassado.
- Token de push só via env `VAULTFS_GIT_TOKEN` (nunca em argv/disco); `GIT_TERMINAL_PROMPT=0` em ops de rede.
- Commits deste plano: prefixo `local:` (padrão do fork para código não-upstream).
- Nomes de API/JS definidos nos blocos **Interfaces** são contratos — usar exatamente.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `routes/vaultfs_routes.py` | criar | Toda a API `/api/vaultfs/*` (arquivos + git) |
| `tests/test_vaultfs_routes.py` | criar | Testes de path-safety + CRUD + conflito |
| `tests/test_vaultfs_git.py` | criar | Testes das rotas git (repo temporário real) |
| `static/js/vaults.js` | criar | Painel: sidebar, árvore, viewer/editor, wikilinks, UI git |
| `static/js/vaultsGraph.js` | criar | Layout de lanes + render SVG do grafo |
| `static/index.html` | editar | Seção `#vaults-section` + `<script>` do módulo |
| `app.py` | editar | Registro do router (2 linhas, junto ao vault_routes L855) |
| `static/style.css` | editar | Bloco `.vaults-*` no final |
| `docker/pereiraoc.yml` | editar | Envs de identidade git + token |
| `LOCAL_CHANGES.md` | editar | Inventário do delta |

---

## FASE 1 — Browse + editor

### Task 1: Backend — resolução de vaults e confinamento de caminho

**Files:**
- Create: `routes/vaultfs_routes.py`
- Test: `tests/test_vaultfs_routes.py`

**Interfaces (Produces):**
- `setup_vaultfs_routes() -> APIRouter` (prefixo `/api/vaultfs`)
- Internos reusados pelas tasks seguintes:
  - `_list_vaults() -> list[dict]` — `{id, name, path, exists, has_git}`; `id` = slug kebab do basename (`re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')`), colisões ganham sufixo `-2`, `-3` (ordem da lista de settings)
  - `_vault_root(vault_id: str) -> str` — realpath da raiz; 404 se id desconhecido/pasta inexistente
  - `_resolve(root: str, rel: str, *, allow_root=False) -> str` — abspath confinado; 400 se escapar/`..`/absoluto/vazio (vazio ok se `allow_root`)
  - `_reject_git(rel: str)` — 403 se o caminho tocar `.git`
- `GET /api/vaultfs/vaults` → `{"vaults": [...]}`

- [ ] **Step 1: fixture + testes falhando** — `tests/test_vaultfs_routes.py`:

```python
"""Tests for routes/vaultfs_routes.py — vault file API."""
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
        assert r.status_code in (400, 404), bad


def test_symlink_escape_rejected(client, vault, tmp_path):
    outside = tmp_path / "outside.txt"
    outside.write_text("secret")
    (vault / "link.md").symlink_to(outside)
    r = client.get("/api/vaultfs/file", params={"vault": "test-vault", "path": "link.md"})
    assert r.status_code == 400
```

- [ ] **Step 2:** `pytest tests/test_vaultfs_routes.py -x -q` → FAIL (módulo não existe).
- [ ] **Step 3: implementação** — `routes/vaultfs_routes.py` (base do módulo):

```python
# routes/vaultfs_routes.py
"""Vault filesystem + git API (fork-local; ver LOCAL_CHANGES.md).

Serve as vaults (Obsidian) de tool_path_extra_roots pro painel de Vaults:
browse/CRUD de arquivos markdown e operações git estilo VS Code.
"""
import logging
import os
import re
import shutil
import subprocess
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from src.auth_helpers import require_user
from src.settings import get_setting

logger = logging.getLogger(__name__)

TEXT_MAX_BYTES = 5 * 1024 * 1024  # leitura de texto: 5MB


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "vault"


def _list_vaults() -> list[dict]:
    roots = get_setting("tool_path_extra_roots") or []
    out, seen = [], {}
    for raw in roots:
        if not raw:
            continue
        path = os.path.realpath(str(raw))
        name = os.path.basename(path.rstrip(os.sep)) or path
        vid = _slug(name)
        if vid in seen:
            seen[vid] += 1
            vid = f"{vid}-{seen[vid]}"
        else:
            seen[vid] = 1
        out.append({
            "id": vid,
            "name": name,
            "path": path,
            "exists": os.path.isdir(path),
            "has_git": os.path.isdir(os.path.join(path, ".git")),
        })
    return out


def _vault_root(vault_id: str) -> str:
    for v in _list_vaults():
        if v["id"] == vault_id:
            if not v["exists"]:
                raise HTTPException(404, f"Vault path not found on disk: {v['path']}")
            return v["path"]
    raise HTTPException(404, f"Unknown vault: {vault_id}")


def _resolve(root: str, rel: str, *, allow_root: bool = False) -> str:
    """Confina `rel` dentro de `root` (realpath + commonpath). 400 se escapar."""
    rel = (rel or "").strip()
    if not rel or rel in (".", "/"):
        if allow_root:
            return root
        raise HTTPException(400, "path is required")
    if os.path.isabs(rel):
        raise HTTPException(400, "absolute paths not allowed")
    target = os.path.realpath(os.path.join(root, rel))
    try:
        if os.path.commonpath([target, root]) != root:
            raise HTTPException(400, "path escapes vault root")
    except ValueError:
        raise HTTPException(400, "path escapes vault root")
    return target


def _reject_git(rel: str):
    parts = [p for p in rel.replace("\\", "/").split("/") if p]
    if ".git" in parts:
        raise HTTPException(403, "paths inside .git are not accessible")


def setup_vaultfs_routes() -> APIRouter:
    router = APIRouter(prefix="/api/vaultfs", tags=["vaultfs"])

    @router.get("/vaults")
    def list_vaults(request: Request, user: str = Depends(require_user)):
        return {"vaults": _list_vaults()}

    return router
```

- [ ] **Step 4:** `pytest tests/test_vaultfs_routes.py -x -q` — `test_list_vaults`, `test_unknown_vault_404` passam; os de `file`/`tree` ainda falham (rotas na Task 2). Marcar os pendentes como esperados rodando só os dois primeiros; NÃO commitar testes quebrando — mover `test_traversal_rejected`/`test_symlink_escape_rejected`/`test_unknown_vault_404` pra Task 2 se necessário. (Preferência: escrever todos agora e implementar Task 2 antes do commit conjunto.)
- [ ] **Step 5:** Commit junto com Task 2 (rotas de leitura) para o teste fechar verde.

### Task 2: Backend — tree, read, raw

**Files:** Modify: `routes/vaultfs_routes.py` · Test: `tests/test_vaultfs_routes.py`

**Interfaces (Produces):**
- `GET /tree?vault=` → `{"tree": [TreeNode]}`; `TreeNode = {name, path, type: "dir"|"file", size?, mtime?, children?}`; dotfiles/dirs excluídos; dirs primeiro, ordem alfabética case-insensitive
- `GET /file?vault=&path=` → `{content, mtime, size, path}` (413 se > 5MB; 404 se não existe; 400 se binário → `{detail: "binary file"}`)
- `GET /raw?vault=&path=` → FileResponse

- [ ] **Step 1: testes** (append em `tests/test_vaultfs_routes.py`):

```python
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
```

- [ ] **Step 2:** rodar → FAIL. **Step 3: implementação** (dentro de `setup_vaultfs_routes()`):

```python
    def _build_tree(abs_dir: str, rel_prefix: str) -> list[dict]:
        entries = []
        try:
            with os.scandir(abs_dir) as it:
                for e in it:
                    if e.name.startswith("."):
                        continue
                    rel = f"{rel_prefix}/{e.name}" if rel_prefix else e.name
                    if e.is_dir(follow_symlinks=False):
                        entries.append({
                            "name": e.name, "path": rel, "type": "dir",
                            "children": _build_tree(e.path, rel),
                        })
                    elif e.is_file(follow_symlinks=False):
                        st = e.stat()
                        entries.append({
                            "name": e.name, "path": rel, "type": "file",
                            "size": st.st_size, "mtime": st.st_mtime,
                        })
        except PermissionError:
            pass
        entries.sort(key=lambda n: (n["type"] != "dir", n["name"].casefold()))
        return entries

    @router.get("/tree")
    def get_tree(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        root = _vault_root(vault)
        return {"tree": _build_tree(root, "")}

    @router.get("/file")
    def read_file(request: Request, vault: str = Query(...), path: str = Query(...),
                  user: str = Depends(require_user)):
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file not found")
        st = os.stat(target)
        if st.st_size > TEXT_MAX_BYTES:
            raise HTTPException(413, "file too large for text view")
        with open(target, "rb") as f:
            data = f.read()
        if b"\x00" in data[:8192]:
            raise HTTPException(400, "binary file")
        return {"content": data.decode("utf-8", errors="replace"),
                "mtime": st.st_mtime, "size": st.st_size, "path": path}

    @router.get("/raw")
    def read_raw(request: Request, vault: str = Query(...), path: str = Query(...),
                 user: str = Depends(require_user)):
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file not found")
        return FileResponse(target)
```

Nota: symlink pra fora → `_resolve` já rejeita (realpath sai da raiz) → teste do symlink fecha aqui.
- [ ] **Step 4:** `pytest tests/test_vaultfs_routes.py -x -q` → tudo PASS.
- [ ] **Step 5:** `git add routes/vaultfs_routes.py tests/test_vaultfs_routes.py && git commit -m "local: vaultfs — listagem de vaults, tree, read e raw c/ confinamento de caminho"`

### Task 3: Backend — write (409 mtime), create, rename, delete

**Files:** Modify: `routes/vaultfs_routes.py` · Test: `tests/test_vaultfs_routes.py`

**Interfaces (Produces):**
- `PUT /file` body `{vault, path, content, base_mtime?: float, force?: bool}` → `{ok, mtime}`; 409 `{detail: {code: "mtime_conflict", disk_mtime}}` se mtime divergiu e `!force`
- `POST /file` body `{vault, path, kind: "file"|"dir", content?: str}` → `{ok, path}`; 409 se já existe; cria pais automaticamente
- `POST /rename` body `{vault, path, new_path}` → `{ok}`; 404 origem, 409 destino existe
- `DELETE /file?vault=&path=&recursive=` → `{ok}`; dir sem `recursive=true` → 400

- [ ] **Step 1: testes** (append):

```python
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
```

- [ ] **Step 2:** rodar → FAIL. **Step 3: implementação** — pydantic models no topo do módulo + rotas:

```python
class WriteBody(BaseModel):
    vault: str
    path: str
    content: str
    base_mtime: Optional[float] = None
    force: bool = False


class CreateBody(BaseModel):
    vault: str
    path: str
    kind: str = "file"  # "file" | "dir"
    content: str = ""


class RenameBody(BaseModel):
    vault: str
    path: str
    new_path: str
```

```python
    @router.put("/file")
    def write_file(body: WriteBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _reject_git(body.path)
        target = _resolve(root, body.path)
        if os.path.isdir(target):
            raise HTTPException(400, "target is a directory")
        if os.path.exists(target) and body.base_mtime is not None and not body.force:
            disk = os.stat(target).st_mtime
            if abs(disk - body.base_mtime) > 1e-4:
                raise HTTPException(409, {"code": "mtime_conflict", "disk_mtime": disk})
        os.makedirs(os.path.dirname(target) or root, exist_ok=True)
        tmp = target + ".vaultfs-tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(body.content)
        os.replace(tmp, target)
        return {"ok": True, "mtime": os.stat(target).st_mtime}

    @router.post("/file")
    def create_entry(body: CreateBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _reject_git(body.path)
        target = _resolve(root, body.path)
        if os.path.exists(target):
            raise HTTPException(409, "already exists")
        if body.kind == "dir":
            os.makedirs(target)
        else:
            os.makedirs(os.path.dirname(target) or root, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                f.write(body.content)
        return {"ok": True, "path": body.path}

    @router.post("/rename")
    def rename_entry(body: RenameBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _reject_git(body.path); _reject_git(body.new_path)
        src = _resolve(root, body.path)
        dst = _resolve(root, body.new_path)
        if not os.path.exists(src):
            raise HTTPException(404, "source not found")
        if os.path.exists(dst):
            raise HTTPException(409, "destination already exists")
        os.makedirs(os.path.dirname(dst) or root, exist_ok=True)
        os.rename(src, dst)
        return {"ok": True}

    @router.delete("/file")
    def delete_entry(request: Request, vault: str = Query(...), path: str = Query(...),
                     recursive: bool = Query(False), user: str = Depends(require_user)):
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if target == root:
            raise HTTPException(400, "cannot delete vault root")
        if os.path.isdir(target):
            if not recursive:
                raise HTTPException(400, "directory delete requires recursive=true")
            shutil.rmtree(target)
        elif os.path.isfile(target):
            os.remove(target)
        else:
            raise HTTPException(404, "not found")
        return {"ok": True}
```

- [ ] **Step 4:** `pytest tests/test_vaultfs_routes.py -x -q` → PASS.
- [ ] **Step 5:** `git commit -m "local: vaultfs — write c/ conflito de mtime, create, rename, delete"`

### Task 4: Registro no app.py

**Files:** Modify: `app.py` (junto às linhas 855-856, após `setup_vault_routes`)

- [ ] **Step 1:** adicionar:

```python
# Fork-local (ver LOCAL_CHANGES.md): painel de Vaults — arquivos + git.
from routes.vaultfs_routes import setup_vaultfs_routes
app.include_router(setup_vaultfs_routes())
```

- [ ] **Step 2:** smoke: `python -c "import app"` não é viável (side effects); em vez disso `python -c "from routes.vaultfs_routes import setup_vaultfs_routes; r=setup_vaultfs_routes(); print(len(r.routes))"` → imprime nº de rotas.
- [ ] **Step 3:** `git commit -m "local: registra vaultfs_routes no app"`

### Task 5: Frontend — seção no sidebar + painel dockado + esqueleto do módulo

**Files:**
- Modify: `static/index.html` — (a) seção após `#tools-section` (fecha ~linha 990); (b) `<script type="module" src="/static/js/vaults.js"></script>` junto aos outros módulos (~linha 2511)
- Create: `static/js/vaults.js`
- Modify: `static/style.css` — bloco `.vaults-*` no final

**Interfaces:**
- Consumes: `applyEdgeDock` (`modalSnap.js`), `register/minimize` (`modalManager.js`), `makeWindowDraggable` (`windowDrag.js`), `showToast/showError/styledConfirm/styledPrompt/esc` (`ui.js`)
- Produces (estado interno de `vaults.js` usado pelas tasks 6-9):
  - `state = {vaults, currentId, tree, noteIndex, openPath, openMtime, mode, dirty, git}`
  - `openVault(id)`, `refreshTree()`, `openFile(relPath)`, `renderViewer()`, `els` (refs DOM: `.vaults-title`, `.vaults-tree`, `.vaults-viewer`, `.vaults-git`)

- [ ] **Step 1: HTML da seção** (após o fechamento da `#tools-section`):

```html
      <div class="section" id="vaults-section">
        <div class="section-header-flex">
          <span class="section-title"><svg class="section-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M12 12v3"/><circle cx="12" cy="12" r="1"/></svg>Vaults</span>
        </div>
        <div id="vaults-list"></div>
      </div>
```

- [ ] **Step 2: esqueleto de `static/js/vaults.js`** — módulo que: (a) no load, faz `GET /api/vaultfs/vaults` e popula `#vaults-list` com `.list-item` por vault (desabilitada + title de aviso quando `!exists`); (b) constrói o painel na primeira abertura:

```javascript
// static/js/vaults.js — Painel de Vaults (fork-local; ver LOCAL_CHANGES.md)
import { applyEdgeDock } from './modalSnap.js';
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showToast, showError, styledConfirm, styledPrompt, esc } from './ui.js';
import { mdToHtml } from './markdown.js';

const PANEL_ID = 'vaults-panel';
const state = {
  vaults: [], currentId: null, tree: null,
  noteIndex: new Map(),      // basename lowercase (sem .md) -> [relPaths]
  openPath: null, openMtime: null, mode: 'view', dirty: false,
  git: null,                  // preenchido na Fase 2
};
const els = {};               // refs DOM do painel

async function api(path, opts) {
  const r = await fetch(`/api/vaultfs${path}`, opts);
  if (!r.ok) {
    let detail = null;
    try { detail = (await r.json()).detail; } catch (_) {}
    const err = new Error(typeof detail === 'string' ? detail : (detail?.code || r.statusText));
    err.status = r.status; err.detail = detail;
    throw err;
  }
  return r.json();
}

function buildPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'modal hidden';
  panel.innerHTML = `
    <div class="modal-content vaults-content">
      <div class="modal-header vaults-header">
        <span class="vaults-title"></span>
        <button class="close-btn" aria-label="Close vaults">✖</button>
      </div>
      <div class="vaults-body">
        <div class="vaults-viewer"></div>
        <div class="vaults-nav">
          <div class="vaults-toolbar"></div>
          <div class="vaults-tree"></div>
          <div class="vaults-git"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(panel);
  els.title  = panel.querySelector('.vaults-title');
  els.tree   = panel.querySelector('.vaults-tree');
  els.viewer = panel.querySelector('.vaults-viewer');
  els.git    = panel.querySelector('.vaults-git');
  els.toolbar = panel.querySelector('.vaults-toolbar');
  panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
  makeWindowDraggable(panel, {});
  Modals.register(PANEL_ID, {
    sidebarBtnId: null,
    label: 'Vaults',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/></svg>',
    restoreFn: () => {},
    closeFn: () => { panel.classList.add('hidden'); },
  });
  Modals.injectMinimizeButton(panel, PANEL_ID);
  return panel;
}

async function openVault(id) {
  const panel = buildPanel();
  state.currentId = id;
  const v = state.vaults.find(x => x.id === id);
  els.title.textContent = v ? v.name : id;
  panel.classList.remove('hidden');
  if (!panel.classList.contains('modal-right-docked')) {
    applyEdgeDock(panel, 'right');
  }
  await refreshTree();
  renderViewerEmpty();
}

async function refreshTree() { /* Task 6 */ }
function renderViewerEmpty() {
  els.viewer.innerHTML = '<div class="vaults-empty">Selecione uma nota na árvore →</div>';
}

async function initSidebar() {
  const list = document.getElementById('vaults-list');
  if (!list) return;
  try {
    const { vaults } = await api('/vaults');
    state.vaults = vaults;
    list.innerHTML = '';
    for (const v of vaults) {
      const item = document.createElement('div');
      item.className = 'list-item vaults-side-item' + (v.exists ? '' : ' vaults-missing');
      item.title = v.exists ? v.path : `Pasta não encontrada: ${v.path}`;
      item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.5;"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/></svg><span class="grow">${esc(v.name)}</span>`;
      if (v.exists) item.addEventListener('click', () => openVault(v.id));
      list.appendChild(item);
    }
  } catch (e) {
    console.warn('vaults: falha ao listar', e);
  }
}

if (document.readyState !== 'loading') initSidebar();
else document.addEventListener('DOMContentLoaded', initSidebar);
```

- [ ] **Step 3: CSS base** (append no `style.css`):

```css
/* ── Vaults panel (fork-local; ver LOCAL_CHANGES.md) ─────────────── */
.vaults-content { width: min(880px, 94vw); height: 85vh; display: flex; flex-direction: column; padding: 0; }
.vaults-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: move; border-bottom: 1px solid var(--border, rgba(128,128,128,0.25)); }
.vaults-title { font-weight: 600; font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vaults-body { display: flex; flex: 1; min-height: 0; }
.vaults-viewer { flex: 1; min-width: 0; overflow-y: auto; padding: 18px 22px; }
.vaults-nav { width: 250px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border, rgba(128,128,128,0.25)); min-height: 0; }
.vaults-toolbar { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border, rgba(128,128,128,0.2)); }
.vaults-tree { flex: 1; overflow-y: auto; padding: 6px 4px; font-size: 12.5px; }
.vaults-git { flex-shrink: 0; max-height: 45%; overflow-y: auto; border-top: 1px solid var(--border, rgba(128,128,128,0.25)); font-size: 12px; }
.vaults-empty { opacity: 0.5; text-align: center; margin-top: 40px; font-size: 13px; }
.vaults-side-item.vaults-missing { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 4: script tag** no index.html junto aos módulos (~linha 2511): `<script type="module" src="/static/js/vaults.js"></script>`
- [ ] **Step 5: verificação manual** — subir o app, ver seção Vaults com as duas vaults, clicar em pleitost → painel abre dockado à direita com título "pleitost", chat continua utilizável, minimizar vira chip "Vaults", fechar limpa o dock.
- [ ] **Step 6:** `git commit -m "local: vaults — seção no sidebar + painel dockado à direita (esqueleto)"`

### Task 6: Frontend — árvore navegável

**Files:** Modify: `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):** `refreshTree()` popula `state.tree` + `state.noteIndex` e renderiza em `els.tree`; `openFile(relPath)` definido na Task 7 é chamado no clique de arquivo. `state.noteIndex`: Map de `basename.toLowerCase()` (sem extensão `.md`) → array de relPaths.

- [ ] **Step 1: implementação** — substituir o stub `refreshTree`:

```javascript
async function refreshTree() {
  const { tree } = await api(`/tree?vault=${encodeURIComponent(state.currentId)}`);
  state.tree = tree;
  state.noteIndex = new Map();
  (function index(nodes) {
    for (const n of nodes) {
      if (n.type === 'file') {
        const base = n.name.replace(/\.md$/i, '').toLowerCase();
        if (!state.noteIndex.has(base)) state.noteIndex.set(base, []);
        state.noteIndex.get(base).push(n.path);
      } else if (n.children) index(n.children);
    }
  })(tree);
  renderTree();
}

function renderTree() {
  els.tree.innerHTML = '';
  els.tree.appendChild(buildTreeNodes(state.tree));
}

function buildTreeNodes(nodes) {
  const ul = document.createElement('ul');
  ul.className = 'vaults-tree-list';
  for (const n of nodes) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = `vaults-tree-row vaults-${n.type}`;
    row.dataset.path = n.path;
    row.innerHTML = n.type === 'dir'
      ? `<span class="vaults-caret">▸</span><span class="vaults-node-name">${esc(n.name)}</span><span class="vaults-badge"></span>`
      : `<span class="vaults-node-name">${esc(n.name)}</span><span class="vaults-badge"></span>`;
    li.appendChild(row);
    if (n.type === 'dir') {
      const kids = buildTreeNodes(n.children || []);
      kids.classList.add('vaults-collapsed');
      li.appendChild(kids);
      row.addEventListener('click', () => {
        kids.classList.toggle('vaults-collapsed');
        row.querySelector('.vaults-caret').textContent =
          kids.classList.contains('vaults-collapsed') ? '▸' : '▾';
      });
    } else {
      row.addEventListener('click', () => openFile(n.path));
    }
    ul.appendChild(li);
  }
  return ul;
}
```

CSS (append): `.vaults-tree-list { list-style:none; margin:0; padding-left:12px; } .vaults-tree-row { display:flex; align-items:center; gap:4px; padding:2px 6px; border-radius:5px; cursor:pointer; } .vaults-tree-row:hover { background: color-mix(in srgb, var(--accent-primary,#60a5fa) 12%, transparent); } .vaults-tree-row.vaults-active { background: color-mix(in srgb, var(--accent-primary,#60a5fa) 20%, transparent); } .vaults-collapsed { display:none; } .vaults-caret { width:10px; opacity:0.6; } .vaults-node-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; } .vaults-badge { font-size:10px; font-weight:700; margin-left:auto; }`

- [ ] **Step 2: verificação manual** — árvore da pleitost renderiza, pastas expandem/colapsam, `.obsidian` invisível.
- [ ] **Step 3:** `git commit -m "local: vaults — árvore de arquivos navegável"`

### Task 7: Frontend — viewer markdown + wikilinks + imagens

**Files:** Modify: `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):**
- `openFile(relPath)` — GET `/file`, guarda `openPath/openMtime`, `renderViewer()`
- `preprocessMd(src, relDir) -> string` — converte wikilinks/imagens ANTES do `mdToHtml`:
  - `![[img.png]]` → `<img src="/api/vaultfs/raw?vault=..&path=<resolvido>">`
  - `[[Nota]]`/`[[Nota|alias]]` → `<a class="vaults-wikilink" data-vaults-open="<relPath>">alias</a>`; não resolvido → `<a class="vaults-wikilink vaults-wikilink-missing" data-vaults-create="Nota">`
  - `![](rel.png)` markdown padrão → reescrever src relativo pra `/api/vaultfs/raw?...`
- `resolveNote(name) -> relPath|null` — via `state.noteIndex`, caminho mais curto vence
- Delegated click em `els.viewer` para `data-vaults-open` / `data-vaults-create`

- [ ] **Step 1: implementação:**

```javascript
function resolveNote(name) {
  // Obsidian-style: match por basename; se o nome tiver '/', tenta sufixo do path.
  const clean = name.trim().replace(/\.md$/i, '');
  const cands = state.noteIndex.get(clean.split('/').pop().toLowerCase()) || [];
  if (!cands.length) return null;
  if (clean.includes('/')) {
    const suffix = clean.toLowerCase() + '.md';
    const hit = cands.find(p => p.toLowerCase().endsWith(suffix));
    if (hit) return hit;
  }
  return cands.slice().sort((a, b) => a.length - b.length)[0];
}

function rawUrl(relPath) {
  return `/api/vaultfs/raw?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(relPath)}`;
}

function resolveRel(relDir, target) {
  // resolve caminho relativo à pasta da nota aberta (./, ../)
  const parts = (relDir ? relDir.split('/') : []).concat(target.split('/'));
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop(); else out.push(p);
  }
  return out.join('/');
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function preprocessMd(src, relDir) {
  // ![[embed]] primeiro (senão o [[...]] captura)
  src = src.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (m, target) => {
    const t = target.trim();
    if (IMG_EXT.test(t)) {
      const hit = findAsset(t) || t;
      return `<img class="vaults-embed" src="${rawUrl(hit)}" alt="${esc(t)}">`;
    }
    const note = resolveNote(t);
    return note
      ? `<a class="vaults-wikilink" data-vaults-open="${esc(note)}">${esc(t)}</a>`
      : `<a class="vaults-wikilink vaults-wikilink-missing" data-vaults-create="${esc(t)}">${esc(t)}</a>`;
  });
  src = src.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (m, target, alias) => {
    const label = (alias || target).trim();
    const note = resolveNote(target);
    return note
      ? `<a class="vaults-wikilink" data-vaults-open="${esc(note)}">${esc(label)}</a>`
      : `<a class="vaults-wikilink vaults-wikilink-missing" data-vaults-create="${esc(target.trim())}">${esc(label)}</a>`;
  });
  // imagens markdown com src relativo → rota raw
  src = src.replace(/!\[([^\]]*)\]\((?!https?:\/\/|\/|data:)([^)\s]+)\)/g,
    (m, alt, rel) => `![${alt}](${rawUrl(resolveRel(relDir, decodeURIComponent(rel)))})`);
  return src;
}

function findAsset(name) {
  // busca por basename em toda a árvore (imagens ficam em pastas de anexo)
  let hit = null;
  (function walk(nodes) {
    for (const n of nodes) {
      if (hit) return;
      if (n.type === 'file' && n.name.toLowerCase() === name.toLowerCase()) hit = n.path;
      else if (n.children) walk(n.children);
    }
  })(state.tree || []);
  return hit;
}

async function openFile(relPath) {
  if (state.dirty && !(await styledConfirm('Há edição não salva. Descartar?', { danger: true }))) return;
  try {
    const f = await api(`/file?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(relPath)}`);
    state.openPath = relPath; state.openMtime = f.mtime;
    state.mode = 'view'; state.dirty = false; state.content = f.content;
    highlightTreeRow(relPath);
    renderViewer();
  } catch (e) {
    if (e.status === 400 && IMG_EXT.test(relPath)) {
      state.openPath = relPath; state.mode = 'image';
      renderViewer();
    } else showError(`Falha ao abrir: ${e.message}`);
  }
}

function relDirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }

function renderViewer() {
  if (state.mode === 'image') {
    els.viewer.innerHTML = `<img class="vaults-embed" src="${rawUrl(state.openPath)}">`;
    return;
  }
  const bar = `<div class="vaults-viewbar">
      <span class="vaults-open-name">${esc(state.openPath || '')}</span>
      <button class="vaults-btn" data-vaults-mode="${state.mode === 'view' ? 'edit' : 'view'}">
        ${state.mode === 'view' ? 'Editar' : 'Visualizar'}</button>
      ${state.mode === 'edit' ? '<button class="vaults-btn vaults-save-btn">Salvar</button>' : ''}
      <span class="vaults-dirty" style="display:${state.dirty ? '' : 'none'}">●</span>
    </div>`;
  if (state.mode === 'view') {
    els.viewer.innerHTML = bar + `<div class="vaults-md">${mdToHtml(preprocessMd(state.content, relDirOf(state.openPath)))}</div>`;
  } else {
    els.viewer.innerHTML = bar + `<textarea class="vaults-editor" spellcheck="false"></textarea>`;
    const ta = els.viewer.querySelector('.vaults-editor');
    ta.value = state.content;
    ta.addEventListener('input', () => {
      state.content = ta.value;
      if (!state.dirty) { state.dirty = true; els.viewer.querySelector('.vaults-dirty').style.display = ''; }
    });
  }
}

function highlightTreeRow(relPath) {
  els.tree.querySelectorAll('.vaults-tree-row.vaults-active').forEach(r => r.classList.remove('vaults-active'));
  const row = els.tree.querySelector(`.vaults-tree-row[data-path="${CSS.escape(relPath)}"]`);
  if (row) {
    row.classList.add('vaults-active');
    // expande ancestrais
    let ul = row.closest('ul');
    while (ul && ul !== els.tree) { ul.classList.remove('vaults-collapsed'); ul = ul.parentElement.closest('ul'); }
  }
}
```

Delegated clicks (uma vez, no `buildPanel`):

```javascript
  els.viewer.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-vaults-open]');
    if (open) { openFile(open.dataset.vaultsOpen); return; }
    const create = e.target.closest('[data-vaults-create]');
    if (create) {
      const name = create.dataset.vaultsCreate;
      if (await styledConfirm(`Criar a nota "${name}"?`)) {
        const path = `${name}.md`;
        await api('/file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vault: state.currentId, path, kind: 'file', content: `# ${name}\n` }) });
        await refreshTree();
        openFile(path);
      }
      return;
    }
    const mode = e.target.closest('[data-vaults-mode]');
    if (mode) { state.mode = mode.dataset.vaultsMode; renderViewer(); return; }
    if (e.target.closest('.vaults-save-btn')) saveFile();
  });
```

CSS: `.vaults-viewbar { display:flex; align-items:center; gap:8px; margin-bottom:10px; font-size:12px; opacity:0.85; } .vaults-open-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .vaults-btn { font-size:11.5px; padding:3px 10px; border-radius:6px; border:1px solid var(--border, rgba(128,128,128,0.3)); background:transparent; color:inherit; cursor:pointer; } .vaults-btn:hover { background: color-mix(in srgb, var(--accent-primary,#60a5fa) 15%, transparent); } .vaults-wikilink { color: var(--accent-primary,#60a5fa); cursor:pointer; text-decoration:underline dotted; } .vaults-wikilink-missing { opacity:0.55; text-decoration-style:dashed; } .vaults-embed { max-width:100%; border-radius:8px; } .vaults-editor { width:100%; height: calc(100% - 40px); resize:none; background:transparent; color:inherit; border:1px solid var(--border, rgba(128,128,128,0.25)); border-radius:8px; padding:12px; font-family: ui-monospace, monospace; font-size:13px; line-height:1.5; } .vaults-dirty { color: var(--accent-primary,#f59e0b); } .vaults-md { font-size:14px; line-height:1.6; }`

- [ ] **Step 2: verificação manual** — abrir nota da pleitost com `[[wikilinks]]`: renderiza, clique navega, link quebrado oferece criar; imagem embutida aparece.
- [ ] **Step 3:** `git commit -m "local: vaults — viewer markdown c/ wikilinks Obsidian e imagens"`

### Task 8: Frontend — edição, salvar, Ctrl+S, conflito 409

**Files:** Modify: `static/js/vaults.js`

**Interfaces (Produces):** `saveFile(force = false)`; keydown Ctrl+S capturado quando painel visível e modo edit.

- [ ] **Step 1: implementação:**

```javascript
async function saveFile(force = false) {
  if (!state.openPath || state.mode !== 'edit') return;
  try {
    const r = await api('/file', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: state.currentId, path: state.openPath,
        content: state.content, base_mtime: state.openMtime, force }),
    });
    state.openMtime = r.mtime; state.dirty = false;
    els.viewer.querySelector('.vaults-dirty').style.display = 'none';
    showToast('Salvo');
  } catch (e) {
    if (e.status === 409 && e.detail?.code === 'mtime_conflict') {
      const ok = await styledConfirm(
        'O arquivo mudou no disco desde que você abriu (editado no Obsidian?). Sobrescrever mesmo assim?',
        { confirmText: 'Sobrescrever', danger: true, alternateText: 'Recarregar do disco' });
      if (ok === true) return saveFile(true);
      if (ok === 'alternate') { state.dirty = false; openFile(state.openPath); }
    } else showError(`Falha ao salvar: ${e.message}`);
  }
}

// no buildPanel():
  panel.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
  });
```

Nota: conferir o valor de retorno de `styledConfirm` com `alternateText` (ui.js L584) — ajustar o branch conforme a API real.
- [ ] **Step 2: verificação manual** — editar+salvar; `touch` no arquivo no host e salvar de novo → diálogo de conflito; Ctrl+S funciona.
- [ ] **Step 3:** `git commit -m "local: vaults — edição com salvar, Ctrl+S e diálogo de conflito"`

### Task 9: Frontend — criar/renomear/apagar pela UI

**Files:** Modify: `static/js/vaults.js`, `static/style.css`

- [ ] **Step 1:** toolbar (nova nota / nova pasta) + ações por linha da árvore (hover: renomear/apagar):

```javascript
function renderToolbar() {
  els.toolbar.innerHTML = `
    <button class="vaults-btn" data-vaults-new="file" title="Nova nota">＋ nota</button>
    <button class="vaults-btn" data-vaults-new="dir" title="Nova pasta">＋ pasta</button>
    <button class="vaults-btn" data-vaults-refresh title="Recarregar">↻</button>`;
}
// no buildPanel(): els.toolbar.addEventListener('click', ...) →
//  data-vaults-new: styledPrompt('Caminho da nova (ex: Pasta/Nome.md)') → POST /file → refreshTree() → se file, openFile()
//  data-vaults-refresh: refreshTree()
```

Nas linhas da árvore (`buildTreeNodes`), adicionar botões hover:

```javascript
    const acts = document.createElement('span');
    acts.className = 'vaults-row-acts';
    acts.innerHTML = `<button class="vaults-row-btn" data-act="rename" title="Renomear">✎</button>
                      <button class="vaults-row-btn" data-act="delete" title="Apagar">🗑</button>`;
    row.appendChild(acts);
    acts.addEventListener('click', async (e) => {
      e.stopPropagation();
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'rename') {
        const np = await styledPrompt('Novo caminho:', { defaultValue: n.path });
        if (!np || np === n.path) return;
        await api('/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vault: state.currentId, path: n.path, new_path: np }) });
        if (state.openPath === n.path) state.openPath = np;
        await refreshTree();
      } else if (act === 'delete') {
        const isDir = n.type === 'dir';
        if (!(await styledConfirm(
          isDir ? `Apagar a pasta "${n.path}" e TODO o conteúdo?` : `Apagar "${n.path}"?`,
          { danger: true }))) return;
        await api(`/file?vault=${encodeURIComponent(state.currentId)}&path=${encodeURIComponent(n.path)}&recursive=${isDir}`,
          { method: 'DELETE' });
        if (state.openPath === n.path) { state.openPath = null; renderViewerEmpty(); }
        await refreshTree();
      }
    });
```

CSS: `.vaults-row-acts { display:none; margin-left:auto; gap:2px; } .vaults-tree-row:hover .vaults-row-acts { display:inline-flex; } .vaults-row-btn { background:none; border:none; cursor:pointer; opacity:0.55; font-size:11px; padding:0 2px; color:inherit; } .vaults-row-btn:hover { opacity:1; }` — e conferir `styledPrompt` (ui.js L681) pro nome do param de valor inicial.
- [ ] **Step 2: verificação manual** — criar nota/pasta, renomear, apagar (confirmações ok), árvore atualiza.
- [ ] **Step 3:** `git commit -m "local: vaults — criar/renomear/apagar arquivos pela UI"` — **fecha a Fase 1.**

---

## FASE 2 — Git essencial

### Task 10: Backend — runner git + status porcelain v2

**Files:** Modify: `routes/vaultfs_routes.py` · Create: `tests/test_vaultfs_git.py`

**Interfaces (Produces):**
- `_git(root, *args, timeout=30, env_extra=None) -> (code, stdout, stderr)`; identidade: se `GIT_AUTHOR_NAME` não estiver no env, injeta `-c user.name=Odysseus -c user.email=odysseus@local` (fallback container sem config)
- `_git_ok(root, *args, ...)` — igual mas levanta `HTTPException(500, stderr)` se code != 0
- `_require_repo(root)` — 400 `{code:"no_git"}` se não há `.git`
- `GET /git/status?vault=` → `{branch, upstream, ahead, behind, staged: [{path, code}], unstaged: [{path, code}], untracked: [path], has_git: bool}` — `has_git=false` (sem erro) quando não é repo

- [ ] **Step 1: fixture + testes** — `tests/test_vaultfs_git.py`:

```python
"""Tests for vaultfs git routes — real temp git repos."""
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
    _git(v, "add", "."); _git(v, "commit", "-m", "primeiro")
    return v


@pytest.fixture
def client(repo, monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    for k, val in GIT_ENV.items():
        monkeypatch.setenv(k, val)
    import routes.vaultfs_routes as vr
    monkeypatch.setattr(vr, "get_setting",
        lambda key: [str(repo)] if key == "tool_path_extra_roots" else None)
    app = FastAPI()
    app.include_router(vr.setup_vaultfs_routes())
    return TestClient(app)


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


def test_status_no_git(client, repo, monkeypatch):
    import shutil as sh
    sh.rmtree(repo / ".git")
    r = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert r["has_git"] is False
```

- [ ] **Step 2:** rodar → FAIL. **Step 3: implementação:**

```python
def _git(root: str, *args: str, timeout: int = 30, env_extra: Optional[dict] = None):
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env.update(env_extra or {})
    cmd = ["git"]
    if not env.get("GIT_AUTHOR_NAME"):
        cmd += ["-c", "user.name=Odysseus", "-c", "user.email=odysseus@local"]
    cmd += list(args)
    try:
        p = subprocess.run(cmd, cwd=root, capture_output=True, text=True,
                           timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, f"git {args[0]} timed out")
    except FileNotFoundError:
        raise HTTPException(500, "git binary not available")
    return p.returncode, p.stdout, p.stderr


def _git_ok(root: str, *args: str, timeout: int = 30, env_extra: Optional[dict] = None) -> str:
    code, out, err = _git(root, *args, timeout=timeout, env_extra=env_extra)
    if code != 0:
        raise HTTPException(500, (err or out or f"git {args[0]} failed").strip())
    return out


def _require_repo(root: str):
    if not os.path.isdir(os.path.join(root, ".git")):
        raise HTTPException(400, {"code": "no_git", "message": "vault is not a git repository"})


def _parse_status_v2(out: str) -> dict:
    st = {"branch": None, "upstream": None, "ahead": 0, "behind": 0,
          "staged": [], "unstaged": [], "untracked": []}
    for line in out.splitlines():
        if line.startswith("# branch.head "):
            st["branch"] = line.split(" ", 2)[2]
        elif line.startswith("# branch.upstream "):
            st["upstream"] = line.split(" ", 2)[2]
        elif line.startswith("# branch.ab "):
            m = re.match(r"# branch\.ab \+(\d+) -(\d+)", line)
            if m:
                st["ahead"], st["behind"] = int(m.group(1)), int(m.group(2))
        elif line.startswith("? "):
            st["untracked"].append(line[2:])
        elif line.startswith(("1 ", "2 ")):
            parts = line.split(" ")
            xy = parts[1]
            if line.startswith("2 "):
                path = " ".join(parts[9:]).split("\t")[0]
            else:
                path = " ".join(parts[8:])
            if xy[0] != ".":
                st["staged"].append({"path": path, "code": xy[0]})
            if xy[1] != ".":
                st["unstaged"].append({"path": path, "code": xy[1]})
        elif line.startswith("u "):
            parts = line.split(" ")
            st["unstaged"].append({"path": " ".join(parts[10:]), "code": "U"})
    return st
```

Rota (dentro do setup):

```python
    @router.get("/git/status")
    def git_status(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        root = _vault_root(vault)
        if not os.path.isdir(os.path.join(root, ".git")):
            return {"has_git": False, "branch": None, "upstream": None, "ahead": 0,
                    "behind": 0, "staged": [], "unstaged": [], "untracked": []}
        out = _git_ok(root, "status", "--porcelain=v2", "--branch")
        return {"has_git": True, **_parse_status_v2(out)}
```

- [ ] **Step 4:** `pytest tests/test_vaultfs_git.py -x -q` → PASS.
- [ ] **Step 5:** `git commit -m "local: vaultfs — runner git + status porcelain v2"`

### Task 11: Backend — stage/unstage/discard/commit/undo + log + diff

**Files:** Modify: `routes/vaultfs_routes.py` · Test: `tests/test_vaultfs_git.py`

**Interfaces (Produces):**
- `POST /git/stage` body `{vault, paths: [str]}` → `{ok}` (`git add --`)
- `POST /git/unstage` body `{vault, paths}` → `{ok}` (`git restore --staged --`)
- `POST /git/discard` body `{vault, paths}` → `{ok}` (tracked: `git restore --`; untracked: apagar arquivo)
- `POST /git/commit` body `{vault, message, amend?: bool}` → `{ok, hash}`; 400 se message vazia e !amend
- `POST /git/undo_commit` body `{vault}` → `{ok}` (`reset --soft HEAD~1`); 400 se não há parent
- `GET /git/log?vault=&limit=&skip=` → `{commits: [{hash, short, author, date, subject}]}`
- `GET /git/diff?vault=[&path=][&staged=true][&commit=hash]` → PlainTextResponse (unified diff)

- [ ] **Step 1: testes** (append em `tests/test_vaultfs_git.py`):

```python
def _post(client, route, **body):
    return client.post(f"/api/vaultfs/git/{route}", json=body)


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


def test_undo_commit(client, repo):
    (repo / "a.md").write_text("# v2")
    _post(client, "stage", vault="gitvault", paths=["a.md"])
    _post(client, "commit", vault="gitvault", message="segundo")
    assert _post(client, "undo_commit", vault="gitvault").status_code == 200
    log = client.get("/api/vaultfs/git/log", params={"vault": "gitvault"}).json()["commits"]
    assert len(log) == 1
    s = client.get("/api/vaultfs/git/status", params={"vault": "gitvault"}).json()
    assert s["staged"] == [{"path": "a.md", "code": "M"}]


def test_diff_working_and_commit(client, repo):
    (repo / "a.md").write_text("# mudou")
    r = client.get("/api/vaultfs/git/diff", params={"vault": "gitvault", "path": "a.md"})
    assert r.status_code == 200 and "+# mudou" in r.text
    log = client.get("/api/vaultfs/git/log", params={"vault": "gitvault"}).json()["commits"]
    r = client.get("/api/vaultfs/git/diff", params={"vault": "gitvault", "commit": log[0]["hash"]})
    assert "+# a" in r.text
```

- [ ] **Step 2:** rodar → FAIL. **Step 3: implementação** — model `GitPathsBody(vault, paths: list[str])`, `GitCommitBody(vault, message="", amend=False)`, `GitVaultBody(vault)`; validar cada `paths[i]` com `_reject_git` + `_resolve`:

```python
    def _validated_rel_paths(root: str, paths: list) -> list:
        out = []
        for p in paths or []:
            _reject_git(p)
            _resolve(root, p)  # 400 se escapar
            out.append(p)
        if not out:
            raise HTTPException(400, "paths is required")
        return out

    @router.post("/git/stage")
    def git_stage(body: GitPathsBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        _git_ok(root, "add", "--", *_validated_rel_paths(root, body.paths))
        return {"ok": True}

    @router.post("/git/unstage")
    def git_unstage(body: GitPathsBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        _git_ok(root, "restore", "--staged", "--", *_validated_rel_paths(root, body.paths))
        return {"ok": True}

    @router.post("/git/discard")
    def git_discard(body: GitPathsBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        rels = _validated_rel_paths(root, body.paths)
        code, out, _err = _git(root, "ls-files", "--error-unmatch", "--", *rels)
        tracked, untracked = [], []
        for p in rels:
            c, _o, _e = _git(root, "ls-files", "--error-unmatch", "--", p)
            (tracked if c == 0 else untracked).append(p)
        if tracked:
            _git_ok(root, "restore", "--", *tracked)
        for p in untracked:
            t = _resolve(root, p)
            if os.path.isfile(t):
                os.remove(t)
        return {"ok": True}

    @router.post("/git/commit")
    def git_commit(body: GitCommitBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        msg = (body.message or "").strip()
        if not msg and not body.amend:
            raise HTTPException(400, "commit message is required")
        args = ["commit"]
        if body.amend:
            args += ["--amend"]
            args += ["-m", msg] if msg else ["--no-edit"]
        else:
            args += ["-m", msg]
        _git_ok(root, *args)
        return {"ok": True, "hash": _git_ok(root, "rev-parse", "HEAD").strip()}

    @router.post("/git/undo_commit")
    def git_undo(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        code, _o, _e = _git(root, "rev-parse", "--verify", "HEAD~1")
        if code != 0:
            raise HTTPException(400, "nothing to undo (first commit)")
        _git_ok(root, "reset", "--soft", "HEAD~1")
        return {"ok": True}

    SEP, EOR = "\x1f", "\x1e"

    @router.get("/git/log")
    def git_log(request: Request, vault: str = Query(...), limit: int = Query(50, le=500),
                skip: int = Query(0, ge=0), user: str = Depends(require_user)):
        root = _vault_root(vault); _require_repo(root)
        code, out, err = _git(root, "log", f"--pretty=format:%H{SEP}%h{SEP}%an{SEP}%aI{SEP}%s{EOR}",
                              "-n", str(limit), f"--skip={skip}")
        if code != 0:
            return {"commits": []}  # repo sem commits
        commits = []
        for rec in out.split(EOR):
            rec = rec.strip("\n")
            if not rec:
                continue
            h, short, an, date, subj = rec.split(SEP, 4)
            commits.append({"hash": h, "short": short, "author": an, "date": date, "subject": subj})
        return {"commits": commits}

    @router.get("/git/diff")
    def git_diff(request: Request, vault: str = Query(...), path: Optional[str] = Query(None),
                 staged: bool = Query(False), commit: Optional[str] = Query(None),
                 user: str = Depends(require_user)):
        root = _vault_root(vault); _require_repo(root)
        if commit:
            if not re.fullmatch(r"[0-9a-fA-F]{4,40}", commit):
                raise HTTPException(400, "invalid commit hash")
            args = ["show", "--format=commit %H%nAuthor: %an%nDate: %aI%n%n    %s%n", commit]
        else:
            args = ["diff", "--staged"] if staged else ["diff"]
        if path:
            _reject_git(path); _resolve(root, path)
            args += ["--", path]
        out = _git_ok(root, *args, timeout=60)
        return PlainTextResponse(out)
```

Nota: em `git_diff` de untracked file, `git diff` retorna vazio — o frontend mostra o conteúdo do arquivo como "novo arquivo" (Task 13). Simplificar `git_discard` removendo a primeira chamada `ls-files` redundante.
- [ ] **Step 4:** `pytest tests/test_vaultfs_git.py tests/test_vaultfs_routes.py -q` → PASS.
- [ ] **Step 5:** `git commit -m "local: vaultfs — stage/commit/discard/undo, log e diff"`

### Task 12: Frontend — strip git (mudanças, commit, badges na árvore)

**Files:** Modify: `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):**
- `refreshGit()` — GET `/git/status`, guarda em `state.git`, chama `renderGit()` + `applyTreeBadges()`
- `renderGit()` em `els.git`: seção MUDANÇAS (staged/unstaged/untracked com botões por arquivo), textarea de mensagem, botão Commit + checkbox amend, "desfazer último commit"; sem repo → botão "Inicializar repositório" (Fase 3, aqui placeholder desabilitado)
- `applyTreeBadges()` — pinta `.vaults-badge` da linha: M laranja, A/staged verde, U(untracked) verde-claro; pastas ancestrais ganham dot
- Toda operação git → re-`refreshGit()`; erros → `showError(stderr)`

- [ ] **Step 1: implementação** (núcleo):

```javascript
async function refreshGit() {
  try {
    state.git = await api(`/git/status?vault=${encodeURIComponent(state.currentId)}`);
  } catch (e) { state.git = null; }
  renderGit(); applyTreeBadges();
}

function gitOp(route, body) {
  return api(`/git/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault: state.currentId, ...body }) })
    .then(r => { refreshGit(); return r; })
    .catch(e => { showError(`git: ${e.message}`); throw e; });
}

function renderGit() {
  const g = state.git;
  if (!g) { els.git.innerHTML = ''; return; }
  if (!g.has_git) {
    els.git.innerHTML = `<div class="vaults-git-sec"><button class="vaults-btn" data-git="init">Inicializar repositório</button></div>`;
    return;
  }
  const n = g.staged.length + g.unstaged.length + g.untracked.length;
  const row = (p, code, acts) => `
    <div class="vaults-chg" data-path="${esc(p)}">
      <span class="vaults-chg-name" data-git="diff" title="${esc(p)}">${esc(p.split('/').pop())}</span>
      <span class="vaults-chg-code">${code}</span>${acts}
    </div>`;
  els.git.innerHTML = `
    <div class="vaults-git-sec">
      <div class="vaults-git-head">MUDANÇAS (${n})</div>
      ${g.staged.map(c => row(c.path, c.code,
        `<button class="vaults-row-btn" data-git="unstage" title="Unstage">−</button>`)).join('')}
      ${g.unstaged.map(c => row(c.path, c.code,
        `<button class="vaults-row-btn" data-git="stage" title="Stage">＋</button>
         <button class="vaults-row-btn" data-git="discard" title="Descartar">↶</button>`)).join('')}
      ${g.untracked.map(p => row(p, 'U',
        `<button class="vaults-row-btn" data-git="stage" title="Stage">＋</button>
         <button class="vaults-row-btn" data-git="discard" title="Descartar">↶</button>`)).join('')}
      <textarea class="vaults-commit-msg" placeholder="Mensagem de commit…" rows="2"></textarea>
      <div class="vaults-commit-row">
        <button class="vaults-btn" data-git="commit">✓ Commit</button>
        <label class="vaults-amend"><input type="checkbox" class="vaults-amend-cb"> amend</label>
        <button class="vaults-row-btn" data-git="undo" title="Desfazer último commit (reset soft)">↩</button>
      </div>
    </div>`;
}

function applyTreeBadges() {
  const g = state.git;
  const map = new Map();
  if (g?.has_git) {
    for (const c of g.staged) map.set(c.path, { code: c.code, cls: 'vaults-b-staged' });
    for (const c of g.unstaged) map.set(c.path, { code: c.code, cls: 'vaults-b-mod' });
    for (const p of g.untracked) map.set(p, { code: 'U', cls: 'vaults-b-new' });
  }
  els.tree.querySelectorAll('.vaults-tree-row').forEach(rowEl => {
    const badge = rowEl.querySelector('.vaults-badge');
    if (!badge) return;
    const p = rowEl.dataset.path;
    const hit = map.get(p);
    if (hit) { badge.textContent = hit.code; badge.className = `vaults-badge ${hit.cls}`; }
    else {
      // pasta ancestral de alguma mudança → dot
      const isDirWithChange = rowEl.classList.contains('vaults-dir')
        && [...map.keys()].some(k => k.startsWith(p + '/'));
      badge.textContent = isDirWithChange ? '•' : '';
      badge.className = 'vaults-badge' + (isDirWithChange ? ' vaults-b-mod' : '');
    }
  });
}
```

Delegated click em `els.git` (no `buildPanel`): resolver `data-git` — `stage`/`unstage`/`discard` (com `styledConfirm` no discard) usam o `data-path` do `.vaults-chg` pai → `gitOp(route, {paths:[p]})`; `commit` lê `.vaults-commit-msg` + `.vaults-amend-cb` → `gitOp('commit', {message, amend})` e limpa a textarea; `undo` com confirm → `gitOp('undo_commit', {})`; `diff` → `openDiff(p)` (Task 13). `openVault()` passa a chamar `refreshGit()` após `refreshTree()`; `saveFile()` e ops de arquivo também chamam `refreshGit()`.

CSS: `.vaults-git-sec { padding:8px; } .vaults-git-head { font-size:10px; font-weight:700; opacity:0.6; letter-spacing:0.08em; margin-bottom:4px; } .vaults-chg { display:flex; align-items:center; gap:4px; padding:2px 4px; border-radius:4px; } .vaults-chg:hover { background: color-mix(in srgb, var(--accent-primary,#60a5fa) 10%, transparent); } .vaults-chg-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; } .vaults-chg-code { font-size:10px; font-weight:700; } .vaults-commit-msg { width:100%; margin-top:6px; font-size:12px; background:transparent; color:inherit; border:1px solid var(--border, rgba(128,128,128,0.3)); border-radius:6px; padding:6px; resize:vertical; } .vaults-commit-row { display:flex; align-items:center; gap:8px; margin-top:4px; } .vaults-amend { font-size:11px; opacity:0.7; display:flex; align-items:center; gap:3px; } .vaults-b-mod { color:#e5a54b; } .vaults-b-staged { color:#5fbf77; } .vaults-b-new { color:#7fd794; }`
- [ ] **Step 2: verificação manual** na pleitost (tem mudanças reais): badges M na árvore, stage/unstage move entre listas, commit de teste numa branch descartável funciona, undo devolve.
- [ ] **Step 3:** `git commit -m "local: vaults — UI git: mudanças, stage/commit, badges na árvore"`

### Task 13: Frontend — diff no viewer + lista de commits

**Files:** Modify: `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):**
- `openDiff(path, {staged} = {})` e `openCommit(hash)` — buscam o diff e renderizam no viewer (`state.mode = 'diff'`)
- `renderDiffText(text)` — pre com linhas coloridas (`+` verde, `-` vermelho, `@@` azul)
- `renderGitLog()` — GET `/git/log?limit=30` → lista no fim de `els.git` com `data-git="show-commit"`; item "⋯ ver grafo completo" (placeholder até Fase 3)

- [ ] **Step 1: implementação:**

```javascript
function renderDiffText(text) {
  if (!text.trim()) return '<div class="vaults-empty">Sem diferenças (arquivo novo? veja o conteúdo na árvore)</div>';
  return '<pre class="vaults-diff">' + text.split('\n').map(l => {
    const c = l.startsWith('+') && !l.startsWith('+++') ? 'vaults-dl-add'
      : l.startsWith('-') && !l.startsWith('---') ? 'vaults-dl-del'
      : l.startsWith('@@') ? 'vaults-dl-hunk'
      : (l.startsWith('diff ') || l.startsWith('commit ')) ? 'vaults-dl-head' : '';
    return `<span class="${c}">${esc(l)}</span>`;
  }).join('\n') + '</pre>';
}

async function openDiff(path, { staged = false } = {}) {
  const q = new URLSearchParams({ vault: state.currentId, path, staged: String(staged) });
  const r = await fetch(`/api/vaultfs/git/diff?${q}`);
  const text = await r.text();
  state.mode = 'diff';
  els.viewer.innerHTML = `<div class="vaults-viewbar"><span class="vaults-open-name">diff: ${esc(path)}</span>
    <button class="vaults-btn" data-vaults-open="${esc(path)}">Abrir nota</button></div>` + renderDiffText(text);
}

async function openCommit(hash) {
  const q = new URLSearchParams({ vault: state.currentId, commit: hash });
  const r = await fetch(`/api/vaultfs/git/diff?${q}`);
  const text = await r.text();
  state.mode = 'diff';
  els.viewer.innerHTML = `<div class="vaults-viewbar"><span class="vaults-open-name">commit ${esc(hash.slice(0, 8))}</span></div>`
    + renderDiffText(text);
}

async function renderGitLog() {
  if (!state.git?.has_git) return;
  const { commits } = await api(`/git/log?vault=${encodeURIComponent(state.currentId)}&limit=30`);
  const sec = document.createElement('div');
  sec.className = 'vaults-git-sec vaults-log-sec';
  sec.innerHTML = `<div class="vaults-git-head">COMMITS (${esc(state.git.branch || '')})</div>`
    + commits.map(c => `<div class="vaults-log-row" data-git="show-commit" data-hash="${c.hash}" title="${esc(c.subject)}">
        <span class="vaults-log-hash">${c.short}</span><span class="vaults-log-subj">${esc(c.subject)}</span>
      </div>`).join('')
    + `<div class="vaults-log-row vaults-log-more" data-git="graph">⋯ ver grafo completo</div>`;
  els.git.appendChild(sec);
}
```

`renderGit()` passa a chamar `renderGitLog()` no final; o delegated handler ganha os cases `show-commit` → `openCommit(hash)` e `diff` staged-aware (staged rows chamam `openDiff(p, {staged:true})`). CSS: `.vaults-diff { font-family:ui-monospace,monospace; font-size:12px; line-height:1.45; overflow-x:auto; } .vaults-dl-add { color:#5fbf77; } .vaults-dl-del { color:#e06c75; } .vaults-dl-hunk { color:#61afef; } .vaults-dl-head { opacity:0.6; } .vaults-log-row { display:flex; gap:6px; padding:2px 4px; cursor:pointer; border-radius:4px; } .vaults-log-row:hover { background: color-mix(in srgb, var(--accent-primary,#60a5fa) 10%, transparent); } .vaults-log-hash { font-family:ui-monospace,monospace; opacity:0.6; } .vaults-log-subj { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; } .vaults-log-more { opacity:0.6; justify-content:center; }`
- [ ] **Step 2: verificação manual** — clicar em arquivo modificado → diff colorido; clicar em commit da lista → diff do commit.
- [ ] **Step 3:** `git commit -m "local: vaults — diff no viewer e lista de commits"` — **fecha a Fase 2.**

---

## FASE 3 — Git completo

### Task 14: Backend — branches, checkout, criar branch, init

**Files:** Modify: `routes/vaultfs_routes.py` · Test: `tests/test_vaultfs_git.py`

**Interfaces (Produces):**
- `GET /git/branches?vault=` → `{branches: [{name, current: bool}]}` (locais)
- `POST /git/checkout` body `{vault, branch, create?: bool}` → `{ok}`; erros do git (tree sujo etc.) → 500 com stderr
- `POST /git/init` body `{vault}` → `{ok}` (`git init -b main`); 400 se já é repo

- [ ] **Step 1: testes:**

```python
def test_branches_checkout_create(client, repo):
    r = _post(client, "checkout", vault="gitvault", branch="nova", create=True)
    assert r.status_code == 200
    bs = client.get("/api/vaultfs/git/branches", params={"vault": "gitvault"}).json()["branches"]
    assert {"name": "nova", "current": True} in bs
    assert _post(client, "checkout", vault="gitvault", branch="main").status_code == 200


def test_init(client, repo):
    import shutil as sh
    sh.rmtree(repo / ".git")
    assert _post(client, "init", vault="gitvault").status_code == 200
    assert (repo / ".git").is_dir()
    assert _post(client, "init", vault="gitvault").status_code == 400
```

- [ ] **Step 2:** FAIL. **Step 3: implementação** — model `GitCheckoutBody(vault, branch, create=False)`; validar `branch` com `re.fullmatch(r"[\w\-./]{1,120}", branch)` e recusar começar com `-`:

```python
    @router.get("/git/branches")
    def git_branches(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        root = _vault_root(vault); _require_repo(root)
        out = _git_ok(root, "branch", "--format=%(refname:short)%(HEAD)")
        branches = []
        for line in out.splitlines():
            cur = line.endswith("*")
            branches.append({"name": line.rstrip("*").strip(), "current": cur})
        return {"branches": branches}

    @router.post("/git/checkout")
    def git_checkout(body: GitCheckoutBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        b = (body.branch or "").strip()
        if not re.fullmatch(r"[\w\-./]{1,120}", b) or b.startswith("-"):
            raise HTTPException(400, "invalid branch name")
        args = ["checkout", "-b", b] if body.create else ["checkout", b]
        _git_ok(root, *args)
        return {"ok": True}

    @router.post("/git/init")
    def git_init(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        if os.path.isdir(os.path.join(root, ".git")):
            raise HTTPException(400, "already a git repository")
        _git_ok(root, "init", "-b", "main")
        return {"ok": True}
```

Nota: `%(refname:short)%(HEAD)` — conferir formato real (`%(HEAD)` imprime `*` ou espaço); ajustar parse conforme.
- [ ] **Step 4:** PASS. **Step 5:** `git commit -m "local: vaultfs — branches, checkout/create e git init"`

### Task 15: Backend — push/pull/fetch com credencial via env

**Files:** Modify: `routes/vaultfs_routes.py` · Test: `tests/test_vaultfs_git.py`

**Interfaces (Produces):**
- `POST /git/push|pull|fetch` body `{vault}` → `{ok, output}`; timeout 120s
- Credencial https: `credential.helper` inline via `-c` que ecoa `username=${VAULTFS_GIT_USER:-git}` / `password=$VAULTFS_GIT_TOKEN` (token só via env; helper shell não contém o token no argv)
- Sem upstream configurado no push → git erra → 500 com stderr claro

- [ ] **Step 1: teste** (rede não disponível em teste — usar um remote local file://):

```python
def test_push_pull_local_remote(client, repo, tmp_path):
    bare = tmp_path / "bare.git"
    _git(tmp_path, "init", "--bare", "-b", "main", str(bare))
    _git(repo, "remote", "add", "origin", str(bare))
    r = _post(client, "push", vault="gitvault")
    # primeiro push sem upstream: a rota usa -u origin <branch atual>
    assert r.status_code == 200, r.text
    (repo / "a.md").write_text("# push2")
    _git(repo, "add", "."); _git(repo, "commit", "-m", "x")
    assert _post(client, "push", vault="gitvault").status_code == 200
    assert _post(client, "fetch", vault="gitvault").status_code == 200
    assert _post(client, "pull", vault="gitvault").status_code == 200
```

- [ ] **Step 2:** FAIL. **Step 3: implementação:**

```python
    _CRED_HELPER = (
        "!f() { echo \"username=${VAULTFS_GIT_USER:-git}\"; "
        "echo \"password=$VAULTFS_GIT_TOKEN\"; }; f"
    )

    def _git_net(root: str, *args: str) -> str:
        return _git_ok(root, "-c", f"credential.helper={_CRED_HELPER}", *args, timeout=120)

    @router.post("/git/push")
    def git_push(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        code, out, err = _git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
        if code != 0:
            branch = _git_ok(root, "rev-parse", "--abbrev-ref", "HEAD").strip()
            output = _git_net(root, "push", "-u", "origin", branch)
        else:
            output = _git_net(root, "push")
        return {"ok": True, "output": output}

    @router.post("/git/pull")
    def git_pull(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        return {"ok": True, "output": _git_net(root, "pull", "--ff-only")}

    @router.post("/git/fetch")
    def git_fetch(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault); _require_repo(root)
        return {"ok": True, "output": _git_net(root, "fetch", "--all", "--prune")}
```

Decisão: `pull --ff-only` — merge/rebase automático fica fora da v1 (spec); pull não-ff → erro claro do git orientando resolver no host.
- [ ] **Step 4:** PASS. **Step 5:** `git commit -m "local: vaultfs — push/pull/fetch com credencial via env"`

### Task 16: Backend — endpoint do grafo

**Files:** Modify: `routes/vaultfs_routes.py` · Test: `tests/test_vaultfs_git.py`

**Interfaces (Produces):**
- `GET /git/graph?vault=&limit=&skip=` → `{commits: [{hash, short, parents: [str], author, date, refs: [str], subject}]}` — `git log --all --topo-order`, `refs` de `%D` split por `, ` (vazio → `[]`)

- [ ] **Step 1: teste:**

```python
def test_graph_two_branches(client, repo):
    _git(repo, "checkout", "-b", "feat")
    (repo / "f.md").write_text("f")
    _git(repo, "add", "."); _git(repo, "commit", "-m", "na feat")
    _git(repo, "checkout", "main")
    r = client.get("/api/vaultfs/git/graph", params={"vault": "gitvault"})
    assert r.status_code == 200
    commits = r.json()["commits"]
    assert len(commits) == 2
    feat = next(c for c in commits if c["subject"] == "na feat")
    assert "feat" in " ".join(feat["refs"])
    assert len(feat["parents"]) == 1
```

- [ ] **Step 2:** FAIL. **Step 3: implementação:**

```python
    @router.get("/git/graph")
    def git_graph(request: Request, vault: str = Query(...), limit: int = Query(200, le=1000),
                  skip: int = Query(0, ge=0), user: str = Depends(require_user)):
        root = _vault_root(vault); _require_repo(root)
        code, out, err = _git(
            root, "log", "--all", "--topo-order",
            f"--pretty=format:%H{SEP}%h{SEP}%P{SEP}%an{SEP}%aI{SEP}%D{SEP}%s{EOR}",
            "-n", str(limit), f"--skip={skip}")
        if code != 0:
            return {"commits": []}
        commits = []
        for rec in out.split(EOR):
            rec = rec.strip("\n")
            if not rec:
                continue
            h, short, parents, an, date, refs, subj = rec.split(SEP, 6)
            commits.append({
                "hash": h, "short": short,
                "parents": parents.split() if parents else [],
                "author": an, "date": date,
                "refs": [r.strip() for r in refs.split(",") if r.strip()],
                "subject": subj,
            })
        return {"commits": commits}
```

- [ ] **Step 4:** PASS. **Step 5:** `git commit -m "local: vaultfs — endpoint de grafo de commits"`

### Task 17: Frontend — branch/sync UI + init + amend já ligado

**Files:** Modify: `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):** barra de branch no topo do strip git: nome da branch (dropdown: branches locais + "＋ nova branch…"), `⇅` com `ahead↑ behind↓`, botões push/pull/fetch com spinner; case `init` do delegated handler liga em `gitOp('init', {})`.

- [ ] **Step 1: implementação** — `renderGit()` ganha, antes de MUDANÇAS:

```javascript
  const syncLabel = `${g.ahead ? g.ahead + '↑' : ''}${g.behind ? ' ' + g.behind + '↓' : ''}`.trim();
  const branchBar = `
    <div class="vaults-branch-row">
      <span class="vaults-branch" data-git="branches" title="Trocar de branch">⎇ ${esc(g.branch || '?')}</span>
      <span class="vaults-sync">${syncLabel}</span>
      <button class="vaults-row-btn" data-git="pull" title="Pull (ff-only)">⇣</button>
      <button class="vaults-row-btn" data-git="push" title="Push">⇡</button>
      <button class="vaults-row-btn" data-git="fetch" title="Fetch">↺</button>
    </div>`;
```

Handler `branches`: GET `/git/branches` → menu simples (reusar padrão `.dropdown` do app: div posicionada com itens; item por branch → `gitOp('checkout', {branch})`; último item "＋ nova branch…" → `styledPrompt` → `gitOp('checkout', {branch, create: true})`). Handlers `push/pull/fetch`: desabilitar botão, `gitOp(route, {})`, `showToast(r.output || 'ok')`, re-habilitar. Handler `init`: `gitOp('init', {})`.
- [ ] **Step 2: verificação manual** na pleitost: trocar branch (working tree limpo), criar branch de teste, fetch; push/pull testados na Task 19 com token. Na OP Vault: "Inicializar repositório" cria `.git` e o strip aparece.
- [ ] **Step 3:** `git commit -m "local: vaults — UI de branches, sync e git init"`

### Task 18: Frontend — grafo de commits (vaultsGraph.js)

**Files:** Create: `static/js/vaultsGraph.js` · Modify: `static/js/vaults.js`, `static/style.css`

**Interfaces:**
- Produces: `renderCommitGraph(container, commits, onSelect)` — desenha SVG com lanes; `commits` = payload do `/git/graph`; `onSelect(hash)` no clique
- Consumes (vaults.js): case `graph` → `openGraph()` que busca `/git/graph` e chama `renderCommitGraph(els.viewer, commits, openCommit)`

- [ ] **Step 1: implementação do layout de lanes** (`static/js/vaultsGraph.js`):

```javascript
// static/js/vaultsGraph.js — grafo de commits em SVG (fork-local)
// Algoritmo de lanes: varre commits em ordem topológica (git --topo-order).
// `lanes` = array de hashes esperados; um commit toma a lane que o espera
// (ou abre nova), seus parents herdam/abrem lanes.
const COLORS = ['#61afef', '#98c379', '#e5c07b', '#e06c75', '#c678dd', '#56b6c2', '#d19a66'];
const ROW_H = 26, LANE_W = 14, R = 4, PAD = 8;

export function layoutGraph(commits) {
  const lanes = [];            // lane idx -> hash esperado
  const rows = [];
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    let lane = lanes.indexOf(c.hash);
    if (lane === -1) { lane = lanes.indexOf(null); if (lane === -1) lane = lanes.length; }
    // lanes que esperavam este commit (merges apontando pra ele) colapsam
    const mergedFrom = [];
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] === c.hash && l !== lane) { mergedFrom.push(l); lanes[l] = null; }
    }
    // o primeiro parent herda a lane; parents extras abrem lanes novas
    lanes[lane] = c.parents[0] || null;
    const forkTo = [];
    for (let p = 1; p < c.parents.length; p++) {
      let nl = lanes.indexOf(c.parents[p]);
      if (nl === -1) { nl = lanes.indexOf(null); if (nl === -1) nl = lanes.length; lanes[nl] = c.parents[p]; }
      forkTo.push(nl);
    }
    rows.push({ commit: c, lane, mergedFrom, forkTo, lanesSnapshot: lanes.slice() });
  }
  return { rows, laneCount: Math.max(1, ...rows.map(r => r.lanesSnapshot.length)) };
}

export function renderCommitGraph(container, commits, onSelect) {
  const { rows, laneCount } = layoutGraph(commits);
  const gw = PAD * 2 + laneCount * LANE_W;
  const h = rows.length * ROW_H;
  const cx = l => PAD + l * LANE_W + LANE_W / 2;
  const cy = i => i * ROW_H + ROW_H / 2;
  const color = l => COLORS[l % COLORS.length];
  const hashRow = new Map(rows.map((r, i) => [r.commit.hash, i]));
  let paths = '', dots = '';
  rows.forEach((r, i) => {
    // linha até o primeiro parent
    const p0 = r.commit.parents[0];
    if (p0 && hashRow.has(p0)) {
      const j = hashRow.get(p0);
      const jl = rows[j].lane;
      paths += r.lane === jl
        ? `<line x1="${cx(r.lane)}" y1="${cy(i)}" x2="${cx(jl)}" y2="${cy(j)}" stroke="${color(r.lane)}"/>`
        : `<path d="M${cx(r.lane)},${cy(i)} C${cx(r.lane)},${cy(i) + ROW_H} ${cx(jl)},${cy(j) - ROW_H} ${cx(jl)},${cy(j)}" stroke="${color(jl)}" fill="none"/>`;
    }
    // merges extras
    for (let p = 1; p < r.commit.parents.length; p++) {
      const pj = hashRow.get(r.commit.parents[p]);
      if (pj !== undefined) {
        const jl = rows[pj].lane;
        paths += `<path d="M${cx(r.lane)},${cy(i)} C${cx(r.lane)},${cy(i) + ROW_H} ${cx(jl)},${cy(pj) - ROW_H} ${cx(jl)},${cy(pj)}" stroke="${color(jl)}" fill="none"/>`;
      }
    }
    dots += `<circle cx="${cx(r.lane)}" cy="${cy(i)}" r="${R}" fill="${color(r.lane)}"/>`;
  });
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  container.innerHTML = `
    <div class="vaults-graph">
      <svg width="${gw}" height="${h}" class="vaults-graph-svg">
        <g stroke-width="2">${paths}</g>${dots}
      </svg>
      <div class="vaults-graph-rows">
        ${rows.map(r => `
          <div class="vaults-graph-row" data-hash="${r.commit.hash}" style="height:${ROW_H}px">
            <span class="vaults-log-hash">${r.commit.short}</span>
            ${r.commit.refs.map(x => `<span class="vaults-ref">${esc(x)}</span>`).join('')}
            <span class="vaults-log-subj">${esc(r.commit.subject)}</span>
            <span class="vaults-graph-meta">${esc(r.commit.author)} · ${new Date(r.commit.date).toLocaleDateString()}</span>
          </div>`).join('')}
      </div>
    </div>`;
  container.querySelectorAll('.vaults-graph-row').forEach(el =>
    el.addEventListener('click', () => onSelect(el.dataset.hash)));
}
```

Em `vaults.js`: `import { renderCommitGraph } from './vaultsGraph.js';` + `openGraph()` (busca `/git/graph?limit=200`, `state.mode='graph'`, viewbar com botão "mais commits" que refaz com `limit` maior) ligado no case `graph`. CSS: `.vaults-graph { display:flex; overflow:auto; } .vaults-graph-svg { flex-shrink:0; } .vaults-graph-rows { flex:1; min-width:0; } .vaults-graph-row { display:flex; align-items:center; gap:8px; padding:0 8px; cursor:pointer; font-size:12.5px; border-radius:4px; } .vaults-graph-row:hover { background: color-mix(in srgb, var(--accent-primary,#60a5fa) 10%, transparent); } .vaults-ref { font-size:10px; padding:0 6px; border-radius:8px; border:1px solid color-mix(in srgb, var(--accent-primary,#60a5fa) 50%, transparent); color:var(--accent-primary,#60a5fa); white-space:nowrap; } .vaults-graph-meta { margin-left:auto; opacity:0.5; font-size:11px; white-space:nowrap; }`
- [ ] **Step 2: verificação manual** na pleitost (várias branches): grafo desenha lanes/merges coerentes, refs aparecem, clique abre diff do commit.
- [ ] **Step 3:** `git commit -m "local: vaults — grafo de commits SVG com lanes"`

### Task 19: Deploy — envs no overlay + LOCAL_CHANGES.md + checklist final

**Files:** Modify: `docker/pereiraoc.yml`, `LOCAL_CHANGES.md`

- [ ] **Step 1:** adicionar em `docker/pereiraoc.yml` → `services.odysseus.environment`:

```yaml
      # Painel de Vaults — identidade git dos commits feitos pela UI e
      # credencial de push/pull https (token NUNCA vai pra disco/argv).
      - GIT_AUTHOR_NAME=pereiraoc
      - GIT_AUTHOR_EMAIL=pereiraoc@gmail.com
      - GIT_COMMITTER_NAME=pereiraoc
      - GIT_COMMITTER_EMAIL=pereiraoc@gmail.com
      # - VAULTFS_GIT_TOKEN=ghp_...   ← preencher no host (ou via .env)
      # - VAULTFS_GIT_USER=sfynz
```

- [ ] **Step 2:** documentar o delta no `LOCAL_CHANGES.md` (arquivos novos: rotas, 2 módulos JS, 2 arquivos de teste; edições: index.html, app.py, style.css, overlay; receita de rebase inalterada — edições upstream são 3 blocos pequenos).
- [ ] **Step 3: checklist manual completa** (dentro do container com as envs):
  1. Sidebar mostra seção Vaults com OP Vault e pleitost.
  2. pleitost: árvore + badges de mudanças reais; abrir nota com wikilinks e imagem; navegar por wikilink; editar + Ctrl+S; conflito 409 simulado (editar no host).
  3. Git: stage/unstage/discard; commit em branch de teste; undo; diff working + commit; trocar/criar branch; fetch; push com token configurado; grafo com as branches reais.
  4. OP Vault: "Inicializar repositório" → strip git aparece.
  5. Minimizar painel → chip "Vaults"; restaurar volta dockado; fechar limpa dock; redimensionar pela alça persiste largura.
- [ ] **Step 4:** `pytest tests/test_vaultfs_routes.py tests/test_vaultfs_git.py -q` final + `git commit -m "local: vaults — envs de deploy e inventário no LOCAL_CHANGES"`

---

## Self-review (feita na escrita)

- **Cobertura da spec:** entrada sidebar (T5), painel dockado 1-vault (T5), árvore + dotfiles ocultos (T6), viewer/editor + wikilinks + imagens + criar nota pendente (T7), Ctrl+S + 409 (T8), CRUD UI (T9), status/badges/stage/commit/amend/undo (T10-12), diff arquivo+commit (T11/13), lista de commits (T13), branches/checkout/create (T14/17), push/pull/fetch + credencial env (T15/19), init (T14/17), grafo (T16/18), erros git na íntegra (T12 `showError`), deploy/envs/LOCAL_CHANGES (T19).
- **Sem placeholders:** único stub temporário é o botão de grafo na T13 (ligado na T18) e init na T12 (ligado na T17) — ambos entregues dentro do plano.
- **Consistência de nomes:** `_git/_git_ok/_require_repo/_resolve/_reject_git/_vault_root/_list_vaults`; JS `api/gitOp/refreshTree/refreshGit/openFile/openDiff/openCommit/renderViewer/renderGit/applyTreeBadges/resolveNote/preprocessMd/rawUrl` — conferidos entre tasks.
