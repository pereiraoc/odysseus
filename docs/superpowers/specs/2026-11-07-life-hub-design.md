# Life hub — uma janela com os apps de dados pessoais — design

**Data:** 2026-11-07 · **Estado:** aprovado no chat (estrutura e navegação: trilho lateral; tudo em inglês; "vai lá,
depois eu vejo" — o usuário delegou o resto e pediu execução até o fim). **Subprojeto 1 de 7** do roteiro
Life (hub → Location → Media → People → Health → Career → Wallet). Embasamento:
`docs/superpowers/research/2026-11-07-hub-life-e-apps.md` (navegação, entidades, URL, abertura) e a spec do Diary
`docs/superpowers/specs/2026-11-06-life-timeline-design.md`.

## Problema

Os dados pessoais estão espalhados em três janelas e três seções da barra lateral: "Life" (Diary), "Finanças" e
"Uso de IA", com idiomas diferentes (Finanças e Uso de IA em português, Life em inglês) e sem ligação entre si. O
usuário quer um lugar só ("Life") com apps — Diary, Finances, AI usage agora; Location, Media, People, Health,
Career e Wallet depois — integrados entre si.

## Decisões

1. **Uma janela, trilho lateral** com ícone + nome de cada app sempre visíveis (9 apps passam do limite de 7 de um
   trilho só de ícones; NN/g: rótulos visíveis). Em larguras médias (< 1100 px) o trilho encolhe para ícone com o
   nome embaixo; no celular (< 640 px) a tela raiz do Life é a **lista de apps** e cada app abre como tela com
   "‹ Apps" (nada de "4 + More").
2. **Só aparecem apps prontos.** Nesta entrega: **Diary**, **Finances**, **AI usage**. Os outros entram no trilho
   quando existirem (sem itens "em breve").
3. **A janela cobre a barra lateral do Odysseus** (largura `calc(100vw - 32px)`, altura `calc(100vh - 32px)` no
   desktop) — evita duas barras laterais lado a lado. Minimizar/fechar devolve tudo.
4. **Tudo em inglês** na interface (abas, botões, títulos, dicas, estados vazios, legendas). Dados ficam como estão
   (categorias de Finanças, descrições de transações, títulos de sessões). Datas `dd/mm/yyyy` e números com o
   formato do Life (`R$ 1,234.56`) — `toLocaleString('en-GB')`/`'en-US'` no lugar de `'pt-BR'`.
5. **Barra lateral do Odysseus:** as seções "Uso de IA" e "Finanças" saem; a seção **Life** lista um item por app
   (Diary, Finances, AI usage) que abre o Life direto nele. Trading fica como está.
6. **Endereços por app** (estado na URL, voltar/avançar do navegador funcionam):

   | App | Hash | Exemplos |
   |---|---|---|
   | Diary | `#life/diary/<data\|mês\|ano>` · `#life/diary/search?q=` | `#life/diary/2023-03-14`, `#life/diary/2023-03` |
   | Finances | `#life/finances/<aba>[?from=&to=&account=&q=]` | `#life/finances/transactions?from=2023-03-14&to=2023-03-14` |
   | AI usage | `#life/ai/<aba>[?from=&to=]` | `#life/ai/sessions?from=2023-03-14&to=2023-03-14` |

   Abas de Finances: `overview, monthly, review, categories, transactions, audit, files`. Abas de AI usage:
   `overview, models, sessions, calendar, tools, limits, web, code`. **Compatibilidade:** os hashes antigos do
   Diary (`#life/2023-03-14`, `#life/2023-03`, `#life/2023`, `#life/search?q=`) continuam abrindo o Diary.
   Todos os links internos saem de **uma** função (`lifeHref(app, path, params)`), como recomenda a pesquisa.
7. **Abre onde parou:** o Life lembra o último app e a última rota de cada app (por aparelho, `localStorage`); na
   primeira vez abre no Diary em hoje. Abrir pelo item da barra lateral vai direto ao app.
8. **Busca global:** o campo do cabeçalho (`/` ou Ctrl/Cmd+K) busca em tudo e mostra os resultados no Diary
   (`#life/diary/search?q=`), que já agrupa por dia e já cobre Takeout, finanças e sessões de IA.
9. **Links cruzados (v1):**
   - Diary → Finances: o título da faixa "All day" ganha "Open in Finances ›" para o dia
     (`transactions?from=D&to=D`).
   - Diary → AI usage: cada sessão de IA do dia abre `#life/ai/sessions?from=D&to=D`.
   - Finances → Diary: a data de cada transação (aba Transactions e listas que mostram datas) é um link para o dia.
   - AI usage → Diary: o dia de cada sessão (lista de sessões e detalhe) é um link para o dia.
   - A data escolhida **não** é forçada ao trocar de app pelo trilho (cada app reabre onde estava); só os links
     cruzados levam a data. Carregar a data em todo troca de app fica para depois, se fizer falta.
10. **Cabeçalho:** `Life · <App>` + a barra do app (o Diary põe a migalha ano › mês › dia e ‹ Today ›; Finances e
    AI usage não têm barra própria no cabeçalho — as abas deles ficam no topo do conteúdo, sem terceira barra
    lateral) + busca + minimizar/fechar.

## Arquitetura do frontend

```
static/js/life/
  index.js        moldura do hub: janela, trilho, cabeçalho, busca, teclado, barra lateral, lista de apps no celular
  router.js       PURO: parseLifeHash / lifeHref (rotas por app + compatibilidade)   ← testado em node
  apps.js         registro dos apps: { id, label, icon, mount(host, ctx), route(path, params) }
  apps/diary.js   o Diary de hoje (dia/mês/ano/busca) como app: migalha, ‹ Today ›, teclado ←/→/↑/t
  apps/finances.js  adaptador fino → mountFinances() de static/js/finance.js
  apps/ai.js        adaptador fino → mountAiUsage() de static/js/aiUsage.js
  day.js, month.js, year.js, search.js, parts.js, metrics.js, format.js, icons.js, api.js   (inalterados ou quase)
static/js/finance.js   vira módulo de app: export mountFinances(host, { route, navigate }) — sem janela própria,
                       sem item de barra lateral; textos em inglês
static/js/aiUsage.js   idem: export mountAiUsage(host, { route, navigate })
```

Contrato de app: `mount(host, ctx)` desenha dentro de `host` (uma vez) e devolve
`{ route(path, params), unmount() }`; `ctx = { navigate(path, params, {replace}), setToolbar(html|node),
lifeHref }`. O hub chama `route()` a cada mudança de hash daquele app; troca de app chama `unmount()` do anterior
(remove listeners/observers) e esvazia `host`.

**Sem mudança de backend** nesta entrega (as rotas `/api/finance/*`, `/api/ai-usage/*` e `/api/lifelog/*` ficam como
estão).

## Fora do escopo (próximos subprojetos)

Location (mapa de calor H3 no NAS + camada de fotos, viagens, lugares, métricas), Media, People, Health, Career,
Wallet; tela inicial com resumo; carregar a data global em toda troca de app; paleta de comandos com ações.

## Testes

- `tests/life_router.test.mjs` (node): ida e volta de `parseLifeHash`/`lifeHref` para os três apps, parâmetros,
  compatibilidade dos hashes antigos, hashes de outros donos (`#abc123`, `#lifestyle`) → `null`.
- Testes estáticos do upstream (tokens de CSS, PRECACHE, `CACHE_NAME`), `node --check` de todos os módulos.
- Checagem visual no Chromium do container (`scripts/life_ui_check.cjs` estendido): Diary, Finances (overview e
  transactions filtrada por dia), AI usage (overview e sessions), lista de apps no celular, tema claro e escuro, sem
  erros de console; voltar/avançar entre apps.
- Suíte completa dentro da imagem comparada com o commit anterior (mesmo procedimento do Diary).
