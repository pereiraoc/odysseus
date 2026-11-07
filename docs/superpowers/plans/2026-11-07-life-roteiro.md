# Life — roteiro dos próximos apps (estado em 2026-11-07)

Ordem combinada: hub → **Location** → Media → People → Health → Career → Wallet. Embasamento:
`docs/superpowers/research/2026-11-07-hub-life-e-apps.md` (seções por app; a tabela "Aba do Location" é a base do v1).

## Feito

- **Hub** (Diary, Finances, AI usage), no fork até `055b6802`. Pendências em
  `docs/superpowers/specs/2026-11-07-life-hub-design.md` § "Pendências conhecidas".
- **Diary fase 1** (Takeout, Finances, AI usage, Fit, Keep). **Fases 2–4 do Diary não foram feitas**
  (`services.sqlite` no NAS, chaves ao vivo, `pc.sqlite`): hoje o Odysseus não tem nenhum dado do Dawarich nem do
  Immich.

## Location — levantamento de 07/11 (só contagens; nenhuma coordenada saiu do NAS)

**Infra**
- Dawarich **1.20.1** (versão fixa em `nas-nixos/services/dawarich/compose.yaml`), Postgres `dawarich_db`
  (postgis 17-3.5), 2 usuários. Immich v3 (`immich_server`, banco `immich_postgres`).
- `ssh root@nas` funciona. Deploy do NAS: `nix run nixpkgs#nixos-rebuild -- switch --flake .#nas --target-host root@nas`.
- O container do Odysseus alcança os sites privados `*.pereiraoc.com` (NetBird 100.x, Caddy): `timeline.pereiraoc.com/api/v1/health` → 200.
- Padrões a copiar no `nas-nixos`: serviço Python em sandbox (`modules/sala-web.nix`), site privado com
  `gate = true; gateExcept = [ "/api/*" ]` (como `music` em `hosts/nas/services.nix`), leitura do Postgres por
  `docker exec … psql` (`services/library/trips_detect.py`).
- Mapa base: o Dawarich usa tiles vetoriais externos (`tyles.dwri.xyz`, Protomaps); o NAS não tem servidor de tiles.

**Dados (tabelas do Dawarich)**

| Tabela | Volume | Uso no Location |
|---|---|---|
| `points` | 169.940 (2017-09-03 → 2026-11-07), 5.340 `anomaly` | células H3 por permanência (tempo até o ponto seguinte, teto 300 s; sem `anomaly`) |
| `tracks` / `track_segments` | 11.380 trechos; `dominant_mode` e `transportation_mode` inteiros | distância e modo por dia/mês/ano |
| `visits` | 6.714 (6.328 com `place_id`; nenhuma apagada) | lugares, "When was I here?" |
| `places` | 1.222, só **67 com nome** | aba Places (agrupar sem nome por tempo total) |
| `trips` | 98 (2020-12-25 → 2026-11-03), `visited_countries` jsonb, `distance`, `path` | aba Trips |
| `digests` | 12 (6 + 6 por `period_type`), jsonb de distâncias, primeiras visitas, ano contra ano | aba Years |
| `stats` | 108 meses, `daily_distance`, `h3_hex_ids` (13.331) | números por mês |
| `tags.privacy_radius_meters` | nenhuma zona de privacidade configurada hoje | o serviço tem de aplicar quando houver |
| `flights` | 0 | — |

Tamanho estimado das células: ~15 mil células de ~200 m (proxy da resolução 9), ~4,4 mil de ~1,4 km (resolução 7) e
~50 mil pares (célula, dia) na resolução 9. Cabe folgado num SQLite no NAS **com granularidade por dia**, o que
permite filtrar por ano, viagem ou intervalo sem recalcular.

## Location — decisões propostas

1. **Tudo calculado no NAS, sem chave de API.** Timer `nas-life-geo-build` (root, de hora em hora): `docker exec psql
   COPY` do Dawarich e do Immich → Python com `h3` (nixpkgs `python3Packages.h3`) → `/srv/appdata/life-geo/geo.sqlite`
   (`cells(res, cell, lat, lon)`, `cell_day(res, cell, day, secs, points)`, lugares, visitas, viagens, anos,
   `photo_cells(res, cell, count, cover_asset)`). Serviço `nas-life-geo` em sandbox (127.0.0.1:91xx, só leitura no
   SQLite e nas miniaturas do Immich), site privado `geo.pereiraoc.com` com `gateExcept = [ "/api/*" ]` e token
   bearer (segredo em `/var/lib/nas-secrets`; no Odysseus, `.env`: `LIFE_GEO_URL`, `LIFE_GEO_TOKEN`).
2. **Odysseus só repassa:** `routes/life_location_routes.py` → `/api/life/location/*` (admin, `Cache-Control:
   no-store`, nada em disco, timeout curto). NAS fora → 200 com `status: offline` e estado vazio em inglês.
