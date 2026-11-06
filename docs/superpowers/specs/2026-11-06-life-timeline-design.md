# Life — linha do tempo unificada dos dados pessoais no Odysseus — design

**Data:** 2026-11-06 · **Estado:** design aprovado em partes no chat (formato, fontes, abordagem A, localização ao
vivo, revisão de furos); UI redesenhada a pedido ("o life log está pobre e feio, seguir boas práticas de UI/UX").
**Repos envolvidos:** `odysseus` (fork, painel + backend), `nas-nixos` (exportador no NAS),
`caelestia-arch-setup` (sync e exportador do PC). Primeiro dos 4 subprojetos de "navegar todos os meus dados pelo
Odysseus" (os outros: fotos/Immich, Library inteira no Files, ferramentas do agente).

## Problema

O painel "Life log" (LOCAL_CHANGES §11) mostra só o Google Takeout, como uma lista crua: 52 linhas iguais por dia,
títulos com URL ("Watched https://www.youtube.com/watch?v=…"), ícones que viram caixinhas, nenhuma noção de lugar,
fotos ou dinheiro, e um "Trends" que conta eventos por produto do Google (pergunta que ninguém faz). Os dados ricos
já existem: Dawarich (170 mil pontos, 6,7 mil visitas, 98 viagens), Immich (~50 mil itens, 35 mil com cidade),
agenda no Nextcloud, Home Assistant, e-mail (Stalwart), e no PC finanças, Uso de IA, commits e notas.

## Objetivo

Um painel **Life** onde o dia é a página: abrir uma data e ver a história dela (onde estava, o que fotografou, o que
gastou, o que tinha na agenda, o que fez no PC e na internet), com zoom para mês e ano, busca em tudo e "neste dia"
em anos anteriores. Rápido (dia em < 200 ms sem o NAS), funcionando sem o NAS (menos mapa e imagens) e sem levar
coordenadas para o PC.

## Decisões (chat de 06/11)

1. Formato: **dia como página**, zoom mês/ano como resumos que levam a dias.
2. Fontes da v1: Takeout + Dawarich + Immich + agenda + finanças + trabalho no PC (IA, commits, notas) + casa (HA) +
   e-mail.
3. Abordagem **A**: exportar no NAS para SQLite sincronizado; ler fontes do PC na hora; só mídia e rota ao vivo.
4. Localização: **a cópia no PC não tem coordenadas**. Rota e pontos do dia aberto vêm ao vivo do Dawarich, com
   `Cache-Control: no-store`, e nunca são gravados no PC.
5. Lugares sem nome no Dawarich (1.155 de 1.222 são "Suggested/Unknown"; nenhum tem cidade): rótulo por prioridade
   **nome do Place (via `place_id`) → nome da visita → "Home" → "Unnamed place · <cidade>" → "Unknown location"**,
   nunca "Suggested place" (a issue de timeline mais votada do Dawarich, #583/#1281). Cidade pela base offline
   `geodata_places` do Immich. Bairro/estabelecimento exige geocodificador próprio (Photon) — fora daqui; o caminho
   barato é **nomear os lugares frequentes no próprio Dawarich** (nomear uma vez corrige o histórico), com o
   Dawarich atualizado para ≥ 1.21.0 antes (o NAS roda a 1.20.1).
6. Embasamento: pesquisa de 06/11 em `docs/superpowers/research/2026-11-06-referencias-ui-life-log.md` (Arc
   Timeline 4, Dawarich ≥ 1.12, Google Maps Timeline, Timelinize, Day One, Apple Photos/Journal, Immich, Exist,
   Recall/Rewind, Lifelog Search Challenge). Conclusão central: o formato "dia como página + lugares como espinha +
   ruído agrupado" tem precedente forte; o risco está na **semântica** (rótulo genérico, dia que começa no vazio,
   estadia picotada, buraco que parece dado) e a **busca** é a ferramenta principal, com a linha do tempo como
   contexto. Itens P0/P1 da pesquisa estão incorporados abaixo; P2 ficam na seção "Refinamentos".

