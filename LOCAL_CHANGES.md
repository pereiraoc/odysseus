# Local changes — fork `pereiraoc/odysseus` vs upstream

Inventário dos deltas deste fork sobre o upstream (`pewdiepie-archdaemon/odysseus`).
Mantidos **segregados** pra facilitar integrar updates do Odysseus depois.

- `dev` = espelho LIMPO do upstream (rastreia `origin/dev`).
- `pereiraoc` = `dev` + os deltas abaixo (branch que a gente roda/checkout).
- Sincronizar upstream:
  `git switch dev && git pull && git switch pereiraoc && git rebase dev`
  (conflito possível só no item 1, que é inline; os demais são aditivos).

## 1. `routes/shell_routes.py` — admin com `AUTH_ENABLED=false`  [inline patch]
`_require_admin` retorna cedo quando `AUTH_ENABLED=false`, espelhando
`core/middleware.require_admin`. Sem isso, os endpoints admin do Cookbook
(packages/install/serve) dão **403** em modo single-user/no-auth: `app.state.
auth_manager` é criado incondicionalmente (`app.py:196`) e o middleware de auth
só sobe com `AUTH_ENABLED=true` (`app.py:202`), então `current_user` fica `None`.
→ **Único delta inline em arquivo do upstream.** DROPAR este commit se o upstream
passar a tratar `AUTH_ENABLED=false` aqui (confirmado ainda necessário em 97a7f59).

## 2. `docker/pereiraoc.yml` — overlay de deploy local  [arquivo novo, aditivo]
Não toca nenhum arquivo do upstream. Adiciona ao serviço `odysseus`:
- **Mount dos vaults do Obsidian** `/data/vaults:/app/vaults` (rw) → o agente lê/
  escreve os vaults.
- **`LD_LIBRARY_PATH`** das libs CUDA das wheels nvidia em `~/.local` (movido pra cá
  do `docker/gpu.nvidia.yml`, que voltou a ser pristine).

Ativar no `.env` (gitignored, NÃO comitado):
`COMPOSE_FILE=docker-compose.yml:docker/gpu.nvidia.yml:docker/pereiraoc.yml`

## 3. `data/settings.json` — `tool_path_extra_roots`  [runtime, gitignored]
`"tool_path_extra_roots": ["/app/vaults/OP Vault"]` → o *second brain* fica sempre
acessível às file-tools do agente. Projetos (pleitost, RPG) entram por conversa via
o **Workspace picker**. Setável pelo chat (`manage_settings`) ou editando o arquivo.

## 4. `Dockerfile` — pin Python em 3.12  [inline patch]
Upstream usa `FROM python:3.14-slim`; trocado por `ARG PYTHON_VERSION=3.12` +
`FROM python:${PYTHON_VERSION}-slim`. Motivo: **não há wheel CUDA do
llama-cpp-python pra cp314** → no 3.14 o Cookbook só serve em CPU. No 3.12 (que o
upstream suporta, "Python 3.11+") o serving na GPU volta a funcionar **dentro do
Cookbook**, reaproveitando os engines CUDA já instalados em `./data/local`
(python3.12) e o `LD_LIBRARY_PATH` do item 2. Override pontual de volta:
`docker compose build --build-arg PYTHON_VERSION=3.14`. Segundo delta inline no
upstream; conflito de rebase só se o upstream mexer na linha do `FROM`.
