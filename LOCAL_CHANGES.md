# Local changes — fork `pereiraoc/odysseus` vs upstream

Inventário dos deltas deste fork sobre o upstream (`pewdiepie-archdaemon/odysseus`).
Mantidos **segregados** pra facilitar integrar updates do Odysseus depois.

- `dev` = espelho LIMPO do upstream (rastreia `origin/dev`).
- `pereiraoc` = `dev` + os deltas abaixo (branch que a gente roda/checkout).
- Sincronizar upstream (o upstream **força-pusha** a `dev` — rebase cego NÃO serve):
  `git fetch upstream && git branch -f dev upstream/dev`, depois validar num worktree
  dry-run (`git worktree add --detach /tmp/ody-dryrun upstream/dev` + cherry-pick dos
  deltas) e só então apontar `pereiraoc` pro resultado. Push com `--force-with-lease`.
  (Conflito esperado nos itens 1 e 4, que são inline; os demais são aditivos.)

## 1. `routes/shell_routes.py` — admin com `AUTH_ENABLED=false`  [inline patch]
`_require_admin` retorna cedo quando `AUTH_ENABLED=false`, espelhando
`core/middleware.require_admin`. Sem isso, os endpoints admin do Cookbook
(packages/install/serve) dão **403** em modo single-user/no-auth: `app.state.
auth_manager` é criado incondicionalmente (`app.py:249-250`) e o middleware de auth
só sobe com `AUTH_ENABLED=true` (`app.py:256`), então `current_user` fica `None`
(o `if not auth_manager` do upstream nunca dispara). DROPAR este commit se o
upstream passar a tratar `AUTH_ENABLED=false` aqui (confirmado ainda necessário
em d8a2059, sync de 2026-07-25).

## 2. `docker/pereiraoc.yml` — overlay de deploy local  [arquivo novo, aditivo]
Não toca nenhum arquivo do upstream. Adiciona ao serviço `odysseus`:
- **Mount dos vaults do Obsidian** `/data/vaults:/app/vaults` (rw) → o agente lê/
  escreve os vaults.
- **`LD_LIBRARY_PATH`** das libs CUDA das wheels nvidia em `~/.local` (movido pra cá
  do `docker/gpu.nvidia.yml`, que voltou a ser pristine).

Ativar no `.env` (gitignored, NÃO comitado):
`COMPOSE_FILE=docker-compose.yml:docker/gpu.nvidia.yml:docker/pereiraoc.yml`

## 3. `data/settings.json` — `tool_path_extra_roots`  [runtime, gitignored]
`"tool_path_extra_roots"` lista as vaults acessíveis às file-tools do agente **e ao
painel de Vaults** (item 5): `OP Vault`, `pleitost`, `pleitost-app` e
`caelestia-arch-setup` (os dois últimos montados pelo overlay do item 2, de
`/data/projects/*`). Setável pelo chat (`manage_settings`) ou editando o arquivo.

## 4. `Dockerfile` — pin Python em 3.12  [inline patch]
Upstream usa `FROM python:3.14-slim`; trocado por `ARG PYTHON_VERSION=3.12` +
`FROM python:${PYTHON_VERSION}-slim`. Motivo: **não há wheel CUDA do
llama-cpp-python pra cp314** → no 3.14 o Cookbook só serve em CPU. No 3.12 (que o
upstream suporta, "Python 3.11+") o serving na GPU volta a funcionar **dentro do
Cookbook**, reaproveitando os engines CUDA já instalados em `./data/local`
(python3.12) e o `LD_LIBRARY_PATH` do item 2. Override pontual de volta:
`docker compose build --build-arg PYTHON_VERSION=3.14`. Segundo delta inline no
upstream; conflita quando o upstream mexe nos `FROM` (aconteceu no sync de
2026-07-25: Dockerfile virou 2 estágios — `realesrgan-wheels` + main — e o `ARG`
global no topo agora parametriza os dois).

