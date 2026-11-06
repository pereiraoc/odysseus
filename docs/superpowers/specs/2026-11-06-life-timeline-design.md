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
5. Lugares sem nome no Dawarich (1.155 de 1.222 são "Suggested/Unknown"): rótulo por prioridade
   **nome da visita → "Home" detectada → cidade** (base offline `geodata_places` do Immich). Bairro/estabelecimento
   exige geocodificador próprio (Photon) — projeto futuro, fora daqui.

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
| `visits` | `id, start_ts, end_ts, day, label, kind ('named'\|'home'\|'city'\|'unknown'), city, country` | Dawarich `visits`+`places`; Home = célula ~1 km mais frequente de madrugada no mês (lógica de `trips_detect.py`, extraída para módulo comum); cidade = `geodata_places` mais perto |
| `moves` | `day, distance_km, points` | Dawarich `points` (haversine em memória; só o agregado sai) |
| `trips` | `id, name, start_day, end_day, cities, countries` | Dawarich `trips` + cidades por dia |
| `photos` | `asset_id, ts, day, type ('image'\|'video'), duration_s, city, country, albums, favorite` | Immich `asset`+`asset_exif`+`album_asset` (sem lat/lon; sem itens arquivados/lixeira) |
| `calendar` | `uid, start_ts, end_ts, day, all_day, title, calendar` | Nextcloud `oc_calendarobjects`/`oc_calendars` (principal `pereiraoc`), recorrência expandida até hoje+1 ano |
| `mail` | `msg_id, ts, day, mailbox, from_name, from_domain, subject` | Stalwart JMAP (conta `inbox@`, senha de app em `/var/lib/nas-secrets/life-mail.env`) |
| `home` | `ts, day, entity, label, state` | cópia de `home-history.sqlite` |

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

`Item` = `{id, kind, source, ts | None, end_ts | None, title, subtitle, url, place_ref, meta}`; `kind` é a
categoria de UI (place, move, photo, event, money, work, note, home, mail, digital, health). Provedor sem arquivo vira
`missing` e não derruba o dia.

**Limpeza de títulos** (no provedor `takeout`, testada): tira os verbos "Watched/Searched for/Visited/Used" (o verbo
vira ícone); vídeo do YouTube cujo título é a própria URL vira "YouTube video (unavailable)"; canal vira subtítulo;
domínio vira subtítulo de visitas a sites.

**Rotas** (`routes/lifelog_routes.py`, todas exigem **admin**):

| Rota | Retorno |
|---|---|
| `GET /api/lifelog/day?d=` | `{day, summary, items, visits, stats, trip, sources}` — uma chamada monta a página |
| `GET /api/lifelog/month?m=YYYY-MM` | por dia: contagens por categoria, `cover_asset_id`, rótulo do lugar principal, viagem |
| `GET /api/lifelog/year?y=` | intensidade por dia (métrica escolhida), viagens do ano, totais por mês |
| `GET /api/lifelog/search?q=&kinds=&from=&to=` | itens agrupados por dia |
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
- Janela grande por padrão (≈ 92 vw × 90 vh), maximizável, mesmo `modalManager` dos outros painéis; lembra a
  última visão e data.

### Dia (largura ≥ 1100 px: duas colunas; abaixo disso: uma, com mapa e fotos antes da linha do tempo)

