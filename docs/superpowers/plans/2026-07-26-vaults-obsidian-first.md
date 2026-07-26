# Vaults Obsidian-first + File Browser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vault = sessão própria do Obsidian oficial (container dinâmico por vault, multi-vault); painel custom vira tool "Files" (Browser|Git) com raízes configuráveis, favoritos, preview universal e árvore lazy.

**Architecture:** Backend estende `routes/vaultfs_routes.py`: união de raízes (`tool_path_extra_roots` ∪ `file_browser_roots`), tree lazy por `depth/path`, e gerência de containers `odysseus-obsidian-<id>` via docker API (socket já montado; binds traduzidos por `VAULTFS_HOST_MAP`). Frontend: `vaults.js` — seção Vaults só-Obsidian (modal iframe por vault) e painel renomeado `files-panel` acionado por Tools.

**Tech Stack:** FastAPI + pytest; vanilla JS; docker Engine API via unix socket; highlight.js (já carregado).

**Spec:** `docs/superpowers/specs/2026-07-26-vaults-obsidian-first-design.md`

## Global Constraints

- Fork-local: arquivos novos preferidos; únicos upstream tocados: `static/index.html` (item `tool-files-btn` no bloco já nosso), `static/style.css` (append), demais já patchados.
- Rotas com `Depends(require_user)`; confinamento de caminho como hoje.
- Containers: só nomes `odysseus-obsidian-<vault-id>` com id validado na lista de vaults.
- Commits `local:`; testes: `./venv/bin/python -m pytest tests/test_vaultfs_routes.py -q` + `node tests/vaults_dataview_spec.mjs` + `node --check` nos js.

---

### Task 1: Backend — união de raízes + PUT /roots

**Files:** Modify `routes/vaultfs_routes.py` · Test `tests/test_vaultfs_routes.py`

**Interfaces (Produces):**
- `_list_vaults()` → entradas ganham `"is_vault": bool`; união dedup por realpath (vault vence), slugs com sufixo em colisão como hoje.
- `GET /vaults` → inclui `is_vault`.
- `PUT /roots` body `{roots: [str]}` → grava `file_browser_roots` via `set_setting`; retorna `{ok, vaults: _list_vaults()}`. (Verificar nome real do setter: `grep -n "def set_setting\|def save_setting" src/settings.py` — usar o que existir.)

- [ ] Teste: fixture com `get_setting` devolvendo extra root além da vault; asserts: união listada, `is_vault` correto, dedup quando mesma pasta nas duas listas, `PUT /roots` grava (monkeypatch setter capturando args).
- [ ] Implementar; rodar; commit `local: files — raízes configuráveis (file_browser_roots ∪ vaults) + PUT /roots`.

### Task 2: Backend — tree lazy

**Files:** Modify `routes/vaultfs_routes.py` · Test `tests/test_vaultfs_routes.py`

**Interfaces (Produces):** `GET /tree?vault=&path=&depth=` — `path` (subárvore, default raiz), `depth` int (0/absent = completo como hoje). Com `depth=N`, nós de dir no nível N têm `"children": null` e `"has_children": bool`. Compat: chamadas atuais inalteradas.

```python
def _build_tree(abs_dir, rel_prefix, depth=0, level=1):
    ...
    if e.is_dir(follow_symlinks=False):
        if depth and level >= depth:
            entries.append({"name": e.name, "path": rel, "type": "dir",
                            "children": None,
                            "has_children": _dir_has_visible_children(e.path)})
        else:
            entries.append({..., "children": _build_tree(e.path, rel, depth, level + 1)})
```

- [ ] Teste: `depth=1` na raiz → dir com `children None` + `has_children True`; `path=Sistema&depth=1` → filhos de Sistema; sem depth → comportamento atual (testes existentes seguem verdes).
- [ ] Implementar (+`_resolve` do `path` com `allow_root=True`); commit `local: files — árvore lazy (path/depth) p/ raízes grandes`.

### Task 3: Backend — docker API c/ body + host map + spec de sessão

**Files:** Modify `routes/vaultfs_routes.py` · Test `tests/test_vaultfs_routes.py`

**Interfaces (Produces):**
- `_docker_api(method, endpoint, body: dict|None = None)` — serializa JSON + Content-Type.
- `_host_path(container_path) -> str` — traduz via env `VAULTFS_HOST_MAP`
  (`/app/vaults=/data/vaults,/app/vaults/pleitost-app=/data/projects/pleitost-app,...`),
  longest-prefix; sem match → `HTTPException(501, mensagem citando a env)`.
- `_session_name(vid) = f"odysseus-obsidian-{vid}"`
- `_session_spec(name, vault_name, host_vault_dir, host_config_dir, port) -> dict` — payload puro do `POST /containers/create`:

