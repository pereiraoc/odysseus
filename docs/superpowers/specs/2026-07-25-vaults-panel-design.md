# Painel de Vaults — browse, edição de markdown e git

**Data:** 2026-07-25 · **Autor:** pereiraoc + Claude · **Status:** aprovado (design), aguardando plano

Feature **local do fork** (não-upstream). Segue a política do `LOCAL_CHANGES.md`: máximo de
código em **arquivos novos** (nunca conflitam no rebase com `dev`); edições em arquivos
rastreados do upstream (`index.html`, `app.py`, `style.css`) restritas a pontos de
integração mínimos e registradas no `LOCAL_CHANGES.md`.

## Objetivo

Um espaço dedicado no Odysseus para navegar, visualizar e editar as vaults (Obsidian)
já acessíveis ao agente, com integração git estilo VS Code: ver o que não está
commitado direto no browse, manipular stage/commit/branches/push-pull, e visualizar
histórico em lista e em grafo.

## Decisões tomadas (com o usuário)

| Decisão | Escolha |
|---|---|
| Fonte da lista de vaults | `tool_path_extra_roots` do `data/settings.json` (reuso, zero config nova) |
| Escopo de arquivos | Gerenciamento completo: ler, editar, criar, renomear, apagar |
| Wikilinks Obsidian | `[[Nota]]` renderiza como link e navega; `![[img]]` renderiza imagem |
| Entrada na UI | Seção própria **"Vaults"** no sidebar (grupo irmão de Tools, **não** item dentro de Tools) |
| Painel | Dockado à borda direita (infra existente de dock), mostrando **uma vault por vez**, nome da vault como título fixo (não colapsável) |
| Git v1 | Stage/unstage, commit (+amend), discard, undo último commit (reset soft), checkout/criar branch, push/pull/fetch, `git init` |
| Histórico | Lista de commits recentes no strip inferior **e** grafo completo com linhas de branch (abre no espaço do viewer) |
| Vault sem `.git` (caso OP Vault) | Botão "Inicializar repositório" |
| Fora da v1 | Merge, rebase, histórico de versões próprio (padrão `DocumentVersion` fica como evolução futura) |

## Estado atual relevante

- Vaults montadas via `docker/pereiraoc.yml`: `/data/vaults:/app/vaults` (rw).
  Hoje: `OP Vault` (sem git) e `pleitost` (repo git, várias branches, remote
  `https://github.com/sfynz/pleitost.git`).
- Identidade git (`pereiraoc / pereiraoc@gmail.com`) vem do gitconfig **global do host**
  — não existe dentro do container. Credential helper: nenhum.
- Frontend: vanilla JS, módulos ES em `static/js/*` carregados por `<script type="module">`
  no fim do `index.html`. Sem framework, sem npm.
- Infra reutilizável: `modalManager.js` (ciclo de vida de modais/tools),
  `modalSnap.js` (dock à borda direita, usado pelo split de email), `markdown.js`
  (`mdToHtml()` custom, usado no chat e no editor de documentos), `document.js`
  (padrão de editor textarea + preview).
- Backend: FastAPI; rotas em `routes/*.py` via factory `setup_x_routes()` →
  `app.include_router()` no `app.py`; auth `require_user`/`require_admin` de
  `src/auth_helpers.py` / `core/middleware.py`, honrando `AUTH_ENABLED=false`
  (modo single-user). Subprocess já é padrão do projeto (`shell_routes.py`).

## Arquitetura

### Componentes novos

| Unidade | Arquivo | Responsabilidade |
|---|---|---|
| Rotas de vault (arquivos + git) | `routes/vaultfs_routes.py` (novo) | API REST de listagem/CRUD de arquivos e operações git, validação de caminhos |
| Módulo do painel | `static/js/vaults.js` (novo) | Seção do sidebar, painel dockado, árvore, viewer/editor, wikilinks, UI de git |
| Grafo de commits | `static/js/vaultsGraph.js` (novo) | Layout de lanes + render SVG do grafo (isolado: recebe dados de `git log --parents`, devolve SVG) |
| Estilos | bloco novo no `style.css` (append) | Painel, árvore, badges git, diff, grafo |

### Pontos de integração (edições mínimas em arquivos upstream)

1. `static/index.html`: seção `#vaults-section` no sidebar + `<script type="module" src="/static/js/vaults.js">` no fim.
2. `app.py`: `from routes.vaultfs_routes import setup_vaultfs_routes` + `app.include_router(...)` junto dos demais.
3. `style.css`: bloco de estilos ao final (append-only).
4. `LOCAL_CHANGES.md` + `docker/pereiraoc.yml`: registrar delta e env vars de git.

O nome `vaultfs` evita colisão com `routes/vault_routes.py` (Bitwarden, já existente).

## UX / Frontend

### Sidebar (entrada)

