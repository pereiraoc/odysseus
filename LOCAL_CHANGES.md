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
- **Sync de 2026-10-17 — atenção no deploy:** (a) o compose do upstream mudou a porta
  padrão do host de 7000 para **7011** — manter `APP_PORT=7000` no `.env` (o launcher
  Electron abre localhost:7000); (b) o volume do ChromaDB passou de `/chroma/chroma` para
  `/data` (`docs/chromadb-volume-migration.md`): o índice vivia na camada do container e
  some quando ele é recriado — copiar antes; (c) migrações SQLite aditivas (ADD COLUMN)
  rodam no 1º boot — backup do `data/app.db` antes.
- **Sync de 2026-10-05 — lição:** o conflito append-only do `static/style.css`
  (upstream e fork anexando no fim) perdeu o `}` que fechava o último `@media`
  do upstream; o bloco `.vaults-*` inteiro virou regra aninhada e o navegador
  descartou o CSS do fork em silêncio (modal do Obsidian minúsculo, painéis
  sem estilo). `tests/test_static_css_balanced.py` pega isso agora — rodar
  depois de todo sync.

## 1. `routes/shell_routes.py` — admin com `AUTH_ENABLED=false` atrás do Docker  [inline patch]
Desde o sync de 2026-10-17 o upstream trata `AUTH_ENABLED=false` em `_require_admin`, mas
só aceita cliente **loopback direto** (`src/auth_helpers.is_direct_loopback_request`: IP
127.0.0.1/::1, sem headers de proxy, sem fetch cross-site, Origin igual). Atrás do Docker o
navegador chega pelo docker-proxy e o container vê o **gateway da bridge** (172.18.0.1)
→ todos os endpoints admin do Cookbook (packages/install/serve/download) dariam **403**.
O patch acrescenta `_docker_proxy_operator_request`: aceita também o gateway da rede do
container (lido de `/proc/net/route`, só com `/.dockerenv`) e aplica **o mesmo contrato de
transporte** do upstream. Outros containers da rede, sites de fora (CSRF) e o header de tool
interna seguem barrados — testes em `tests/test_local_docker_proxy_admin.py`.
(Até o sync de 2026-10-05 o patch era um `return` cego com auth off, que deixava um site
qualquer aberto no navegador disparar endpoints admin em localhost:7000 por CSRF.)
DROPAR se o upstream passar a aceitar o gateway do Docker.

## 2. `docker/pereiraoc.yml` — overlay de deploy local  [arquivo novo, aditivo]
Não toca nenhum arquivo do upstream. Adiciona ao serviço `odysseus`:
- **Mount dos vaults do Obsidian** `/data/vaults:/app/vaults` (rw) → o agente lê/
  escreve os vaults.
- **`LD_LIBRARY_PATH`** das libs CUDA das wheels nvidia em `~/.local` (movido pra cá
  do `docker/gpu.nvidia.yml`, que voltou a ser pristine).

- **Imagem local, nunca a do GHCR**: `image: odysseus-odysseus:latest` +
  `pull_policy: build`. Desde o sync de 2026-10-05 o `docker-compose.yml` do
  upstream declara `image: ghcr.io/odysseus-dev/odysseus:latest` (build só como
  fallback de pull) — sem este override o `up` rodaria a imagem oficial, SEM os
  deltas deste fork.

Ativar no `.env` (gitignored, NÃO comitado):
`COMPOSE_FILE=docker-compose.yml:docker/gpu.nvidia.yml:docker/pereiraoc.yml`