## Arquitetura

```
NAS (nas-nixos)
  nas-lifelog-export   (existente, domingo)  → /srv/appdata/lifelog/lifelog.sqlite   (Takeout; não muda)
  nas-life-services    (novo, de hora em hora) → /srv/appdata/lifelog/services.sqlite (pequeno, reconstruído)
       ├─ Dawarich (docker exec psql dawarich_db): visitas rotuladas, viagens, km do dia
       ├─ Immich   (docker exec psql immich_postgres): metadados de fotos/vídeos (sem GPS)
       ├─ Nextcloud (docker exec mariadb nextcloud-db): eventos expandidos (icalendar + recurring-ical-events)
       ├─ Stalwart (JMAP 127.0.0.1:8085): cabeçalhos de e-mail
       └─ Home Assistant (REST 127.0.0.1:8123, HA_TOKEN) → acumulado em home-history.sqlite (persistente, backup)
PC (caelestia-arch-setup)
  lifelog-sync (agora de hora em hora; rsync -t pula o que não mudou) → /data/lifelog/{lifelog,services}.sqlite
  pc-activity-export (novo, de hora em hora) → /data/lifelog/pc.sqlite (commits de /data/projects/*, notas editadas)
Odysseus (fork)
  src/life/  provedores por fonte → modelo único de "item do dia"
  routes/lifelog_routes.py  /api/lifelog/*  (admin)
  ao vivo pela VPN: /route (Dawarich API), /photo/{id}/thumb|preview (Immich API) — no-store
  static/js/life/*  painel novo (substitui static/js/lifelog.js)
```

Regra de dono: o que mora no NAS é exportado no NAS; o que mora no PC é lido no PC. Os três SQLite chegam ao
container só leitura (`/data/lifelog:/app/lifelog:ro`, já montado). Finanças (`/app/data/finance/finance.sqlite`) e
Uso de IA (`/app/ai-usage/ai-usage.sqlite`) são abertos `mode=ro` pelo provedor (nunca pelo `Store()` das finanças,
que abre leitura-escrita e faz chmod).

**Fuso:** UTC−3 fixo em todas as fontes (igual ao exportador atual). Limitação conhecida: horário de verão até 2019
e viagens fora do Brasil deslocam a hora.

## `services.sqlite` (NAS) — esquema

Reconstruído a cada hora (`.new` + `mv`, como o lifelog). Nenhuma coluna de coordenada; teste garante.

| Tabela | Colunas | Fonte |
|---|---|---|
| `meta` | `key, value` — `built_at`, `version`, `source:<nome>` = `ok:<n>` / `error:<msg curta>` / `off` | — |
| `visits` | `id, start_ts, end_ts, place_id, label, kind ('named'\|'home'\|'city'\|'unknown'), city, country, confidence, duration_s` | Dawarich `visits` (sem `deleted_at`) + `places`; rótulo pela cadeia da decisão 5; `confidence` = coluna da visita (vazia em 82%, as importadas do Google) |
| `places` | `place_id, label, kind, city, country, visits, total_s, first_ts, last_ts` | agregado das visitas por `place_id` — alimenta "Name your places" e a busca "Place → all visits" |
| `moves` | `id, start_ts, end_ts, distance_km, duration_s, mode` | Dawarich `tracks` (11,4 mil trechos 2017–2026; `dominant_mode` → `walking`, `driving`…; `unknown` vira vazio). **Sem geometria**: `original_path` nunca é lido |
| `trips` | `id, name, start_day, end_day, cities, countries, distance_km` | Dawarich `trips` (+ `visited_countries`) + cidades por dia |
| `photos` | `asset_id, ts, day, type ('image'\|'video'), duration_s, city, country, albums, favorite` | Immich `asset`+`asset_exif`+`album_asset` (sem lat/lon; sem itens arquivados/lixeira) |
| `calendar` | `uid, start_ts, end_ts, day, all_day, title, calendar` | Nextcloud `oc_calendarobjects`/`oc_calendars` (principal `pereiraoc`), recorrência expandida até hoje+1 ano |
| `mail` | `msg_id, ts, day, mailbox, from_name, from_domain, subject` | Stalwart JMAP (conta `inbox@`, senha de app em `/var/lib/nas-secrets/life-mail.env`) |
| `home` | `ts, day, entity, label, state` | cópia de `home-history.sqlite` |