```python
def _session_spec(name, vault_name, host_vault_dir, host_config_dir, port):
    return {
        "Image": OBSIDIAN_IMAGE,  # env OBSIDIAN_IMAGE, default lscr.io/linuxserver/obsidian:latest
        "Env": ["PUID=1000", "PGID=1000", "TZ=America/Sao_Paulo"],
        "ExposedPorts": {"3000/tcp": {}},
        "Labels": {"odysseus.vault-session": "1"},
        "HostConfig": {
            "Binds": [f"{host_config_dir}:/config",
                      f"{host_vault_dir}:/vaults/{vault_name}"],
            "PortBindings": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]},
            "SecurityOpt": ["seccomp:unconfined"],
            "ShmSize": 1 << 30,
            "RestartPolicy": {"Name": "unless-stopped"},
        },
    }
```

- [ ] Testes puros: `_host_path` (prefixo exato, mais longo vence, sem match → 501), `_session_spec` (binds/porta/shm), `_session_name`.
- [ ] Implementar; commit `local: vaults — infra de sessões (docker body, host map, spec builder)`.

### Task 4: Backend — endpoints de sessão por vault

**Files:** Modify `routes/vaultfs_routes.py` · Test `tests/test_vaultfs_routes.py`

**Interfaces (Produces):**
- `GET /obsidian-sync` → `{available, sessions: [{id, name, mounted, exists, running, port, ui_url}]}` (`mounted` = tem tradução no host map e vault existe). Sem socket → `available: false`.
- `POST /obsidian-open {vault}` → garante config semeado (`data/obsidian-sessions/<id>/.config/obsidian/obsidian.json` com `{path: f"/vaults/{name}", open: true}` — só cria se ausente), container criado (spec Task 3, porta = existente ou próxima livre ≥3010 entre sessões), started. → `{ok, ui_url, started: bool}`.
- `POST /obsidian-sync {vault, enable}` → start/stop da sessão (enable com container ausente = mesmo caminho do open, sem retornar iframe).
- Remoção: rota antiga de container global e `_register_vault_open`/`SYNC_CONTAINER` global (código morto sai).
- Portas: `_session_port(vid)` lê do inspect (`HostConfig.PortBindings`); `_next_free_port()` = 3010.. varrendo sessões existentes (GET /containers/json?all=1, nomes com prefixo).

- [ ] Testes com `_docker_api` monkeypatchado (dict de respostas): GET status shape; open cria (captura create payload → valida nome/porta/binds) e semeia obsidian.json no tmp (env `OBSIDIAN_SESSIONS_DIR`); open com vault desconhecida → 404; sem host map → 501. Ajustar os 2 testes antigos de sync pro shape novo.
- [ ] Implementar; commit `local: vaults — sessões Obsidian por vault (create/start/stop dinâmicos)`.

### Task 5: Backend — meta com assets + ignore list

**Files:** Modify `routes/vaultfs_routes.py` · Test `tests/test_vaultfs_routes.py`

**Interfaces (Produces):** `GET /meta` → adiciona `"assets": [{name, path}]` (arquivos não-md, não-dot); walk (meta E tree lazy NÃO) ignora dirs `{node_modules, __pycache__, venv, .venv, dist, build, target}` além de dots — raízes de código não explodem o índice do Dataview.

- [ ] Teste: asset listado; node_modules ignorado no meta.
- [ ] Implementar; commit `local: files — meta com assets e ignore de dirs pesados`.

### Task 6: Overlay + migração de deploy

**Files:** Modify `docker/pereiraoc.yml`, `LOCAL_CHANGES.md`

- [ ] Overlay: remover serviço `obsidian` e envs `OBSIDIAN_SYNC_CONTAINER/UI_URL`; adicionar `VAULTFS_HOST_MAP=...` (4 entradas + `/app/data=/data/projects/odysseus/data`), `OBSIDIAN_SESSIONS_DIR=/app/data/obsidian-sessions`, `OBSIDIAN_SESSIONS_HOST_DIR=/data/projects/odysseus/data/obsidian-sessions`, `CSP_EXTRA_FRAME_SRC=http://localhost:3010 … :3019` (10 portas explícitas).
- [ ] Migração (shell, deploy): `docker rm -f odysseus-obsidian`; `mkdir -p data/obsidian-sessions && mv data/obsidian-config data/obsidian-sessions/op-vault` (preserva login+sync da OP Vault; obsidian.json interno já aponta `/vaults/OP Vault`).
- [ ] LOCAL_CHANGES: reescrever blocos de Obsidian embutido/sync pro modelo por-sessão + Files. Commit `local: vaults — overlay p/ sessões dinâmicas + migração da sessão OP Vault`.