Seção "Vaults" no sidebar esquerdo existente, mesmo padrão visual da seção Tools
(título com ícone + itens `.list-item`). Um item por vault, nome = basename da pasta.
Vault com caminho inexistente aparece desabilitada com tooltip. Clicar numa vault
abre/foca o painel já naquela vault; clicar em outra troca a vault exibida.

### Painel dockado à direita

Registrado no `modalManager` (minimiza/fecha como os outros tools) e aberto **já
dockado** à borda direita via infra do `modalSnap.js` (workspace reserva espaço via
`--right-dock-w`, redimensionável, desacoplável por arrastar). Split interno:

```
┌────────────┬──────────────────────┬───────────────────────────┐
│  sidebar   │   chat (visível)     │ ESPAÇO DO VIEWER │ NAV    │
└────────────┴──────────────────────┴───────────────────────────┘

NAV (coluna na borda direita):          ESPAÇO DO VIEWER (ao lado):
┌─ 🗄 pleitost ──────────────┐          - nota markdown (preview/edição)
│ [toolbar: ＋nota ＋pasta]   │          - imagem renderizada
│ ▾ Sistema/                 │          - diff de arquivo/commit
│   📄 Dante.md           M  │          - grafo completo de commits
│   📄 Mera.md            M  │
├─ MUDANÇAS (5) ─────────────┤
│ staged / modificados       │
│ [mensagem de commit……]     │
│ [✓ Commit] [☐ amend]       │
├─ main ⇅ 2↑ 0↓ ─────────────┤
│ 80b7fe8 docs(artefato)…    │
│ ccb825f feat(cartas)…      │
│ ⋯ ver grafo completo       │
└────────────────────────────┘
```

- **Título**: nome da vault, fixo, não colapsável.
- **Árvore**: pastas colapsáveis, arquivos clicáveis; oculta `.obsidian`, `.trash` e
  dotfiles. Ações por item (hover/menu): renomear, apagar (apagar com confirmação;
  pasta apaga recursivo com confirmação explícita do conteúdo).
- **Badges git na árvore**: arquivo `M`odificado / `A`dded-staged / `U`ntracked com
  letra e cor (convenção VS Code), propagando cor até as pastas ancestrais.

### Viewer / editor de markdown

- Dois modos alternáveis: **Visualização** (render via `mdToHtml()`) e **Edição**
  (textarea raw, padrão do `document.js`). Botão Salvar + `Ctrl+S`, indicador de
  não-salvo, aviso ao trocar de arquivo com edição pendente.
- **Wikilinks**: pré-processamento no módulo de vaults **antes** de chamar
  `mdToHtml()` — o parser compartilhado não é alterado (zero risco pro chat).
  - `[[Nota]]` / `[[Nota|alias]]` → link clicável; resolução Obsidian-style por
    basename usando o índice da árvore já carregada; ambiguidade resolve pelo
    caminho mais curto. Link para nota inexistente ganha estilo "pendente" e clicar
    oferece criar a nota.
  - `![[img.png]]` e `![](caminho relativo)` → `<img>` servida por `/api/vaultfs/raw`.
- Arquivos não-markdown: imagens renderizam; demais binários mostram nome/tamanho.

### UI de git (strip inferior da NAV)

- **MUDANÇAS**: listas staged/unstaged (clicar = diff no viewer; botões por arquivo:
  stage/unstage, discard com confirmação), caixa de mensagem, Commit, checkbox amend,
  "desfazer último commit" (reset soft, confirmação).
- **Branch/sync**: branch atual com dropdown (checkout de existente, criar nova),
  contadores ahead/behind, botões push/pull/fetch.
- **Commits**: lista dos recentes da branch atual (hash curto, mensagem, data
  relativa); clicar = diff do commit no viewer; "ver grafo completo" abre o grafo.
- **Vault sem git**: strip mostra só "Inicializar repositório".
- Toda operação mostra estado de progresso; erro do git aparece na íntegra
  (stderr) num painel de erro — nada engolido. Após qualquer operação, status
  e badges da árvore atualizam.

### Grafo de commits (no viewer)

Dados de `git log --all --topo-order --parents` + refs; layout de lanes client-side
(`vaultsGraph.js`): commits em linhas, lanes coloridas por branch, bezier nos
merges/forks, labels de branch/tag nos tips. Clicar num nó mostra o diff daquele
commit. Paginação simples (carrega N=200, botão "mais").

## Backend — API `/api/vaultfs`

Todas as rotas com `Depends(require_user)` (honra `AUTH_ENABLED=false`).
Identificação: `vault` = slug do basename da raiz (ex: `op-vault`, `pleitost`;
colisão desambigua com sufixo numérico), derivado da lista `tool_path_extra_roots`
(lida do `data/settings.json` pelo mesmo mecanismo de settings já usado no app) —
estável mesmo se a ordem da lista mudar; `path` = caminho relativo dentro da vault.