## 3. `data/settings.json` — `tool_path_extra_roots`  [runtime, gitignored]
`"tool_path_extra_roots"` lista as vaults acessíveis às file-tools do agente **e ao
painel de Vaults** (item 5): `OP Vault`, `pleitost`, `pleitost-app`,
`caelestia-arch-setup` e `POA 1987` (adicionada em 2026-10-13) (os dois últimos montados pelo overlay do item 2, de
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
- CSS do fork em `static/css/zz-fork-vaults.css` (arquivo próprio, último na cascata),
  registrado em `static/index.html` e no precache do `static/sw.js` com o mesmo `?v=` dos
  outros (os testes de manifesto exigem). Até 2026-10-05 era append no fim do
  `static/style.css`, que o upstream quebrou em fragmentos `static/css/NN-*.css`.
- `static/js/vaults.js` importa `ui.js` e `tileManager.js` com o MESMO `?v=` do resto do app
  (URL diferente = segunda instância do módulo; `test_frontend_module_version_parity`).
- `core/middleware.py`: `frame-src 'self'` ganha extensão opcional via env
  `CSP_EXTRA_FRAME_SRC` (vazio = upstream intacto) — permite iframar o
  desktop remoto do Obsidian (localhost:3010) no modal embutido do painel.

**Obsidian por sessão (modelo atual):** cada vault tem SEU container do
Obsidian oficial (`odysseus-obsidian-<vault-id>`, lscr.io/linuxserver/obsidian),
criado dinamicamente pelo backend via docker API na primeira abertura — clique
na vault do sidebar abre a sessão daquela vault num modal iframe (Selkies,
portas 3010-3019, liberadas no CSP). Multi-vault lado a lado; sync/plugins são
configurados DENTRO do Obsidian de cada sessão (login 1x por vault; config
persiste em `data/obsidian-sessions/<id>/` — a sessão da OP Vault herdou o
config antigo de `data/obsidian-config/`, migrado em 2026-07-26). Dot verde no
item = sessão rodando; nuvem liga/desliga (container parado não gasta RAM).
Binds traduzidos container→host pela env `VAULTFS_HOST_MAP`. Rotas:
`GET/POST /api/vaultfs/obsidian-sync` (status/toggle por vault) e
`POST /api/vaultfs/obsidian-open`.

**Janela da sessão sem controles próprios (2026-09-19):** o X/minimizar/
maximizar que apareciam DENTRO do iframe eram do frame que o Obsidian desenha
sozinho (setting "Window frame style", default `hidden`) — clicar naquele X
matava o app e a sessão virava um desktop vazio pra sempre: o container seguia
`running`, o Odysseus só reapontava o iframe e a vault não abria mais (foi o
que aconteceu com a OP Vault). Dois lados do fix, ambos em `_ensure_session`:
`frame: "native"` no `obsidian.json` da sessão (a imagem roda com `NO_DECOR`,
labwc com `serverDecoration="no"` — sem frame próprio a janela não tem botão
nenhum; quem fecha é só o X do Odysseus) e `RESTART_APP=true` no container,
que liga o `svc-watchdog` da imagem pra relançar o Obsidian se ele sair
(crash/Alt+F4). Sessões antigas são recriadas na MESMA porta no próximo open:
label `odysseus.session-spec` != `SESSION_SPEC_VERSION` dispara `docker rm -f`
+ create (o estado vive nos binds `/config` e `/vaults`, o container é
descartável).

**Acentos perdidos ao digitar na sessão (2026-09-20):** digitando rápido
(<~100ms/tecla) TODO caractere acentuado sumia dentro do Obsidian; ASCII nunca
caía. A imagem migrou de KasmVNC pra **Selkies** (labwc + Xwayland): ASCII entra
por scancode/uinput, mas acentuado não existe no keymap US do container e é
injetado via `wtype`, que sobe um keymap temporário no compositor e digita na
hora — cliente X11 não aplica o keymap a tempo e o caractere some (ou sai o
anterior). O wrapper `/usr/bin/obsidian` da imagem só liga
`--ozone-platform=wayland` se houver `/dev/dri` no container, e a spec não
passava device nenhum. Fix: env `OBSIDIAN_DRI_NODE` (lista por vírgula) vira
`Devices` no `_session_spec`; no overlay aponta pro render node da iGPU
(`/dev/dri/renderD129`, pci 00:02.0). Com isso o Obsidian vira cliente Wayland
nativo: medido 0 perda até 10ms/tecla (antes, perda total a 60ms). NÃO passar
`/dev/dri` inteiro — o card node da nvidia põe a sessão em crash-loop.
`SESSION_SPEC_VERSION` foi pra "3" (sessões recriadas no próximo open).

**Render node estável (2026-10-06):** depois de um reboot a numeração dos
render nodes inverteu (iGPU → `renderD128`, nvidia → `renderD129`) e as
sessões configuradas com `renderD129` entraram em crash-loop do desktop
(`svc-de` relançando sem parar; Obsidian nunca subia). `OBSIDIAN_DRI_NODE`
agora aponta o symlink estável `/dev/dri/by-path/pci-0000:00:02.0-render`
(o daemon resolve no host a cada start); dentro do container o node vira
`/dev/dri/renderD128+i`. `SESSION_SPEC_VERSION` → "4".

**Itens sumindo no explorador do Obsidian (2026-10-13):** com o render node
o Chromium do Obsidian rasteriza na GPU (iris/Mesa 25.0.7, Iris Xe) e deixa
tiles sem pintar — ex.: pasta Rascunhos mostrava 1–2 das 11 notas. Provado
via CDP: o DOM do explorador tinha os 12 itens com altura/posição corretas;
o print do próprio compositor (grim) não — logo não era stream nem lógica do
Obsidian. Fix: `_seed_session_autostart` grava o autostart do labwc da sessão
com `obsidian --disable-gpu-rasterization` (composição GPU e Wayland nativo
mantidos; acentos seguem ok). A imagem deixa o autostart read-only com
RESTART_APP → troca atômica. `SESSION_SPEC_VERSION` → "5".

**Vigia do explorador (2026-10-14):** depois do reboot do PC o sintoma
voltou (POA: `Recursos e Mídia` aberta, linha-guia até o fim, nenhum item).
Recriar só o processo de GPU NÃO resolveu e reiniciar o Obsidian sim → o
estado errado é da lista virtual do explorador (infinityScroll, no
renderer), não da rasterização. Gatilho exato não reproduzido (nem com
subida sem cliente, CPU limitada, sidebar recolhida, mudanças de arquivo).
Fix: a sessão sobe com `--remote-debugging-port=9222` (só 127.0.0.1 dentro
do container); `POST /api/vaultfs/obsidian-heal {vault, hard}` roda via
`docker exec` um cliente CDP no Python da imagem que detecta pasta aberta,
visível, com altura reservada e zero itens; força `invalidateAll()` +
`compute(true)` e, com `hard` e ainda travada, `app:reload`. O frontend
(`healExplorer`/`watchExplorer` em vaults.js) chama ao abrir a vault (hard),
a cada 30s com a janela visível (soft; hard se persistir no ciclo seguinte) e
no botão ↻. Ocorrências vão pro log (`explorador travado na sessão …`).
`SESSION_SPEC_VERSION` → "6".

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

## 6. Painel "Uso de IA" — tokens de outros apps de IA  [feature local]

Painel na sidebar (seção "Uso de IA") que mostra o histórico de uso de IA de
Claude Code, Codex, Cursor, Copilot, Cline e do próprio Odysseus: tokens por
dia, sessão, modelo, categoria de atividade e máquina. Os dados vêm do banco
SQLite que o `ai-usage-export` (repo `caelestia-arch-setup`, timer diário) mantém
em `/data/ai-usage/ai-usage.sqlite`. O painel só lê (`mode=ro`).

- Abas: Visão geral (KPIs, barras empilhadas por dia/semana/mês, ranking,
  hora do dia, por ferramenta), Modelos, Sessões (busca + detalhe por dia e
  modelo + ferramentas usadas), Calendário (heatmap), Ferramentas, Limites Codex,
  Chats web (visitas e conversas por site, do histórico do navegador) e Código IA
  (blocos do Cursor por modelo, linhas IA × humano por commit).
- Filtros: período, agrupar por categoria/modelo/ferramenta/máquina, métrica,
  incluir estimados (Cursor e parte do Copilot não gravam tokens).
- Gráficos em SVG próprio (o CSP não libera CDN).

**Arquivos novos (aditivos, nunca conflitam):** `routes/ai_usage_routes.py`,
`static/js/aiUsage.js`, `static/css/zz-fork-ai-usage.css`.

**Hooks mínimos em arquivos do upstream:**
- `app.py`: registro `setup_ai_usage_routes()` logo após o `setup_vaultfs_routes()`.
- `static/index.html`: seção `#ai-usage-section` após a de Vaults, `<link>` do CSS e `<script type="module">`.
- `docker/pereiraoc.yml`: volume `/data/ai-usage:/app/ai-usage:ro`.

O caminho do banco pode ser trocado pela env `AI_USAGE_DB`. Sem banco, o painel
mostra só um aviso.

## 7. Finanças — arquivo bancário vitalício  [feature local + inline patch no Dockerfile]

Arquivo local de todo o histórico bancário (Nubank, Santander, Wise; Caixa só
histórico), auditável e sem duplicatas entre fontes. Spec:
`docs/superpowers/specs/2026-10-20-financas-design.md`.

- Três camadas em `data/finance/` (gitignored, `chmod 700`): `raw/` (arquivo
  importado exatamente como veio, por sha256), `finance.sqlite` (registros por
  fonte + livro canônico reconstruível), `ledger/` (export hledger em git local,
  com asserções de saldo; `hledger check -s ordereddates` valida tudo) e
  `corrections/<sha>.json` (correções manuais de OCR, com motivo).
- Importadores: OFX (Nubank/Santander), CSV do Wise, PDF do extrato Santander (texto ou OCR), PDF da fatura Santander (senha via FINANCE_PDF_PASSWORD, duas colunas)
  (texto ou OCR), PDF da fatura Nubank, CSVs categorizados do Santander (fonte
  secundária), JSON da API do Wise. Cada parser confere saldo/total impresso.
- Painel na sidebar ("Finanças"): Visão geral, Transações (com as fontes de cada
  uma), Auditoria (quebras de saldo, faturas, fila de revisão, erros) e Arquivos
  (upload + download do original).
- Open Finance (Meu Pluggy, grátis): `src/finance/pluggy_client.py`, `pluggy_sync.py`, `importers/pluggy.py`.
  Poller em thread própria (a cada 3h, `FINANCE_POLL_SECONDS`; desliga com `FINANCE_POLLER=0`), só baixa quando
  o banco atualizou (`lastUpdatedAt`); leitura completa semanal. Investimentos viram `investment_snapshots`.
  Spike/diagnóstico: `./venv/bin/python -m src.finance.pluggy_probe`.
- Categorias: regras em `data/finance/ledger/rules.json` + `rules_user.json` (aba Revisar); divisão de uma
  transação em categorias (`splits.py`, `ledger/splits.json`, view `tx_lines`), p.ex. parte moradia + parte
  devolução de empréstimo; `emprestimos:<pessoa>` é neutro (nem gasto nem renda) e vira "A receber".
- Estornos/reembolsos (`refunds.py`, tabela `refund_pairs`, recriada junto com `pair_transfers`): crédito casado
  com a compra original (mesma conta e estabelecimento/pessoa, até 180 dias) some dos gráficos, das categorias e
  do custo mensal; estorno parcial deixa só a diferença no mês da compra. O ledger continua com tudo.
- CLI: `./venv/bin/python -m src.finance.cli import|report|queue|ledger|rebuild|reparse|wise-sync|uncategorized`.
- **Reprocessar tudo (`reparse`) só dentro do container** (`docker exec -u 1000 odysseus-odysseus-1 ...`): o host
  não tem tesseract; arquivos que falham só por ambiente mantêm o estado anterior.

**Arquivos novos (aditivos, nunca conflitam):** `src/finance/**`, `routes/finance_routes.py`,
`static/js/finance.js`, `static/css/zz-fork-finance.css`, `tests/test_finance_core.py`,
`tests/test_finance_routes.py`.

**Hooks mínimos em arquivos do upstream:**
- `app.py`: registro `setup_finance_routes()` logo após o do "Uso de IA".
- `static/index.html`: seção `#finance-section` após a do "Uso de IA", `<link>` do CSS e `<script type="module">`.
- `static/sw.js`: `zz-fork-finance.css` no precache (mesmo `?v=` do index).
- `Dockerfile` **[inline patch]**: `RUN apt-get install poppler-utils tesseract-ocr tesseract-ocr-por`
  numa camada própria antes do `COPY . .` (não invalida o cache do pip). Ao sincronizar,
  reaplicar se o upstream mexer nessa região.
- `docker/pereiraoc.yml`: envs `WISE_API_TOKEN`, `FINANCE_PDF_PASSWORD`, `PLUGGY_*` (valores só no `.env`).

## 8. Trading — painel fino sobre o Trading Lab  [feature local + serviço extra no compose]

Grupo "Trading" na barra lateral para testar o TradingAgents com **dinheiro fictício**
(nunca envia ordem real): analisar uma ação numa data, ler o relatório, carteiras ao vivo e
de reencenação (período passado) comparadas ao índice, backtest e agenda.

**A lógica toda vive no fork `pereiraoc/TradingAgents`** (`tradingagents/lab`, doc em
`docs/lab.md` de lá; spec `docs/superpowers/specs/2026-10-26-trading-lab-design.md`), servido
pelo container `tradingagents-lab` (rede interna, porta 7100, dados em `/data/trading`).
Aqui fica só o que é do Odysseus:

- `routes/trading_routes.py`: proxy autenticado `/api/trading/lab/*`; nos POST troca
  `endpoint_id`+`model_name` (ou `local_preset` do Cookbook) por `model` + `api_key`
  (chave decifrada do `ModelEndpoint`, só no corpo para a rede interna; `localhost` vira
  `odysseus`, que é como o lab enxerga este container). `GET /api/trading/models` lista
  endpoints habilitados (sem chave) e presets confirmados do Cookbook.
- `routes/trading_action.py`: ação agendável `trading_run` (registrada em
  `BUILTIN_ACTIONS` pelo próprio módulo, sem editar `src/builtin_actions.py`). Config JSON no
  prompt. Enfileira no lab **na hora** (o lab espera o modelo) e depois espera e resume — o
  scheduler cancela toda tarefa em execução a cada pedido da interface, então nada de esperar
  antes de enfileirar.
  **Não liga o Qwen** (a autoridade de tarefa não inclui `serve_model`): a aba Agenda cria
  uma `cookbook_serve` agendada com `then_task_id` → `trading_run` com `trigger_type`
  `webhook` (só roda encadeada).
- `static/js/trading.js`, `static/css/zz-fork-trading.css`: janela com Analisar,
  Relatórios (HTML do lab em `<iframe sandbox srcdoc>` — o app manda X-Frame-Options DENY),
  Carteiras, Backtest e Agenda.
- Testes: `tests/test_trading_routes.py`, `tests/test_trading_action.py`.

- Janela (27/10): abas Início, Radar, Analisar, Relatórios, Carteiras, Backtest, Agenda; **um modelo só
  no topo** (presets do Cookbook com estado ligado/desligado e botão "Ligar" = `POST
  /api/trading/start-model`, que chama `action_cookbook_serve` dentro do pedido — como tarefa
  disparada, o próprio toast seguinte a cancelava; `end_after_min` 240, `set_default` false); análise com o modelo desligado **espera na fila** (o lab não falha); andamento
  agente a agente com trecho de cada relatório; campo de ação com busca (`/search` do lab, `.SA` da B3
  automático). `GET /api/trading/models` testa o servidor local de cada preset e esconde o endpoint
  local que só duplica o preset.
- Radar (lógica no lab): Bloomberg (RSS de manchetes), notícias sobre figuras públicas (Google News),
  compras de congressistas dos EUA (Bargo, sem chave) e de executivos (Form 4 da SEC); a IA lê os sinais,
  ranqueia ações e a "carteira do Radar" (fictícia) analisa as melhores. `trading_run` aceita
  `{"radar": true}` e espera também as análises que o Radar enfileirar.

**Hooks mínimos em arquivos do upstream:** `app.py` (router após o de Finanças),
`static/index.html` (seção `#trading-section`, `<link>`, `<script type="module">`),
`static/sw.js` (CSS no PRECACHE + `CACHE_NAME`), `docker/pereiraoc.yml` (serviço
`tradingagents-lab` + env `TRADING_LAB_URL`).

**Atualizar o motor:** `git pull` no fork → `docker compose build tradingagents-lab &&
docker compose up -d tradingagents-lab` (não precisa reconstruir o Odysseus).

## 9. Toast sem login não manda mais para /login  [bugfix, inline patch]

`routes/task/task_routes.py` `POST /api/tasks/notification-logs`: todo `showToast` grava o aviso
ali; sem login (AUTH_ENABLED=false / loopback) não há dono e a rota respondia **401**, e o
`fetch` global de `static/app.js` manda qualquer 401 para `/login` → a página recarregava no
chat a cada toast verde. Agora, sem usuário, chama `require_user` (401 só quando o login é de
fato exigido) e devolve `{"stored": false}`. Mesmo bug no upstream (`dev` de 27/10).
Teste: `tests/test_trading_routes.py::test_toast_log_without_login_is_not_401`.