**Home:** célula ~1 km mais frequente de madrugada (0–6 h) numa **janela de 90 dias** centrada no dia (não por mês:
um hotel de três semanas venceria a moda do mês), e **nunca** dentro do intervalo de uma viagem do Dawarich. Lógica
extraída de `trips_detect.py` para um módulo comum; coordenadas só em memória.

**Dias e meia-noite:** as tabelas guardam `start_ts`/`end_ts`; quem monta o dia seleciona por **sobreposição** com
`[00:00, 24:00)` local (1.727 visitas cruzam a meia-noite). Sem coluna `day` em `visits`/`moves`.

`home-history.sqlite` (persistente, em `/srv/appdata/lifelog/`, entra no backup): append a cada hora pela API
`/api/history/period/<desde>` só das entidades de uma allowlist em Nix (`person.*`, `device_tracker.*` do celular
e as que ele escolher depois). O HA purga em 10 dias, então o histórico da casa começa na data em que isso ligar.

Cada fonte roda isolada: erro numa vira `meta.source:<x>=error:…` e o resto sai. Unidade com `OnFailure` do padrão
(`nas-notify-failure@`). Python: `python3.withPackages (ps: [ ps.icalendar ps.recurring-ical-events ])`; PATH com
`docker`.

## `pc.sqlite` (PC) — esquema

`pc-activity-export` (caelestia-arch-setup, timer de usuário de hora em hora):
- `commits(repo, hash, ts, day, subject, added, deleted)` — `git log --all --no-merges --numstat` de cada repo em
  `/data/projects/*` e dos vaults git; incremental por repo (último hash visto).
- `notes(vault, path, day, kind ('created'|'edited'), ts)` — vaults git: pelo `git log --name-status`; vaults sem git
  (OP Vault): snapshot de mtime a cada hora, então só a partir de hoje.
- Montar `/data/projects` no container foi descartado: exporia `.env`/chaves de todos os projetos ao shell do agente.

## Backend do Odysseus

`src/life/` (novo): um provedor por fonte, todos com a mesma interface:

```python
class Provider:
    name: str                       # 'takeout', 'places', 'photos', 'calendar', 'money', 'work', 'home', 'mail', 'health'
    def day(self, d: date) -> list[Item]: ...           # itens do dia
    def counts(self, start: date, end: date) -> dict[date, Counts]: ...  # para mês/ano
    def search(self, q: str, limit: int) -> list[Item]: ...
    def status(self) -> SourceStatus: ...               # ok / missing / stale (built_at > 26 h) / error
```

`Item` = `{id, kind, source, ts | None, end_ts | None, title, subtitle, url, open_url, place_ref, meta}`; `kind` é
a categoria de UI (place, move, untracked, photo, event, money, work, note, home, mail, digital, health); `open_url`
é o "Open original ↗" (Immich, Dawarich no dia, Nextcloud, YouTube, busca do Google, webmail, commit) — todo item
leva de volta à origem (Promnesia, Recall, Rewind). Provedor sem arquivo vira `missing` e não derruba o dia.