### Task 7: Frontend — Vaults só-Obsidian

**Files:** Modify `static/js/vaults.js`

**Interfaces (Produces):**
- `initSidebar`: só `is_vault`; item = dot (`.vaults-dot`, verde se running) + nome + nuvem hover (toggle sessão). Clique → `openVaultObsidian(v)`.
- `openVaultObsidian(v)`: `POST /obsidian-open` → `ensureObsidianModal(v, ui_url, started)` — modal por vault `vaults-obsidian-${v.id}` (title = nome, gem icon, registrado no manager, dockável, iframe; `started` → blank + reload após 4s; botão reload no header; nuvem no header = toggle da própria sessão).
- `refreshSessions()`: GET /obsidian-sync → dots + estados (chamado no init e após toggles).
- Sai: `openVault` (painel por vault), `openObsidianApp/openVaultInObsidian/buildObsidianModal` antigos, `refreshSyncStatus/onSyncClick` globais (viram por-sessão).

- [ ] Implementar + CSS (dots, nuvem no item); `node --check`; commit `local: vaults — seção vira launcher de sessões Obsidian`.

### Task 8: Frontend — Files tool (painel migrado)

**Files:** Modify `static/js/vaults.js`, `static/index.html` (item Files no tools-section), `static/style.css`

**Interfaces (Produces):**
- `#tool-files-btn` (ícone pasta) → `openFiles()` — painel atual renomeado `files-panel`, título = raiz atual, abas **Browser|Git** (pane/загрузка de Tasks removidos da UI).
- Seletor de raiz na toolbar (`<select>` com todas as raízes) + botões ＋pasta (styledPrompt caminho absoluto → PUT /roots) e − (remove raiz não-vault selecionada).
- Estado: `state.currentId` = raiz selecionada (persistida `odysseus-files-root`).
- Árvore lazy: `refreshTree()` busca `depth=1`; expandir dir sem children carregados → fetch `tree?path=<dir>&depth=1` e insere; `has_children` controla caret. `noteIndex`/`findAsset` passam a vir do META (`ensureMeta` popula `state.noteIndex` de notes + `state.assets`), não da árvore.
- [ ] Implementar; commit `local: files — tool File Browser (raízes, abas Browser|Git, árvore lazy)`.

### Task 9: Frontend — favoritos

**Files:** Modify `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):** estrela em `attachRowActions` (toggle) + barra `renderFavs()` acima da árvore; storage `odysseus-files-favs` = `[{root, path, type, name}]`; clique: dir → navega/expande, arquivo → `openFile`; raiz diferente → troca o select antes.

- [ ] Implementar; commit `local: files — favoritos`.

### Task 10: Frontend — preview universal

**Files:** Modify `static/js/vaults.js`, `static/style.css`

**Interfaces (Produces):** `openFile` despacha por extensão:
- md/base → como hoje; imagem → como hoje;
- pdf → `<embed class="files-pdf" src="${rawUrl(p)}" type="application/pdf">` (altura 100%);
- áudio `mp3|ogg|wav|m4a|flac` → `<audio controls src=raw>`; vídeo `mp4|webm|mov|mkv` → `<video controls src=raw>`;
- resto → tenta `/file`; texto → `<pre><code>` + `window.hljs?.highlightElement(codeEl)` (modo Editar continua); binário (400) → nome+tamanho+link download (`rawUrl` com atributo `download`).

- [ ] Implementar; `node tests/vaults_dataview_spec.mjs` segue OK; commit `local: files — preview universal (pdf, mídia, código c/ highlight, download)`.

### Task 11: Deploy + verificação + push

- [ ] `pytest` full dos 2 arquivos + spec node + `node --check`; rebuild odysseus; `up -d`; executar migração (Task 6 shell); e2e playwright no app real: (a) clicar OP Vault e pleitost → 2 modais, iframes em portas distintas, sessão OP Vault preservada (login); (b) Files: raiz /data/projects adicionada, lazy expand, favorito persiste, abrir .py (highlight), .pdf (embed), imagem; (c) git tab funciona na raiz pleitost.
- [ ] Screenshots pro usuário; push.

## Self-review

Cobertura da spec ✓ (sessões/portas/migração T3-4-6; Files/raízes/favoritos/preview/lazy T1-2-5-7-10; Tasks fora da UI T8; erros: 501 host map, allowlist nome, 404 vault). Sem placeholders; nomes consistentes (`_session_spec/_host_path/openVaultObsidian/ensureObsidianModal/refreshSessions/openFiles`).