**Segurança de caminho (regra única, aplicada em toda rota):** resolver
`os.path.realpath(root + path)` e exigir `os.path.commonpath([alvo, root_real]) ==
root_real` (mesmo padrão do `personal_routes.py`). Bloqueia `../`, symlink pra fora
e caminho absoluto injetado. Escrita/rename/delete recusam alvos dentro de `.git/`.

### Arquivos

| Rota | Função |
|---|---|
| `GET /api/vaultfs/vaults` | Lista vaults: `{id, name, path, exists, has_git}` |
| `GET /api/vaultfs/tree?vault=` | Árvore recursiva (exclui dotdirs); inclui mtime/size |
| `GET /api/vaultfs/file?vault=&path=` | Conteúdo texto + `mtime` (pro controle de conflito) |
| `PUT /api/vaultfs/file` | Salva `{vault, path, content, base_mtime}`; se `mtime` atual ≠ `base_mtime` → `409` com aviso (frontend pergunta antes de forçar com `force=true`) |
| `POST /api/vaultfs/file` | Cria nota (`kind=file`) ou pasta (`kind=dir`) |
| `POST /api/vaultfs/rename` | Renomeia/move `{vault, path, new_path}` |
| `DELETE /api/vaultfs/file` | Apaga arquivo; pasta só com `recursive=true` |
| `GET /api/vaultfs/raw?vault=&path=` | Serve binário (content-type por extensão, `FileResponse`) |

### Git

Execução via `subprocess` do binário `git` com `cwd` = raiz validada da vault
(padrão já existente no projeto; sem lib python de git). Timeout por comando;
saída estruturada `{ok, stdout, stderr}` — stderr sempre repassado ao frontend.

| Rota | Comando subjacente |
|---|---|
| `GET /git/status` | `git status --porcelain=v2 --branch` → parse: staged/unstaged/untracked + ahead/behind |
| `POST /git/stage` / `unstage` | `git add -- <p>` / `git restore --staged -- <p>` |
| `POST /git/discard` | `git restore -- <p>` (untracked: apaga o arquivo) |
| `POST /git/commit` | `git commit -m <msg>` (`--amend` opcional) |
| `POST /git/undo_commit` | `git reset --soft HEAD~1` |
| `GET /git/log` | `git log` da branch atual (hash, msg, autor, data; paginado) |
| `GET /git/graph` | `git log --all --topo-order --parents` + `git for-each-ref` → JSON pro grafo |
| `GET /git/diff` | Working tree (`git diff [--staged] -- <p>`) ou commit (`git show <hash>`) |
| `GET /git/branches` · `POST /git/checkout` · `POST /git/branch` | listar / trocar / criar |
| `POST /git/push` / `pull` / `fetch` | com env de credencial (abaixo) |
| `POST /git/init` | `git init` na raiz da vault |

### Identidade e credencial no container

Config no `docker/pereiraoc.yml` (env do serviço), documentada no `LOCAL_CHANGES.md`:

- `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL`
  = `pereiraoc` / `pereiraoc@gmail.com` — o git honra essas envs nativamente; nenhum
  gitconfig das vaults é tocado.
- Push/pull https: token em `VAULTFS_GIT_TOKEN` (env). O backend injeta via
  `GIT_ASKPASS` apontando pra um helper efêmero que ecoa o token — o token nunca é
  gravado em config/disco nem aparece em `ps` (vai por env, não argv). Sem token
  configurado, push/pull retornam erro claro instruindo configurar a env.

## Tratamento de erros

- Salvar com arquivo alterado no disco (ex: editado no Obsidian ao vivo): `409` +
  diálogo "sobrescrever / recarregar".
- Operação git que falha (checkout com tree sujo, push rejeitado, conflito de pull):
  stderr integral exibido; nenhuma tentativa automática de resolução na v1.
- Vault sumiu do disco / settings mudou: painel mostra estado vazio com aviso e a
  lista do sidebar re-sincroniza.

## Testes

- **Backend (pytest, seguindo infra de testes existente no repo):** validação de
  caminho (traversal `../`, symlink, absoluto, alvo em `.git/`), CRUD de arquivos,
  conflito de mtime (409), parse do `status --porcelain=v2`, commit/stage em repo
  temporário de teste, `git init`.
- **Frontend:** verificação manual guiada (checklist por fase) — projeto não tem
  harness JS de testes.

## Fases de implementação

1. **Browse + editor** — seção no sidebar, painel dockado, árvore, viewer/editor
   markdown com wikilinks, CRUD de arquivos. *Utilizável sozinha.*
2. **Git essencial** — status, badges na árvore, stage/unstage/discard, commit,
   lista de commits, diff no viewer.
3. **Git completo** — branches (checkout/criar), push/pull/fetch + credencial,
   amend/undo, `git init`, grafo de commits.

Cada fase termina com testes passando e checklist manual verificada antes da próxima.