**Montagem do dia (servidor, `src/life/assemble.py`)** — a UI só desenha:
1. **Espinha.** Com visitas: visitas que sobrepõem o dia, em ordem, intercaladas com `move` (trechos) e com
   `untracked` para buracos ≥ 45 min sem visita nem trecho. A primeira visita que começou ontem vira
   "Home · since 19:40 (Mon)"; a última que termina amanhã, "until 08:10 (Wed)". Visitas seguidas do mesmo
   `place_id` sem trecho entre elas são juntadas. Visitas de baixa confiança (< 40) dobram num bloco
   "N brief stops". **Sem visitas** (antes de 2021, ou enquanto a fase 2 não existir): a espinha vira os blocos
   do dia — Night 0–6, Morning 6–12, Afternoon 12–18, Evening 18–24 —, só os que têm itens.
2. **Pendurar.** Cada item com hora entra no bloco da espinha que contém seu `ts`. Itens sem hora (finanças
   só têm data, eventos de dia inteiro) vão para a faixa **All day** no topo.
3. **Digital.** Em cada bloco, os itens `digital` viram um grupo `{counts_by_source, items_by_source}`: a linha
   recolhida diz "Digital · 6 searches, 2 videos (3 views)"; expandida, cada fonte mostra 3–5 itens e
   "+N more"; repetições do mesmo vídeo/URL/consulta no bloco viram uma linha "×3" com os horários; itens
   indisponíveis ("YouTube video (unavailable)") são contados à parte e ficam no fim. Blocos longos (> 3 h)
   quebram o grupo por hora.
4. **Resumo e números.** Frase-resumo por template (sem LLM); KPIs com zero ou sem fonte não aparecem
   ("No bank data" ≠ "R$ 0").

**Limpeza de títulos** (no provedor `takeout`, testada): tira os verbos "Watched/Searched for/Visited/Used" (o verbo
vira ícone); vídeo do YouTube cujo título é a própria URL vira "YouTube video (unavailable)"; canal vira subtítulo;
domínio vira subtítulo de visitas a sites.

**Rotas** (`routes/lifelog_routes.py`, todas exigem **admin**):

| Rota | Retorno |
|---|---|
| `GET /api/lifelog/day?d=` | `{day, summary, all_day[], blocks[{kind ('visit'\|'move'\|'untracked'\|'stops'\|'period'), start, end, label, sublabel, place_ref, items[], digital}], counts_by_kind, stats, trip, sources}` — uma chamada monta a página; a UI não recalcula nada |
| `GET /api/lifelog/month?m=YYYY-MM` | por dia: contagens por categoria, `cover_asset_id`, rótulo do lugar principal, viagem |
| `GET /api/lifelog/year?y=` | intensidade por dia (métrica escolhida), viagens do ano, totais por mês |
| `GET /api/lifelog/search?q=&kinds=&from=&to=&place=` | itens agrupados por dia, cada dia com cabeçalho-marco (lugar principal, capa, evento da agenda) e cada acerto com 1–2 vizinhos de contexto; cards "Place → all visits (N, last …)" / "Trip →" quando a consulta casa com um lugar ou viagem |
| `GET /api/lifelog/places?unnamed=1` | lugares por frequência/tempo total, para "Name your places" (link para o lugar no Dawarich) |
| `GET /api/lifelog/onthisday?d=` | o mesmo dia/mês em anos anteriores, resumido |
| `GET /api/lifelog/route?d=` | **ao vivo** (Dawarich `/api/v1/points`), pontos simplificados (Douglas-Peucker) + visitas com coordenada; `no-store` |
| `GET /api/lifelog/photo/{id}/thumb` e `/preview` | **ao vivo** (Immich `/api/assets/{id}/thumbnail`), `no-store`; id validado como UUID |
| `GET /api/lifelog/sources` | estado de cada fonte (para a tela de ajuda/vazio) |

Chaves no `.env` do compose (overlay `docker/pereiraoc.yml`): `LIFE_IMMICH_URL`, `LIFE_IMMICH_KEY`
(`asset.read`, `asset.view`), `LIFE_DAWARICH_URL`, `LIFE_DAWARICH_KEY`. Sem chave → recurso ao vivo `off`, o resto
funciona. Timeout curto (4 s) e cliente `httpx` compartilhado.