3. **Privacidade:** célula = coordenada. Nada de viewport/centro do mapa no hash nem no `memory.routes` do hub
   (localStorage); no hash só filtros (ano, intervalo, viagem, aba). Polígonos GeoJSON gerados no NAS (sem h3-js no
   navegador), com teto de células por resposta.
4. **Mapa:** MapLibre GL JS copiado para `static/` (CSP: `worker-src blob:` e o host do mapa base em `connect-src`/
   `img-src`). Resolução por zoom pela tabela da pesquisa, cor por quantis/log com faixas fixas, célula nunca menor
   que ~10 px; clicar abre "When was I here?" (tempo total, dias, primeira/última vez, lista de dias → Diary).
5. **Camada de fotos** (desligada por padrão): fotos/vídeos com GPS do Immich agregados nas mesmas células (contagem +
   capa); miniaturas servidas pelo serviço do NAS a partir dos arquivos (`asset_file`), sem chave do Immich; clicar
   abre grade paginada que respeita o filtro de datas.
6. **Dawarich 1.21:** não é pré-requisito do v1 (o rótulo vem de `places.name` por `place_id`). Atualizar antes de
   nomear lugares em massa, para as visitas do próprio Dawarich seguirem o nome.

**A decidir pelo usuário:** provedor do mapa base. Qualquer provedor externo fica sabendo da área vista, como já
acontece no Dawarich. Opções: CARTO raster claro/escuro (mais simples), OpenFreeMap (vetorial, sem chave) ou
Protomaps `.pmtiles` no NAS (privado, dá mais trabalho).

## Location — o que falta (tarefas em ordem)

NAS (`nas-nixos`):
1. `scripts/life-geo-build.py` + testes com saída falsa do `psql` (células por resolução 2–10 e dia, lugares,
   viagens, anos, células de fotos; teste de que nada sai sem token; zonas de privacidade aplicadas).
2. `scripts/life-geo-serve.py` + testes: `/api/status`, `/api/cells?res&bbox&from&to`, `/api/cell/<id>`,
   `/api/trips`, `/api/trip/<id>`, `/api/places`, `/api/place/<id>`, `/api/years`, `/api/photos/cells`,
   `/api/photos?cell&from&to`, `/api/thumb/<asset>`.
3. `modules/life-geo.nix` (timer + serviço em sandbox), site `geo` em `hosts/nas/services.nix`, segredo; deploy.

Odysseus:
4. Rotas de repasse + testes (admin, `no-store`, NAS fora).
5. MapLibre copiado + CSP + app `static/js/life/apps/location.js` (abas Map, Trips, Places, Years); `APP_IDS` do
   router e o trilho ganham `location`.
6. Aba Map (células, legenda, painel da célula → Diary). 7. Trips (grade com filtros no hash; detalhe com países e
   km, cidades, itinerário por dia, fotos). 8. Places (grupos sem nome por tempo total, "Name in Dawarich ↗";
   página do lugar). 9. Years (digests + stats, ano contra ano, recordes). 10. Camada de fotos.
11. Links cruzados: Diary → Location (viagem do dia, células do dia), viagem → Finances (`from`/`to` da viagem).
12. Checagem visual, deploy, LOCAL_CHANGES.

Depois do Location dá para reaproveitar o mesmo build no NAS para a **fase 2 do Diary** (visitas, trechos, viagens e
fotos sem coordenada para a espinha do dia).

## Próximos apps (resumo; detalhes na pesquisa)

- **Media:** lente sobre o Immich (~50 mil itens). Os endpoints de linha do tempo da API mudam a cada versão → agregar
  no NAS como no Location e servir miniaturas pelo mesmo serviço. A aba Places é a camada de fotos do Location.
- **People:** contatos (Takeout/Nextcloud) + rostos do Immich, ligados numa tabela própria do Odysseus (pessoa ↔
  contato); seções por app com "See all in <App>".
- **Health:** década do Google Fit (Takeout) + Samsung Health (exportação do celular e Health Connect por webhook);
  trocar o Samsung Health exige trocar de relógio.
- **Career:** a partir de PDFs (histórico escolar, CTPS digital, CNIS para o histórico de salários, informes de
  rendimento, exportação do LinkedIn); brag log como única escrita manual.
- **Wallet:** documentos de identidade só cifrados de ponta a ponta fora do container (Vaultwarden no NAS); o
  Odysseus guarda só metadados e vencimentos.

## Ações do usuário que não esperam código

- Refazer o Takeout do Google Fit antes do desligamento do serviço.
- Subir o Vaultwarden antes de guardar qualquer documento.
- Escolher o mapa base do Location (acima).
- Opcional: atualizar o Dawarich para ≥ 1.21 antes de nomear lugares.
- Corrigir o CSV mensal de Finances (bug antigo, ver pendências do hub).