## 5. Painel de Vaults — browse/edição markdown + git na UI  [feature local]
Espaço dedicado na UI pras vaults do `tool_path_extra_roots` (item 3): browse em
painel dockado à direita, viewer/editor de markdown com wikilinks Obsidian, CRUD
de arquivos e git estilo VS Code (status/badges, stage/commit/amend/undo, diff,
branches, push/pull/fetch, `git init`, lista + grafo de commits). Spec/plano em
`docs/superpowers/specs/2026-07-25-vaults-panel-design.md` e
`docs/superpowers/plans/2026-07-25-vaults-panel.md`.

**Arquivos novos (aditivos, nunca conflitam):** `routes/vaultfs_routes.py`,
`static/js/vaults.js`, `static/js/vaultsGraph.js`, `static/js/vaultsDataview.js` (engine DQL validado contra as 378 queries reais das vaults), `tests/test_vaultfs_routes.py`, `tests/vaults_dataview_spec.mjs`,
`tests/test_vaultfs_git.py`, specs/planos em `docs/superpowers/`.

**Edições em arquivos do upstream (4 blocos pequenos, conflito improvável):**
- `static/index.html`: seção `#vaults-section` no sidebar (após Tools) +
  `<script type="module" src="/static/js/vaults.js">` no bloco de módulos.
- `app.py`: registro `setup_vaultfs_routes()` logo após o `vault_routes` (~L855).
- `static/style.css`: bloco `.vaults-*` append-only no final.
- `core/middleware.py`: `frame-src 'self'` ganha extensão opcional via env
  `CSP_EXTRA_FRAME_SRC` (vazio = upstream intacto) — permite iframar o
  KasmVNC do Obsidian (localhost:3010) no modal embutido do painel.

**Obsidian por sessão (modelo atual):** cada vault tem SEU container do
Obsidian oficial (`odysseus-obsidian-<vault-id>`, lscr.io/linuxserver/obsidian),
criado dinamicamente pelo backend via docker API na primeira abertura — clique
na vault do sidebar abre a sessão daquela vault num modal iframe (KasmVNC,
portas 3010-3019, liberadas no CSP). Multi-vault lado a lado; sync/plugins são
configurados DENTRO do Obsidian de cada sessão (login 1x por vault; config
persiste em `data/obsidian-sessions/<id>/` — a sessão da OP Vault herdou o
config antigo de `data/obsidian-config/`, migrado em 2026-07-26). Dot verde no
item = sessão rodando; nuvem liga/desliga (container parado não gasta RAM).
Binds traduzidos container→host pela env `VAULTFS_HOST_MAP`. Rotas:
`GET/POST /api/vaultfs/obsidian-sync` (status/toggle por vault) e
`POST /api/vaultfs/obsidian-open`.

**Tool "Files" (File Browser, em Tools):** o painel custom (Browser|Git) migrou
pra `#tool-files-btn`, generalizado pra raízes configuráveis
(`file_browser_roots` ∪ vaults; `PUT /api/vaultfs/roots` pela UI). Árvore lazy
(`/tree?path=&depth=`), favoritos (localStorage), preview universal: md
(wikilinks+Dataview/bases), código com highlight.js, imagem, PDF embed,
áudio/vídeo, binário com download. Aba Tasks removida da UI (rotas `/tasks*`
continuam pro agente); tarefas vivem no Obsidian.

**Envs no overlay (item 2):** `GIT_AUTHOR_*`/`GIT_COMMITTER_*` (identidade dos
commits feitos pela UI dentro do container) e `VAULTFS_GIT_USER` +
`VAULTFS_GIT_TOKEN` (push/pull https; token preenchido via `.env`, nunca comitado).

**Backups de segurança (2026-07-25):** tarballs pré-sync das duas vaults e a
cópia parcial do episódio da conexão aninhada (`/vaults/X/X`) vivem em
`/data/vaults-backups/` — nada foi deletado.