```
┌ Tue, 14 Mar 2023 ───────────────────────────── ✈ Trip: Lisbon · day 2 of 6 ┐
│ Lisbon, PT · 4 places · 37 photos · R$ 212 spent · 11.2k steps             │
├──────────────────────────────────────┬─────────────────────────────────────┤
│ [All 96][Places 4][Photos 37][Money 5]│ ┌ Map ────────────────────────────┐ │
│ [Calendar 2][Work 3][Digital 52]…    │ │  rota + pinos 1–4 (ao vivo)      │ │
│                                      │ └──────────────────────────────────┘ │
│ 08:10–09:05  ① Home                  │ ┌ Photos · 37 ─────────── See all › ┐ │
│   ▸ Digital · 6 searches, 2 videos   │ │ ▣▣▣▣▣▣ (grade, lightbox)          │ │
│ 09:05  Moving · 25 min · 8 km        │ └──────────────────────────────────┘ │
│ 09:30–13:10  ② Belém, Lisbon         │ ┌ Day in numbers ──────────────────┐ │
│   ▣▣▣▣ 14 photos                     │ │ steps · km · active min · spent   │ │
│   12:40  R$ 48,00  Pastéis de Belém  │ │ income · AI sessions · commits    │ │
│ 14:00  Calendar · Museum booking     │ └──────────────────────────────────┘ │
│ …                                    │ ┌ Notes ─┐ ┌ On this day ──────────┐ │
│ All day  Money · 3 card purchases    │ │ …      │ │ 2019 · 2021 · 2022 ›  │ │
└──────────────────────────────────────┴─────────────────────────────────────┘
```
- **Cabeçalho do dia:** data, frase-resumo gerada (cidade principal · lugares · fotos · gasto · passos) e selo de
  viagem quando houver.
- **Linha do tempo:** visitas são blocos com faixa de horário e número que casa com o pino do mapa; entre visitas,
  linha "Moving · duração · km". Itens com hora entram no bloco em que caem (fotos como mini-tira, compras, agenda,
  e-mails, casa "Arrived/Left home"). Atividade digital (Search, YouTube, Play, Maps, Assistant…) agrupada por
  visita/hora em uma linha "Digital · 6 searches, 2 videos" que expande para os itens limpos. Itens sem hora
  (finanças só têm data) num bloco "All day" no fim.
- **Filtros:** chips por categoria com contagem; categorias vazias somem; estado lembrado.
- **Coluna direita:** mapa (Leaflet vendorizado em `static/lib/leaflet/`, tiles raster do OpenStreetMap — permitidos
  pelo CSP `img-src https:`; sem NAS: "Map needs the NAS (VPN)"), fotos (grade de até 12 + "See all", lightbox com
  ←/→; vídeo abre no Immich), números do dia, notas (Keep e Obsidian editadas), "On this day".
- **Dia vazio:** "Nothing recorded on this day" + atalhos para os dias com dados mais próximos.
- Carregamento: esqueletos; o dia vem numa chamada, mapa e imagens chegam depois (lazy, `IntersectionObserver`).

### Mês
Grade de calendário (semana começando na segunda). Cada célula: número do dia, miniatura de capa (foto do dia; sem
NAS, cor de intensidade), rótulo do lugar principal, ícones pequenos (agenda, gasto, viagem). Viagens desenham uma
faixa contínua sobre os dias. Clique → dia. Ao lado, totais do mês (fotos, gasto, km, lugares novos).

### Ano
Mapa de calor por dia (semanas em colunas) com seletor de métrica (Activity, Photos, Places, Spent, Steps);
lista de viagens do ano (cards com datas e cidades); pequenos gráficos mensais (fotos, gasto, km). Clique em dia →
dia; em mês → mês. Substitui o "Trends" atual.

### Busca
Um campo para tudo; resultados agrupados por dia, com a categoria e o trecho destacado; filtros por categoria e
período; Enter abre o dia com o item destacado e rolado até ele.

## Fases (cada uma entrega algo usável e testado)

1. **Painel novo sobre os dados que já existem:** `src/life/` com provedores takeout, money (finanças), work (Uso de
   IA), health (Fit), notes (Keep); rotas day/month/year/search/onthisday/sources; UI nova completa (dia, mês, ano,
   busca) sem mapa/fotos; admin nas rotas; substitui `lifelog.js`.
2. **NAS `services.sqlite`:** `nas-life-services` (visits/moves/trips/photos/calendar/mail/home) + sync de hora em
   hora; provedores places, photos (metadados), calendar, mail, home no Odysseus.
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

## Fora do escopo

Geocodificador próprio (Photon), navegador completo do Immich, Library inteira no Files, ferramentas do agente,
importar o Gmail antigo, fuso por localização.