**Risco residual aceito:** as chaves ao vivo dão acesso a todo o Dawarich/Immich e o agente tem shell no container.
Mitigações: chaves só leitura, modo de aprovação de ferramentas em "ask", rotas admin, `no-store`. Documentado no
LOCAL_CHANGES.

## UI/UX

Princípios: o dia conta uma **história** (lugares são a espinha, o resto se pendura neles); **ruído agrupado**
(atividade digital vira blocos com contagem, expandíveis); **nada quebrado vira tela quebrada** (fonte fora →
aviso discreto no card dela); **hierarquia clara** (resumo → linha do tempo → detalhes); teclado de ponta a ponta;
tokens de cor do tema (claro/escuro), contraste AA, cor nunca sozinha (sempre ícone + rótulo); ícones SVG inline
(nada de emoji/glifo que vira caixinha); textos da UI em inglês; datas "Tue, 14 Mar 2023", horas 24 h.

### Moldura (todas as visões)

```
┌ Life ─────────────────────────────────────────────────────────────── _ □ × ┐
│ ‹ ›  2023 › March › 14        [Today]          [🔍 Search everything   /]  │
├────────────────────────────────────────────────────────────────────────────┤
│  (visão atual: Year | Month | Day | Search)                                │
└────────────────────────────────────────────────────────────────────────────┘
```
- Migalha `ano › mês › dia` é a navegação de zoom (cada parte clicável). `‹ ›` andam na unidade da visão atual.
- Teclado: `←/→` anterior/próximo, `↑` sobe um nível de zoom, `t` hoje, `/` busca, `Esc` fecha camadas.
- Janela grande por padrão (≈ 92 vw × 90 vh), maximizável, mesmo `modalManager` dos outros painéis.
- **Estado na URL** (`#life/2023-03-14`, `#life/2023-03`, `#life/2023`, `#life/search?q=…`): dá para voltar,
  favoritar e mandar o link; sem hash, reabre a última visão. Abre sempre numa visão concreta, nunca num feed
  curado (o erro caro do Photos no iOS 18). Cabeçalho de data fixo ao rolar.

### Dia (largura ≥ 1100 px: duas colunas; abaixo disso: uma, com mapa e fotos antes da linha do tempo)

```
┌ Tue, 14 Mar 2023 ───────────────────────────── ✈ Trip: Lisbon · day 2 of 6 ┐
│ Lisbon, PT · 4 places · 37 photos · R$ 212 spent · 11.2k steps             │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ [All 96][Places 4][Photos 37][Money 5]│ ┌ Map ────────────────────────────┐ │
│ [Calendar 2][Work 3][Digital 52]…    │ │  rota + pinos 1–4 (ao vivo)      │ │
│ ALL DAY  Money · 3 purchases R$ 212  │ └──────────────────────────────────┘ │
│          Calendar · Lisbon trip      │ ┌ Photos · 37 ─────────── See all › ┐ │
│ ① Home · since 19:40 (Mon) → 09:05   │ │ ▣▣▣▣▣▣ (grade, lightbox)          │ │
│   ▸ Digital · 6 searches, 2 videos   │ └──────────────────────────────────┘ │
│ ⋯ Walking · 25 min · 2.1 km          │ ┌ Day in numbers ──────────────────┐ │
│ ② Unnamed place · Lisbon 09:30–13:10 │ │ steps · km · active min · spent   │ │
│   12th visit · 3 h 40  ↗             │ │ income · AI sessions · commits    │ │
│   ▣▣▣▣ 14 photos                     │ └──────────────────────────────────┘ │
│   14:00 Calendar · Museum booking    │ ┌ Notes ─┐ ┌ On this day ──────────┐ │
│ ░ Untracked · 13:10–15:00            │ │ …      │ │ 3 years ago · …   ›   │ │
│ ③ 3 brief stops                      │ └────────┘ └───────────────────────┘ │
│ …                                    │  Sources: Takeout ✓ · Places ✓ · …   │
└──────────────────────────────────────┴─────────────────────────────────────┘
```
- **Cabeçalho do dia:** data, frase-resumo gerada (cidade principal · lugares · fotos · gasto · passos) e selo de
  viagem quando houver.
