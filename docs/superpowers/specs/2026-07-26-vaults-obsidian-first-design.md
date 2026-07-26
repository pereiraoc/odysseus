# Vaults Obsidian-first + File Browser — design

**Data:** 2026-07-26 · **Status:** aprovado (chat) · Sucede o design de 2026-07-25
(painel de vaults), que fica ativo até esta migração concluir.

Feature **local do fork** (política do `LOCAL_CHANGES.md`: máximo em arquivos
novos; edições upstream mínimas — as já existentes bastam, nenhum bloco novo
previsto).

## Decisões (com o usuário)

| Decisão | Escolha |
|---|---|
| Abrir vault | Abre **o Obsidian oficial daquela vault** embutido (iframe KasmVNC), não o painel custom |
| Sessões | **1 container por vault** (`odysseus-obsidian-<id>`), criado dinamicamente via docker API; multi-vault lado a lado; clique abre sempre A vault clicada |
| Sync | Dentro do próprio Obsidian de cada sessão (login 1x por vault; config persiste) |
| Painel custom (Browser/Git) | Migra pra tool **"Files"** em Tools, generalizado pra raízes configuráveis |
| Tasks | **Fora** do File Browser (tarefas vivem no Obsidian/Tasks plugin). Rotas backend `/tasks*` permanecem (testadas, úteis pro agente), sem aba na UI |
| Raízes do Files | Setting `file_browser_roots` (default: cópia das vaults) + adicionar/remover pela UI |
| Favoritos | Estrela em arquivo/pasta → barra no topo; localStorage |
| Preview | md (pipeline atual c/ wikilinks+Dataview), código c/ highlight.js, imagem, **PDF `<embed>`**, áudio/vídeo nativos, binário = info+download |
| Soluções prontas | Avaliadas (Filestash/FileRise/copyparty/FileBrowser Quantum) e descartadas: serviço+auth separados, preview genérico sem git/wikilinks/Dataview/auth do Odysseus |

## 1. Sessões Obsidian por vault

**Backend (`routes/vaultfs_routes.py`):**
- Alocação: nome `odysseus-obsidian-<vault-id>`; porta estável = lida do
  container existente (inspect), senão próxima livre a partir de 3010 entre as
  nossas; config em `data/obsidian-sessions/<vault-id>/` (a sessão atual em
  `data/obsidian-config/` — que tem o login + sync da OP Vault — é MOVIDA para
  `data/obsidian-sessions/op-vault/` na migração; container global
  `odysseus-obsidian` antigo é removido, e o serviço de perfil sai do overlay).
- `POST /obsidian-open {vault}`: cria o container se não existe (docker API
  `POST /containers/create`: imagem lscr.io/linuxserver/obsidian, bind da vault
  → `/vaults/<name>`, config → `/config`, porta `127.0.0.1:<p>:3000`,
  `seccomp:unconfined`, shm 1g, PUID/PGID/TZ), semeia `obsidian.json` da sessão
  com a vault `open:true` ANTES do start, inicia se parado. Retorna
  `{ui_url, restarted}`.
- `GET /obsidian-sync`: por vault → `{exists, running, ui_url, port}`.
  `POST /obsidian-sync {vault, enable}`: start/stop DAQUELA sessão.
- Segurança: só nomes `odysseus-obsidian-<id>` com `<id>` na lista de vaults;
  socket docker já montado (item existente do LOCAL_CHANGES).

**Frontend (`static/js/vaults.js`, enxugado):**
- Seção Vaults: item = nome + dot verde (sessão rodando); clique →
  `POST /obsidian-open` → modal `vaults-obsidian-<id>` (um por vault,
  registrado no modalManager, dockável) com iframe da porta daquela sessão.
  Nuvem no hover do item liga/desliga a sessão.
- CSP: `CSP_EXTRA_FRAME_SRC` vira lista de portas usadas
  (`http://localhost:3010 http://localhost:3011 …` — env gerada pra faixa
  3010-3019 no overlay).
- Todo o código de painel custom sai da seção Vaults.

## 2. File Browser ("Files", em Tools)

- Item novo na `#tools-section` (`tool-files-btn`) → o modal atual do painel,
  renomeado (`files-panel`), com abas **Browser | Git** (sem Tasks).
- **Raízes**: setting `file_browser_roots` (lista de paths; default inicial =
  `tool_path_extra_roots`). Endpoints `/api/vaultfs/*` passam a resolver ids da
  UNIÃO das duas listas (dedup; flag `is_vault` pros itens de
  `tool_path_extra_roots`). Seletor de raiz no topo do Browser + “adicionar
  pasta…”/remover (grava o setting via API própria `PUT /api/vaultfs/roots`).
- **Árvore lazy**: `GET /tree` ganha `path` + `depth` (default: comportamento
  atual). O Files usa `depth=1` por nível expandido — raízes grandes
  (`/data/projects`, `node_modules`) não explodem.
- **Favoritos**: estrela por linha (hover) + barra de favoritos acima da
  árvore; `localStorage` `odysseus-files-favs` = `[{root, path, type}]`;
  clique navega/abre; estrela de novo remove.
- **Preview**: decide por extensão —
  md → pipeline atual (frontmatter/Properties, wikilinks, Dataview, bases);
  código/texto (qualquer não-binário) → `<pre><code>` + highlight.js (auto);
  imagem → `<img>`; PDF → `<embed src=raw>` altura total; áudio/vídeo →
  `<audio>/<video controls>` (raw já responde range); outro → nome, tamanho,
  botão download. Edição (textarea+salvar) continua pra md/código.
- **Git/dataview por raiz**: como hoje (git aparece se a raiz/pasta é repo;
  meta pro Dataview é buscada sob demanda e cacheada por raiz).

## 3. Migração/limpeza

1. Migrar config: `data/obsidian-config/` → `data/obsidian-sessions/op-vault/`;
   remover container `odysseus-obsidian`; tirar o serviço `obsidian` e a env
   `OBSIDIAN_SYNC_*` global do overlay (fica só `CSP_EXTRA_FRAME_SRC` com a
   faixa de portas).
2. `vaults.js`: seção Vaults só-Obsidian; painel vira `files-panel` acionado
   por Tools (mesmos módulos `vaultsDataview/vaultsGraph`).
3. `LOCAL_CHANGES.md` atualizado (sessões dinâmicas, Files, migração).

## Erros/testes

- Docker API indisponível/imagem ausente/porta ocupada → erro claro no toast;
  criação idempotente. Vault removida das settings com container órfão →
  ignorado (allowlist recusa).
- Pytest: união de raízes + `is_vault`; tree lazy (`depth`, `path`); spec do
  builder de criação de container (função pura que monta o JSON da docker API,
  testada sem docker); allowlist de nomes; `PUT /roots`.
- E2E real: clicar 2 vaults → 2 modais com sessões distintas; Files abrindo
  `/data/projects` lazy; favorito persistindo; PDF/código/imagem no preview.