- **Linha do tempo** (montada no servidor, ver "Montagem do dia"): visitas são blocos com faixa de horário, número
  que casa com o pino do mapa, linha secundária "12th visit · 3 h 40" e "↗" (abre o lugar no Dawarich para nomear/
  corrigir — "changes show up within an hour"); entre visitas, uma linha por trecho ("Walking · 25 min · 2.1 km",
  expandível quando houver vários); buracos viram "Untracked · hh:mm–hh:mm"; paradas incertas dobram em
  "N brief stops". Itens com hora entram no bloco em que caem (fotos como mini-tira, agenda, e-mails, casa
  "Arrived/Left home"); a linha "Digital" segue as regras da montagem. A faixa **All day** fica no **topo**, como
  nas agendas.
- **Rótulos honestos:** nunca "Suggested place"; "Unnamed place · <city>" e "Unknown location" aparecem em tom
  secundário, com o "↗" para nomear. Estados distintos e explícitos: NAS fora ("Map needs the NAS (VPN)"),
  "No location recorded" no dia, "Before location tracking started" (antes de 2017/2021 conforme a fonte).
- **Filtros:** chips por categoria com contagem; categorias vazias somem; filtrar **mantém a espinha** (cabeçalhos
  de visita/bloco) e esconde só os itens das outras categorias; estado lembrado.
- **Mapa ↔ lista:** passar o mouse num bloco acende o pino/trecho e esmaece o resto; clique enquadra; pino com
  selo de número de fotos (padrão do Dawarich 1.3/1.14 e do Timelinize).
- **Coluna direita:** mapa (Leaflet vendorizado em `static/lib/leaflet/`, tiles raster do OpenStreetMap — permitidos
  pelo CSP `img-src https:`), fotos (grade de até 12 + "See all", lightbox com hora/lugar, ←/→ e "Open in
  Immich"; vídeo abre no Immich), números do dia, "On this day" e rodapé
  **Sources** (última atualização e início da cobertura de cada fonte).
- **Celular / < 1100 px:** mapa compacto no topo (como no Arc), depois a linha do tempo com as fotos em mini-tira
  dentro das visitas, depois grade, números e notas; navegação sempre visível.
- **Dia vazio:** "Nothing recorded on this day" + atalhos para os dias com dados mais próximos.
- Carregamento: esqueletos; o dia vem numa chamada, mapa e imagens chegam depois (lazy, `IntersectionObserver`).
- Notas (Keep; Obsidian na fase 4) entram na linha do tempo como itens com hora, não num cartão à parte (evita
  mostrar a mesma coisa duas vezes).

### Name your places
Lista dos lugares sem nome por número de visitas / tempo total ("Unnamed place · Porto Alegre — 412 visits,
1.240 h"), cada um com "Name in Dawarich ↗" e "See visits". Entrada pela barra lateral do Life e por um aviso
discreto no dia ("Most places here have no name — name your frequent places"). É o caminho barato para a espinha
ganhar nomes sem geocodificador.

### Mês
Grade de calendário (semana começando na segunda). Cada célula: número do dia, miniatura de capa (favorita do
Immich, senão a primeira foto que não seja screenshot/vídeo; sem NAS ou sem foto, tingimento pela métrica escolhida
no ano), rótulo do lugar principal, ícones pequenos (agenda, gasto, viagem). Célula sem dado é neutra (≠ zero).
Viagens desenham uma faixa fina sobre os dias, rotulada no primeiro dia de cada semana (padrão sem precedente nas
fontes — validar no uso). Clique → dia. Ao lado, totais do mês (fotos, gasto, km, lugares novos). No celular: só
número, capa/tingimento e um ponto.

### Ano
Mapa de calor por dia (semanas em colunas, como o do Dawarich) com seletor de métrica: **Photos, Places, km moved,
Spent, Steps, Digital** e **Where** (categórica: cidade de casa / outra cidade / exterior). Legenda com **faixas
fixas** e topo cortado ("25+"), nunca relativa a um dia extremo; "sem dado" hachurado ≠ zero; viagens como
contorno; sem pares vermelho-verde; conferido no tema escuro. Lista de viagens do ano (cards com datas e cidades);
pequenos gráficos mensais (fotos, gasto, km). Clique em dia → dia; em mês → mês. Substitui o "Trends" atual (que
contava eventos por produto do Google).

### Busca
É a ferramenta principal (Rewind/Recall/LSC), não um acessório: campo sempre visível na moldura (`/`). Resultados
agrupados por dia, cada dia com cabeçalho-marco (lugar principal, capa, evento) e cada acerto com 1–2 vizinhos de
contexto e o trecho destacado; facetas de categoria, período e lugar; quando a consulta casa com um lugar ou uma
viagem, card no topo "Place → all visits (N, last …)" / "Trip →". Enter abre o dia com o item destacado e rolado
até ele.

### On this day
Uma linha por ano ("3 years ago · Sat, 6 Nov 2023") com capa, frase-resumo e tira de até 4 fotos; anos vazios
colapsados; "±3 days" quando a data exata está vazia; mais recente primeiro.

## Fases (cada uma entrega algo usável e testado)

1. **Painel novo sobre os dados que já existem:** `src/life/` com provedores takeout, money (finanças), work (Uso de
   IA), health (Fit), notes (Keep) e a montagem do dia com a espinha de **blocos do dia**; rotas day/month/year/
   search/onthisday/sources; UI nova completa (moldura com URL, dia, mês, ano, busca, On this day) sem mapa/fotos;
   admin nas rotas; substitui `lifelog.js`.
2. **NAS `services.sqlite`:** `nas-life-services` (visits/places/moves/trips/photos/calendar/mail/home) + sync de
   hora em hora; provedores places, photos (metadados), calendar, mail, home; espinha de visitas (since/until,
   Untracked, brief stops); "Name your places". Antes: atualizar o Dawarich para ≥ 1.21.0 no NAS.
3. **Ao vivo:** chaves Immich/Dawarich; rotas `/route` e `/photo/*`; mapa Leaflet e fotos na UI.
4. **PC `pc.sqlite`:** `pc-activity-export` + provedores commits/notas.

## Testes

- **NAS:** pytest com saídas falsas de `docker exec`/HTTP por fonte; teste de privacidade (nenhuma coluna/valor de
  lat/lon no `services.sqlite`; `Private/`/WhatsApp nunca lidos); fonte com erro não derruba as outras; acúmulo do HA
  idempotente.
- **PC:** pytest com repos git temporários (incremental, merges fora, numstat).
- **Odysseus:** provedores com SQLite temporários; limpeza de títulos; rotas (admin obrigatório, `no-store` nas ao
  vivo, NAS fora → 200 com `sources` explicando); testes estáticos do upstream (token de CSS, precache); checagem
  visual com Chromium headless no container (1440 e 390 px, tema claro e escuro, sem erros de console).
- Suíte completa dentro da imagem comparada com o upstream puro (procedimento do LOCAL_CHANGES).

## Refinamentos depois das fases (P2 da pesquisa)

Deltas contra a mediana de 30 dias nos números do dia; selos "First visit" / "First time in <city>"; aviso "times
in BRT" quando o país da visita não é o Brasil; exclusões no On this day (datas que não devem ressurgir) e "hide all
from this source".

**Não acrescentar** (a pesquisa desaconselha): abas Insights/Cities/Places por categoria ("not terribly useful"),
correlações estilo Exist, fila de revisão de visitas (o Dawarich removeu a dele).

## Fora do escopo

Geocodificador próprio (Photon), navegador completo do Immich, Library inteira no Files, ferramentas do agente,
importar o Gmail antigo, fuso por localização.
