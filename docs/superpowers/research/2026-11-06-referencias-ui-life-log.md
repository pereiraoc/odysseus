# Espinha de lugares exige nomes e lacunas honestas

O spec do painel Life (06/11/2026) aposta no que a evidência sustenta: dia como página, lugares como espinha e ruído digital agrupado. Os melhores produtos de linha do tempo pessoal chegaram ao mesmo formato por caminhos independentes: o Arc Timeline 4 ("A day, visit by visit"), o Timeline do Dawarich desde a 1.12.0, o Google Maps Timeline e o Timelinize, que é o análogo multi-fonte mais próximo do Odysseus. A pesquisa não muda tanto a forma da tela quanto o que está por baixo dela. Nesses produtos as reclamações mais fortes dos usuários tratam de rótulos de lugar genéricos ("Suggested place" é a issue de timeline mais votada do Dawarich), de dias que "começam em lugar nenhum" por causa da meia-noite, de estadias fragmentadas e de buracos silenciosos. O Odysseus tem 94% dos lugares sem nome (1.155 de 1.222) e nenhum geocodificador reverso. Por isso as mudanças mais urgentes no spec são de dados e de rótulo:

- exportar trechos de deslocamento, não só o total de km do dia;
- buscar as visitas pela sobreposição com o dia;
- mostrar linhas "Untracked" explícitas;
- levar a confiança e o `place_id` de cada visita, sem coordenadas;
- criar uma lista "nomeie seus lugares mais frequentes" que leve ao Dawarich, onde dar nome uma vez corrige o histórico.

Na camada visual, cinco padrões se confirmam:

- passar o mouse na lista acende o trecho no mapa;
- a atividade digital vira uma linha com contagem que expande para poucos itens por fonte;
- todo item tem "abrir no original";
- a escada de zoom é estável (o recuo do Photos do iOS 18 mostra quanto custa trocar navegação por feed curado);
- os mapas de calor usam faixas fixas e separam "sem dado" de "zero".

A busca merece mais peso do que o spec lhe dá: quem construiu e quem estudou arquivos pessoais (Rewind, Recall, Lifelog Search Challenge) conclui que buscar é a ferramenta principal e que a linha do tempo serve de contexto. Nenhum estudo com usuários compara "lugares como espinha" com um feed cronológico plano. O apoio vem da convergência entre produtos, não de experimento.

*Como ler.* Frase com link é um fato afirmado pela fonte (pesquisa feita em 06/11/2026). "(trecho de busca)" marca uma fonte vista só no resumo do buscador, com confiança menor. **Inferência** marca uma conclusão ou recomendação deste relatório, sem fonte direta. O Reddit e a Wayback Machine estavam bloqueados para os pesquisadores, e quase nenhuma captura de tela pôde ser vista: as descrições visuais vêm de texto. A lista completa de links consultados está no apêndice.

## Uma dúzia de produtos mostra o caminho, e nenhum cobre tudo

As referências úteis se dividem em quatro famílias:

- **linhas do tempo de localização**, que resolvem o dia: Arc, Dawarich e Google;
- **agregadores multi-fonte**, que resolvem a mistura de fontes: Timelinize, Exist, Gyroscope e a pilha HPI/Promnesia;
- **diários e fotos**, que resolvem mês, ano e "neste dia": Day One, Apple Photos, Apple Journal e Immich;
- **atividade digital e busca**, que resolvem o volume e a recuperação: Google My Activity, Recall, Rewind e os sistemas do Lifelog Search Challenge.

A tabela resume o que copiar de cada um e o que os usuários disseram.

| Produto e estado (nov/2026) | O que vale copiar | Elogios e críticas documentados |
|---|---|---|
| **Arc Timeline 4** (iOS, ativo, v1.8.0) ([site](https://www.bigpaua.com/arcapp/)) | Mapa do dia acima ou ao lado da lista de visitas e viagens; fotos "placed with the visit or trip they belong to"; endereço em vez de "Unknown Place" desde a v1.6.0; atalho "When Was I Last At…" | "What Google Timeline should have been"; a migração perdeu correções manuais ([App Store](https://apps.apple.com/us/app/arc-timeline-4/id6740688708)); no Arc 3, "there is so much information here" ([App Store, Arc 3](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918)) |
| **Dawarich, Timeline do Map v2** (ativo; v1.21.0 em 04/11/2026; o Odysseus usa a 1.20.1) | Lacunas "untracked", confiança como peso visual, nome de POI só com evidência, hover lista↔mapa, Insights com heatmap estilo GitHub e calendário do ano por país ([1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0), [1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0)) | "Suggested place" genérico é a issue mais votada ([#583](https://github.com/Freika/dawarich/issues/583), [#1281](https://github.com/Freika/dawarich/issues/1281)); dias que começam "no where" ([#3624](https://github.com/Freika/dawarich/issues/3624)); fuso ([#3886](https://github.com/Freika/dawarich/issues/3886)) |
| **Google Maps Timeline** (só no celular; a versão web saiu) ([Help](https://support.google.com/maps/answer/6258979)) | Dia = mapa com pontos coloridos por atividade + lista; "Your visits and Maps history" a partir de um lugar | Perda da navegação em tela grande ([HN](https://news.ycombinator.com/item?id=40583946)); dados apagados em mar/2025 ([9to5Google](https://9to5google.com/2025/03/07/google-maps-timeline-missing/)); Insights "generally interesting, but not terribly useful" ([Android Police](https://www.androidpolice.com/i-gave-google-maps-timeline-another-chance-and-it-totally-won-me-over/)) |
| **Timelinize** (pré-1.0, v0.0.28 de out/2025, ritmo caindo) ([site](https://timelinize.com/)) | 11 classificações de item; agrupamento por categoria com corte por lacuna (1,75σ) e teto por grupo; mapa antes dos itens daquele lugar; selo da fonte ([common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)) | 630 pontos no HN, com críticas à importação e à atualização, não às telas ([HN](https://news.ycombinator.com/item?id=45504973)); limite de 2.000 itens sem paginação ([timeline.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/timeline.js)) |
| **Day One** (ativo) ([calendário](https://dayoneapp.com/guides/calendar-view-in-day-one/)) | Célula do calendário com cor ou foto de capa escolhida pelo usuário; Today view por data; On This Day na web desde set/2025 | Pedidos de "last week / last month" e de personalização no fórum ([fórum](https://forums.dayoneapp.com/forums/topic/add-last-week-and-last-month-to-on-this-day-feature)) |
| **Apple Photos** (iOS 18 → 26) | Escada Years / Months / All; Years mostra uma foto "from this date in that year" ([5 Minute Photos](https://5minutephotos.substack.com/p/apple-photos-on-the-iphone-part-1)); Recent Days esconde screenshots e recibos | iOS 18: "There is no sense of place", "Suggestions-first" ([Tsai](https://mjtsai.com/blog/2024/06/13/redesigned-photos-app-in-ios-18)); a tab bar voltou no iOS 26 |
| **Apple Journal** (iOS/macOS 26) | A sugestão ("moment") junta fotos, rota, música e passos de uma saída num card ([MacStories](https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/)) | No Mac/iPad parece um app de iPhone esticado, "functional but uninspiring" (trecho de busca) ([Numeric Citizen](https://numericcitizen.me/reviewing-apple-journal-a-summer-experiment/)) |
| **Immich** (ativo; é a fonte de fotos do Odysseus) | Faixa de memórias renovada todo dia; mapa com clusters que abrem uma tira cronológica ([PixelUnion](https://pixelunion.eu/blog/2026/05/immich-map-view/)) | Ordem das memórias ([#8275](https://github.com/immich-app/immich/issues/8275)); barra de rolagem que some ([#30961](https://github.com/immich-app/immich/discussions/30961)); travamento em meses enormes ([#31360](https://github.com/immich-app/immich/discussions/31360)) |
| **Exist.io** (ativo) ([site](https://exist.io/)) | Prioridade por atributo, com os de baixa prioridade escondidos; chips como "$52 spent"; calendário do mês tingido por uma métrica; comparação com a média | 35% querem mais análise; 33% não sabiam que os subgrupos existiam ([pesquisa 2025](https://exist.io/blog/exist-survey-2025/)) |
| **Google My Activity** (ativo) ([Help](https://support.google.com/accounts/answer/465)) | Navegação por dia, busca, filtros de produto e data, "Delete Results"; no app, prévia de 4 itens + "[x] items" ([9to5Google](https://9to5google.com/2025/05/24/google-app-activity-tab-wide/)) | Os "bundles" de 2016 não aparecem mais na ajuda atual |
| **Microsoft Recall** (opt-in, só em Copilot+) e **Rewind** (encerrado em dez/2025) | Busca primeiro; filtro por app; resultados "Close / Related match"; botão para voltar ao app de origem ([Microsoft](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)) | "Search is the decisive feature"; rolar a linha do tempo é "cumbersome" ([Fresh van Root](https://freshvanroot.com/blog/review-rewindai/)) |
| **Gyroscope / April Zero** e **Feltron** (históricos) | Localização como "the backbone for all the other data" ([TechCrunch](https://techcrunch.com/2014/08/07/this-guy-tracks-everything-about-himself-and-puts-it-up-online-for-everyone-to-see)); relatório anual que troca páginas quando falta dado; página "Sources" | O Gyroscope hoje é um coach de saúde com IA ([gyrosco.pe](https://gyrosco.pe/)) |

Dois destaques. O **Timelinize** é o parente mais próximo do Life: SQLite local, várias fontes, uma linha do tempo por dia. Mesmo assim, a última versão é **v0.0.28, de 17/10/2025**, o último push foi uma atualização de dependências em maio de 2026, a busca de texto completo segue como proposta aberta ([#42](https://github.com/timelinize/timelinize/issues/42)) e o "this day in history" segue como pedido aberto desde 2024 ([#8](https://github.com/timelinize/timelinize/issues/8)) ([releases](https://github.com/timelinize/timelinize/releases)). Ele serve de referência de modelo e de agrupamento, não de produto acabado. O **Arc Timeline 4** é a melhor experiência de dia de localização, mas é só para iOS e de um desenvolvedor só.

O contexto de mercado reforça a arquitetura do Odysseus. O Google tirou o Timeline da web e depois apagou o histórico de parte dos usuários. O Rewind/Limitless foi comprado pela Meta e deu **14 dias** para exportar antes de apagar os dados no Brasil e na UE ([9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)). O Gyroscope trocou o lifelog por saúde. A cópia local que o Odysseus mantém é justamente o que esses usuários perderam.

## Lugares como espinha têm precedente; o gargalo é dar nome a eles

### O que os produtos de localização fazem

A tese de que a localização organiza todo o resto tem doze anos. Anand Sharma chamou a localização de "**the backbone for all the other data**" no April Zero, embrião do Gyroscope ([TechCrunch, 2014](https://techcrunch.com/2014/08/07/this-guy-tracks-everything-about-himself-and-puts-it-up-online-for-everyone-to-see)). No relatório diário do Gyroscope, a linha do tempo de lugares ficava no pé da página, e os dias antigos eram acessados pelo relatório mensal ([Gyroscope, 2019](https://gyrosco.pe/timeline/2019-10-02/gyroscope-places-update/)). Hoje o Arc descreve o dia como uma lista de visitas e viagens sob o mapa das rotas, com cada foto presa à visita ou viagem em que foi tirada; no iPhone dobrável, mapa e lista ficam lado a lado ([bigpaua.com](https://www.bigpaua.com/arcapp/)). O Google sempre seguiu o mesmo desenho: mapa do dia com pontos coloridos por tipo de atividade e lista embaixo ([MakeUseOf](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/)).

Quando o Google tirou o Timeline da web, a thread do Hacker News listou para que as pessoas usavam a ferramenta. Os usos coincidem com os objetivos do Life:

- lembrar "what was that restaurant we went to in <random city> in <random year>";
- "check where I was when I made a purchase";
- reviver uma viagem dia a dia;
- navegar com "a giant map of the world and a mouse to poke around".

A falta mais citada nas alternativas foi outra: elas não fazem "the snapping to semantic locations that Timeline does for you" ([HN](https://news.ycombinator.com/item?id=40583946)).

O Dawarich, que é a fonte do Odysseus, refez a sua linha do tempo na **1.12.0 (11/08/2026)** em torno de "stays, movement and honest gaps" ([release 1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0); [PR #3302](https://github.com/Freika/dawarich/pull/3302)). Nessa versão:

- um silêncio que começa e termina no mesmo lugar vira uma visita só;
- um silêncio que termina em outro lugar vira um trecho **"untracked"**, exibido quando passa de **45 min**;
- a visita só leva nome de estabelecimento "when the evidence supports it", e o resto recebe endereço;
- toda visita tem um **escore de confiança**: as de média confiança aparecem atenuadas, as de baixa se dobram num item expansível por dia e as confirmadas ficam com peso total;
- a fila de revisão saiu, com a justificativa "Showing a visit is asserting it";
- o cabeçalho do dia virou uma linha com chips de distância por modo;
- cada trecho se expande numa "fita" de modos proporcional ao tempo;
- os segmentos brutos ficam atrás de "All segments · edit";
- exclusões viram tombstones, e tudo o que o usuário confirmou, renomeou ou anotou sobrevive à nova detecção.

As versões seguintes trataram dos problemas que os usuários levantaram:

- a **1.17.0** juntou o pernoite silencioso numa visita só ([1.17.0](https://github.com/Freika/dawarich/releases/tag/1.17.0));
- a **1.18.1** passou a mostrar a visita que atravessa a meia-noite "on every day it covers", contada a partir da meia-noite nos dias seguintes ([1.18.1](https://github.com/Freika/dawarich/releases/tag/1.18.1)), depois da queixa de que "most of my days have the strange appearance that I started 'no where'" ([#3624](https://github.com/Freika/dawarich/issues/3624));
- a **1.19.0** trouxe "Unknown Location" para visitas sem lugar nem endereço, setas do teclado para trocar de dia, e fusão e arquivamento de Places ([1.19.0](https://github.com/Freika/dawarich/releases/tag/1.19.0)).

Ainda há relatos abertos ou recentes:

- um dia inteiro em casa quebrado em "a dozen or so" visitas de 45–75 min por pings esparsos ([#2966](https://github.com/Freika/dawarich/issues/2966));
- um trecho "continued from" posto no fim do dia, que fazia o usuário aparecer "moving for 16 hours" ([#2967](https://github.com/Freika/dawarich/issues/2967));
- um dia que vira um único trilho comprido em vez de trechos entre visitas ([#3454](https://github.com/Freika/dawarich/issues/3454));
- horários mostrados no fuso da conta, e não no fuso do lugar ([#3886](https://github.com/Freika/dawarich/issues/3886)).

A ligação entre lista e mapa também está resolvida no Dawarich ([1.3.0](https://github.com/Freika/dawarich/releases/tag/1.3.0); [1.14.3](https://github.com/Freika/dawarich/releases/tag/1.14.3)):

- passar o mouse num trecho acende o trilho com borda animada;
- clicar enquadra o trilho e esmaece os outros;
- passar o mouse num segmento anima só aquele segmento.

O problema de nomear lugares é onde os produtos mais mudaram em 2026. O Arc 4, na v1.6.0 (30/07/2026), passou a mostrar o **endereço em vez de "Unknown Place"** em visitas sem lugar atribuído ([App Store](https://apps.apple.com/us/app/arc-timeline-4/id6740688708)). No Dawarich, as duas issues mais votadas da linha do tempo reclamam que toda sugestão se chamava "Suggested place". Um usuário tinha cerca de **4.000 visitas** e nenhum jeito de aceitar o nome real com um clique ([#583](https://github.com/Freika/dawarich/issues/583), [#1281](https://github.com/Freika/dawarich/issues/1281)).

O GeoPulse documenta uma cadeia explícita (favorito → geocódigo em cache → geocodificador → reserva → "Unknown location"). Nele, criar um favorito, seja um ponto ou uma área desenhada, **regenera a linha do tempo e renomeia as estadias antigas** ([GeoPulse](https://geopulse.cc/docs/user-guide/core-features/managing-places)). No Dawarich, uma visita cujo nome é igual ao do seu Place só passa a acompanhar renomeações do Place na **1.21.0** ([1.21.0](https://github.com/Freika/dawarich/releases/tag/1.21.0)), versão posterior à 1.20.1 em uso.

Nas correções, os seletores de candidatos ordenam por distância, e o lugar conhecido que se sobrepõe à visita aparece primeiro, sem distância ([fórum Big Paua](https://support.bigpaua.com/t/many-problems-since-the-last-update/841)). A busca por nome em cada visita do Dawarich usa Photon com viés para a posição da visita ([1.8.0](https://github.com/Freika/dawarich/releases/tag/1.8.0)). O Apple Maps oferece um botão de um toque, **"Wrong Location"**, em cada visita (trecho de busca) ([Tom's Guide](https://www.tomsguide.com/phones/iphones/ive-tried-out-the-biggest-addition-to-ios-26-maps-heres-what-i-like-and-what-i-dont)).

### O que isso significa para o Life

**Inferência: o rótulo é o maior problema de UX do Life, maior que o mapa.** Sem geocodificador reverso, o Odysseus não tem o endereço que o Arc e o Dawarich usam como reserva, e a cidade vinda do `geodata_places` do Immich é a melhor reserva disponível. Por isso a decisão 5 está certa no espírito. Mas um rótulo "Lisbon" sozinho se lê como fato ("estive em Lisboa") e não como lugar sem nome. Além disso, três visitas sem nome no mesmo dia na mesma cidade ficam indistinguíveis.

A recomendação é exportar o `place_id` do Dawarich e a contagem de visitas por place, ambos sem coordenadas. O rótulo passa a ser "Unnamed place · Lisbon", com uma linha secundária do tipo "12th visit · 2 h 10". A cadeia fica assim:

1. nome do Place, lido pelo `place_id`, o que já acompanha renomeações mesmo na 1.20.1;
2. nome da visita;
3. "Home" detectada;
4. "Unnamed place · cidade";
5. "Unknown location", quando nem a cidade existir.

O texto "Suggested place" nunca deve aparecer. Com o `place_id`, a contagem de visitas permite ainda uma lista "**Name your places**": lugares sem nome ordenados por número de visitas ou tempo total, cada um com link para o Dawarich. Como nomear um Place corrige o passado (GeoPulse, Dawarich 1.21.0), nomear os 20 ou 30 lugares mais frequentes deve cobrir a maior parte do tempo registrado (hipótese a conferir com a contagem real das 6,7 mil visitas). Isso ataca de frente o "semantic snapping" que os usuários do Google sentem falta.

**Inferência: o esquema de `services.sqlite` não sustenta o próprio mock do spec.** A tabela `moves` guarda `day, distance_km, points`, um agregado por dia, mas a linha do tempo desenhada mostra "09:05 Moving · 25 min · 8 km" entre duas visitas. Para isso é preciso exportar **trechos** (`start_ts, end_ts, distance_km`, modo e confiança quando existirem) a partir dos tracks do Dawarich, sem geometria, e somar os trechos para obter o total do dia. Esse dado não fere a regra de não ter coordenadas no PC. É preciso verificar no banco da 1.20.1 o nome da tabela de tracks e se o modo de transporte fica salvo.

Pelo mesmo raciocínio, mais quatro mudanças nos dados:

- buscar as visitas pela **sobreposição** de `[start_ts, end_ts)` com o dia, e não pela coluna `day`. Assim a primeira linha diz "Home · since 19:40 (Mon)" e a última "until 08:10 (Wed)", e o dia nunca "começa em lugar nenhum";
- criar linhas "**Untracked · 14:10–16:30**" sempre que um intervalo de 45 min ou mais não estiver coberto por visita nem trecho, com o limiar copiado do Dawarich. Isso se calcula só com horários;
- juntar na exibição visitas consecutivas com o mesmo `place_id` separadas por pouco tempo, sem trecho entre elas, como faz o MyEachtra (seção de busca) e como pede a [#2966](https://github.com/Freika/dawarich/issues/2966);
- levar a **confiança** da visita, se a 1.20.1 a guardar no banco, e aplicar a regra de peso visual do Dawarich. As visitas de baixa confiança se dobram em "3 brief stops".

**Inferência sobre a detecção de "Home":** o spec define Home como a célula de ~1 km mais frequente de madrugada **no mês**. Num mês com três semanas de viagem, o hotel vence, e os dias mais memoráveis do ano saem rotulados como "Home". Calcular a moda numa janela longa (90 dias ou o ano) e não aplicar "Home" dentro de uma viagem do Dawarich evita o erro.

Para o fuso, sem fazer fuso por localização, que o spec deixa fora do escopo: quando o país da visita não for BR, basta um aviso discreto "times in BRT" ([#3886](https://github.com/Freika/dawarich/issues/3886)).

**Inferência sobre mapa e layout:**

- copiar a ligação lista↔mapa do Dawarich: hover acende o pino ou trecho e esmaece o resto, clique enquadra;
- colorir a rota pela hora do dia, como o Timelinize faz com "a path colored to show the passage of time" ([timelinize.com](https://timelinize.com/)), para casar a ordem do mapa com a ordem da lista;
- pôr nos pinos um selo com o número de fotos penduradas naquela visita. A contagem vem do horário e não precisa de coordenada de foto.

Os pinos numerados do spec não aparecem em nenhuma fonte dos produtos pesquisados. São uma boa ideia, mas sem precedente documentado. As duas colunas a partir de 1100 px são uma vantagem, não um meio-termo: a maior perda citada no fim do Timeline web foi a tela grande ([HN](https://news.ycombinator.com/item?id=40583946)), e o Apple Journal no Mac foi criticado por ser um app de celular esticado. No celular, o padrão do Arc é mapa em cima e lista embaixo, então o spec acerta ao pôr o mapa primeiro. O que deve sair da frente da história é a grade de fotos: as fotos entram como mini-tira dentro de cada visita, e a grade completa vem depois.

**Inferência sobre correções:** o Life lê os SQLite em modo só leitura e não deve virar editor de lugares. Desde a 1.12.0 o Dawarich preserva as correções do usuário entre detecções, que é exatamente o que os usuários do Arc 4 perderam na migração. O caminho certo é um link "Fix in Dawarich ↗" por visita e por dia, com o aviso de que a mudança aparece no Life na próxima exportação horária. Atualizar para a 1.21.0 antes de nomear em massa garante que as visitas acompanhem as renomeações também dentro do Dawarich. Falta confirmar se a busca Photon da 1.8.0 funciona numa instância sem geocodificador configurado.

## Ruído digital vira uma linha com contagem, e cada item leva de volta à origem

O Timelinize é a única fonte com a heurística de agrupamento publicada em código ([common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)). Ela funciona assim:

- mensagens, e-mail e posts viram uma categoria só, "conversation";
- um novo grupo começa sempre que a categoria muda;
- os pontos de localização formam um bloco de mapa inserido *antes* dos itens, porque "it makes more sense to see a map before the items at those locations";
- cada grupo é dividido quando o intervalo entre itens se afasta mais de **1,75 desvio-padrão** da média móvel;
- há tetos de tamanho por categoria: 50 conversas, 25 mídias, 100 pontos;
- as visitas a páginas aparecem dobradas;
- cada categoria tem ícone e cor fixos (localização ciano, mídia rosa, páginas roxo, agenda vermelho);
- cada linha da lista de itens leva o logotipo da fonte, com a dica "Imported from {source}" ([items.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/items.js)).

O mesmo projeto carrega até **2.000 itens numa consulta, sem paginação**, e anota que a tentativa de carregar em lotes "did not work well" ([timeline.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/timeline.js)).

Os produtos de atividade digital convergem para "resumo primeiro, detalhe sob demanda":

- o Google My Activity nasceu em 2016 com "bundles" que agrupavam atividade parecida ([The Hacker News](https://thehackernews.com/2016/06/google-my-activity.html)). A ajuda atual só descreve navegação por dia, busca, filtros de data e produto e "Delete Results" sobre o conjunto filtrado ([Google](https://support.google.com/accounts/answer/465));
- o app do Google mostra as **quatro buscas mais recentes** e um link "[x] items" para a lista completa ([9to5Google](https://9to5google.com/2025/05/24/google-app-activity-tab-wide/));
- a página inicial do Recall resume as últimas 24 h como os **três apps ou sites mais usados** mais os snapshots recentes ([Windows Insider](https://blogs.windows.com/windows-insider/2025/06/23/announcing-windows-11-insider-preview-build-26200.5661-dev-channel/));
- o RescueTime e o Digital Wellbeing descem de categoria para app e de app para URL ([Timing](https://timingapp.com/blog/timing-vs-rescuetime-comparing-features-capabilities.md); [Android Help](https://support.google.com/android/answer/9346420));
- o ActivityWatch ganhou um filtro para achar eventos sem categoria, isto é, o ruído que as regras não pegaram ([fórum](https://forum.activitywatch.net/t/categorizing-events/269)).

Para repetições, o MyScéal juntava itens adjacentes parecidos e o MyEachtra junta eventos adjacentes no mesmo lugar ([LSC'21](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf); [MyEachtra](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)). Sobre o Takeout do YouTube há dois relatos: o autor do parser `youtubewatched` diz que alguns registros trazem só o horário, "presumably when the video itself is no longer available" ([PyPI](https://pypi.org/project/youtubewatched/)), e um guia de baixa qualidade sugere agrupar revisualizações por ID do vídeo e proximidade de horário ([guia](https://cloud.motorsport.unibo.it/article/the-hidden-archive-how-to-find-your-youtube-history-like-a-pro)).

A ação mais valorizada nos produtos de "lembrar tudo" é voltar ao original:

- o Promnesia guarda em cada visita um **locator**, "a permalink back to the original source", e clicar num locator do Telegram "will open Telegram and jump straight to the message" ([Promnesia](https://github.com/karlicoss/promnesia));
- o Recall tem botões para "jump back into the original app or webpage" ([Microsoft](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall));
- o "open" do Rewind reabria a página exata ([Fresh van Root](https://freshvanroot.com/blog/review-rewindai/)).

Para muitas métricas sem sobrecarga, o Exist é a referência:

- todo atributo tem prioridade, e "attributes with a priority of 10 or higher are treated as low priority" e ficam escondidos ([docs](https://developer.exist.io/reference/attributes/));
- a home mostra quatro atributos fixados e frases de insight;
- os dados aparecem como chips em linguagem simples ("2 workouts", "$52 spent") ([exist.io](https://exist.io/));
- as visões de semana e mês comparam cada período "to your average" ([blog](https://exist.io/blog/historical-browsing/)).

A pesquisa do próprio Exist traz três números úteis: **33% não sabiam que os subgrupos existiam**, embora 47% tivessem investido tempo neles; 35% querem mais análise; 46% gostam de o produto não ter IA generativa ([pesquisa](https://exist.io/blog/exist-survey-2025/)). No Apple Health, o resumo é feito de favoritos mais poucos destaques, e o revisor reclamou que um favorito mostra o último valor "whether it's a month old, a week old, or was just added" ([MacStories](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/)). No fórum de Quantified Self, a constatação foi que "it's unexpectedly difficult to present the data in a clear yet informative fashion", e as correlações foram chamadas de "a lot of noise" ([QS forum](https://forum.quantifiedself.com/t/personal-dashboards-for-self-tracking-data/8202)). Um usuário do Life Cycle pediu para ver o dia "in chronological order as well as by category" (trecho de busca) ([appfollow](https://apps.appfollow.io/ios/life-cycle-track-your-time/1064955217?country=ca)). O Apple Journal agrupa uma saída inteira (fotos, rota, música, passos) num "moment" ([MacStories](https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/)).

**Inferência: a linha "Digital · 6 searches, 2 videos" do spec está certa e precisa de regras explícitas.** São estas:

- uma linha por bloco da espinha (visita, trecho ou lacuna), e não por hora; ela só se divide por lacuna de tempo quando o bloco for longo, à maneira do Timelinize;
- expandida, ela abre sublistas por fonte com 3–5 itens cada e "+N more", no estilo do "[x] items" do Google;
- repetições do mesmo vídeo, URL ou busca dentro do bloco viram uma linha "×3", e a contagem não esconde as repetições: "2 videos (3 views)";
- itens indisponíveis ficam com o placeholder que o spec já prevê ("YouTube video (unavailable)") e são contados à parte;
- a montagem dos grupos pode ficar no servidor, para que um dia denso não repita o teto de 2.000 itens do Timelinize.

O código visual deve seguir a **categoria**, com a fonte como selo pequeno: o Takeout sozinho cobre busca, vídeo, mapas e lojas, então colorir por fonte embaralha tudo. O spec já tem as categorias certas (place, move, photo, event, money, work, note, home, mail, digital, health) e mantém "Work" (IA, commits) separado de "Digital", o que separa produção de consumo.

**Inferência sobre o resto do dia:**

- Os chips de filtro devem esconder itens, não a espinha. Filtrar por "Photos" mantém os cabeçalhos das visitas, para a foto continuar dizendo onde foi tirada.
- Todo item ganha um "Open original ↗" uniforme: asset no Immich, dia no Dawarich, evento no Nextcloud, vídeo no YouTube, mensagem no webmail, commit no forge. O `url` que o `Item` já tem serve para isso.
- "Day in numbers" deve seguir o Exist: chips em linguagem simples, delta contra a mediana dos últimos 30 dias, zeros e métricas de baixa prioridade atrás de "More".
- A frase-resumo deve ser montada por template, e não por LLM, pelo orçamento de 200 ms e porque um resumo determinístico não inventa nada.
- O lado de correlações e "insights" do Exist fica de fora.

## Mês, ano e "On this day" pedem uma escada de zoom estável, não um feed curado

O recuo mais caro do período foi o Photos do iOS 18. Ele juntou tudo numa página rolável com coleções automáticas, e as críticas foram estas ([Tsai](https://mjtsai.com/blog/2024/06/13/redesigned-photos-app-in-ios-18)):

- "No tab bar means there's nothing to permanently ground navigation" (Benjamin Mayo);
- "There is no sense of place" (Machiel);
- "'Suggestions-first' rather than let me just go to where I need to go" (Mario Guzmán);
- abrir "into the MIDDLE of a scrollable area" seria "bananas" (Jason Snell).

Numa enquete da MacRumors, só **21,4%** responderam "I like it!" ([MacRumors](https://www.macrumors.com/2024/11/21/apples-photos-app-overhaul-controversial/)). A Apple tirou o carrossel ainda no beta ([9to5Mac](https://9to5mac.com/2024/08/05/ios-18-photos-app-changes/)), e o iOS 26 trouxe de volta a barra Library/Collections (trecho de busca) ([Tom's Guide](https://tomsguide.com/phones/iphones/ios-26-has-brought-yet-another-photos-app-overhaul-for-your-iphone-heres-how-its-different)). O que sobreviveu foi a escada **Years → Months → All**. No iOS 26, Years "shows you a preview image from this date in that year", o que faz dele um "neste dia" embutido ([5 Minute Photos](https://5minutephotos.substack.com/p/apple-photos-on-the-iphone-part-1)). No Mac, uma pinça no trackpad sobre um mês ou ano troca de nível ([Apple Support](https://support.apple.com/guide/photos/pht56eafa987)). O Exist dá a cada período uma URL legível (`/dashboard/2019-7-14/`, `/dashboard/2019-w28/`, `/dashboard/2019-6/`) ([blog](https://exist.io/blog/historical-browsing/)).

No mês, o Day One pinta os dias com entrada na cor do diário e deixa os vazios "white or black, depending on your device appearance settings". Opcionalmente a célula mostra uma foto que o usuário marca como **Favorite**; no Android vale a primeira imagem ([Day One](https://dayoneapp.com/guides/calendar-view-in-day-one/)). Clicar num dia abre a Today view, que junta as entradas, sugestões de fotos, lugares e eventos, e o On This Day. O Journey faz o mesmo com "a color or a photo/video thumbnail" ([Journey](https://support.journey.cloud/en/categories/app-interface-functionalities/articles/calendar-interface-in-journey)). O Recent Days do Apple escolhe uma foto-chave por dia e **esconde screenshots e recibos** ([MacStories](https://www.macstories.net/stories/ios-and-ipados-18-the-macstories-review/9)). O Exist carrega no calendário do mês os dados de um atributo escolhido ([blog](https://exist.io/blog/historical-browsing/)).

Nenhum app de diário ou de fotos pesquisado desenha **viagens como faixas sobre o calendário**: Apple e Google mostram viagens como cards ou coleções à parte ([MacStories](https://www.macstories.net/stories/ios-and-ipados-18-the-macstories-review/9); [Google](https://blog.google/products/photos/redesigned-google-photos/)). A faixa contínua do spec é, portanto, um padrão novo, e o desenho dela tem de vir dos aplicativos de agenda.

No ano há duas tradições. O gráfico de contribuições do GitHub usa uma rampa de um só tom com limites **relativos por usuário**, por quartis depois de tirar outliers. Daí vêm três queixas documentadas: dias muito ativos aparecem claros, um dia de pico clareia todos os outros, e no tema escuro a escala parece invertida ([GitHub #23261](https://github.com/orgs/community/discussions/23261)). O mesmo gráfico abre o dia com um clique e seleciona um intervalo com Shift-clique ([GitHub Docs](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/viewing-contributions-on-your-profile)). O "Year in Pixels" usa cores **categóricas**, deixa em branco os dias sem registro porque "backfilled moods are unreliable" e recomenda evitar pares vermelho-verde ([Habitbox](https://habitbox.app/blog/year-in-pixels)). O Daylio acrescentou um seletor de atividade a essa visão (trecho de busca) ([App Store](https://apps.apple.com/us/app/daylio-journal-mood-tracker/id1194023242)). O Dawarich já mostra um heatmap estilo GitHub, um calendário do ano **colorido por país** ([1.0.2](https://github.com/Freika/dawarich/releases/tag/1.0.2); [1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0)) e, desde a 1.17.0, pesa o heatmap pelo **tempo passado** em vez da contagem de pontos. O relatório final de Feltron trazia uma página "Sources" com percentual, ícone e total de registros por categoria ([It's Nice That](https://www.itsnicethat.com/articles/nicholas-felton-releases-final-ever-personal-annual-report)). O livro anual do Gyroscope **trocava páginas** quando faltava um tipo de dado (ciclismo no lugar de corrida) para não deixar caixas vazias ([Gyroscope](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/)).

O "neste dia" tem padrões claros:

- o Day One levou o On This Day à web em set/2025, numa aba Today, com os anos em "reverse-chronological order" ([Day One](https://dayoneapp.com/releases/on-this-day-now-available-on-web/)), e o fórum pede para ampliar para "last week" e "last month" ([fórum](https://forums.dayoneapp.com/forums/topic/add-last-week-and-last-month-to-on-this-day-feature));
- o Immich põe uma faixa de memórias no topo da timeline, renovada todo dia e baseada na data de captura ([PixelUnion](https://pixelunion.eu/blog/2026/05/immich-memories/));
- no Immich houve uma disputa sobre a ordem, mais recente ou mais antigo primeiro ([#8275](https://github.com/immich-app/immich/issues/8275)), e um pedido para separar o toggle da faixa do toggle do menu ([#32769](https://github.com/immich-app/immich/discussions/32769));
- desde 2020 o Google Photos deixa esconder pessoas e períodos das memórias ([Google](https://blog.google/products/photos/redesigned-google-photos/));
- no Timelinize, a proposta de "this day in history" vem com exclusões por entidade, data e lugar ([#8](https://github.com/timelinize/timelinize/issues/8)).

**Inferência para a moldura:** a migalha `ano › mês › dia`, as setas e o teclado do spec são a escada que sobreviveu ao iOS 18 e devem ficar. Duas adições:

- estado endereçável por URL (`#life/2023-03-14`, `#life/2023-03`, `#life/2023`, `#life/search?q=…`), para que o chat, as notas e o agente apontem para um dia;
- abrir sempre numa visão concreta (a última, ou hoje), nunca numa vitrine de memórias.

Um cabeçalho de data fixo ao rolar listas longas, pedido no Immich desde 2022 ([#1667](https://github.com/immich-app/immich/discussions/1667)), vale para o dia e para a busca. No celular, os controles de navegação devem ficar visíveis o tempo todo, pela queixa sobre a barra de rolagem que some ([#30961](https://github.com/immich-app/immich/discussions/30961)).

**Inferência para o mês:**

- A capa sai da **foto favorita do Immich** (o spec já exporta `favorite`), o que dá o "Favorite" do Day One sem guardar nada novo no Odysseus. Na falta de favorita, vale a melhor foto do dia, sem screenshots nem vídeos. O sinal para detectar screenshots, seja nome de arquivo ou falta de câmera no EXIF, ainda precisa ser verificado.
- O dia vazio fica com célula neutra.
- O tingimento usa a mesma métrica escolhida no ano, com os totais do mês mostrando "vs average".
- A faixa de viagem fica fina, presa ao topo da linha da semana, rotulada só no primeiro dia de cada linha ("Lisbon · 12–18 Mar") e com borda cortada quando continua, para não cobrir as capas.
- No celular, com células de ~50 px, a célula mostra só número, capa ou tingimento e um ponto. O rótulo do lugar vai para o toque.

**Inferência para o ano:** o spec propõe as métricas Activity, Photos, Places, Spent e Steps. "Activity" não está definida. Se for uma contagem de itens, os ~52 eventos diários do Takeout dominam, e o heatmap repete o "Trends" que o próprio spec condena ("conta eventos por produto do Google, pergunta que ninguém faz"). A troca recomendada é "Activity" por "km moved" e mais uma métrica categórica, "**Where**": cidade de casa, outra cidade, exterior. Ela segue o calendário por país do Dawarich e faz as viagens saltarem aos olhos sem uma camada separada.

As escalas usam faixas **fixas** e visíveis na legenda ("0 · 1–3 · 4–9 · 10–24 · 25+ photos"), com o topo cortado para que um dia excepcional não clareie o ano. "Sem dado" fica hachurado e é diferente de "zero": sem extrato bancário não é o mesmo que R$ 0 gastos. As viagens aparecem como **contorno** sobre as células, não como cor, e Shift-clique seleciona um intervalo para somar. No pé do ano entra um rodapé "Sources" no estilo Feltron, com registros e período de cobertura por fonte. Isso importa no Odysseus porque o histórico da casa só começa quando o acúmulo do HA ligar, e as notas do OP Vault só a partir de hoje.

**Inferência para o "On this day":** o card "2019 · 2021 · 2022 ›" vira uma **linha por ano** ("3 years ago · Sat, 6 Nov 2023"), com capa, frase-resumo (lugar principal, fotos, gasto) e uma tira de quatro fotos. Os anos sem dados se colapsam numa linha só. A ordem padrão é o mais recente primeiro, com alternância. Quando a data exata está vazia, um "±3 days" amplia a busca. O card abre uma visão completa. Exclusões de datas que não devem ressurgir ficam para uma fase posterior.

## A busca é a ferramenta principal; a linha do tempo é o contexto

Os dois produtos de "gravar tudo" acabaram centrados na busca. O review do Rewind diz que "search is the decisive feature", que navegar rolando é "cumbersome" e que, em duas semanas, a linha do tempo ajudou só duas vezes ([Fresh van Root](https://freshvanroot.com/blog/review-rewindai/)). Na busca do Recall:

- os resultados se dividem em "text matches" e "visual matches", rotulados "Close match" ou "Related match";
- há um filtro por app;
- cada snapshot tem um botão para voltar ao app original;
- desde 2025 a tela inicial é um resumo, não a linha do tempo crua ([Microsoft](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)).

O Swarm melhorou a busca porque os usuários pesquisavam o próprio histórico com frequência (trecho de busca) ([Foursquare](https://medium.com/foursquare-direct/d774b3164f3f)). O Moves, antecessor de todo esse gênero, era um "day by day time log" sem "search, tags, charts" (trecho de busca) ([App Store](https://apps.apple.com/us/app/quantified-map/id1224409581)).

A pesquisa acadêmica aponta na mesma direção, com uma ressalva. No Lifelog Search Challenge de 2021, os usuários de um sistema de ponta acharam que "query-and-scroll" bastava para a maioria das tarefas. O que separou os melhores times foi "the number of wrong submissions with the fast retrieval time". Na tarefa mais difícil, só três sistemas acertaram, e o estudo credita isso a navegar pelo **contexto temporal** do resultado ([LSC'21](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)). O lifeXplore agrupa resultados por "coherent days".

O MyEachtra mostra **eventos** ranqueados, não imagens soltas, com local e hora. A melhor imagem fica no centro da linha, com até três vizinhas de cada lado. Os eventos são cortados na troca de lugar, numa lacuna de tempo e **na meia-noite**, "to further assist the use of date filters". O sistema usa uma caixa de texto livre em vez de um painel de facetas e oferece um mapa onde se desenha um retângulo para filtrar ([MyEachtra](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)). A revisão de 2022–24 vê a passagem para representações por evento como alinhamento "with human memory" e registra sidebars de filtro como padrão. Ela também ressalva que os resultados de novatos foram excluídos por "high variability" ([arXiv](https://arxiv.org/pdf/2506.06743)). O "Stuff I've Seen" (SIGIR 2003) concluiu que **tempo e pessoas** são pistas de recuperação importantes ([registro](https://bibtex.github.io/SIGIR-2003-DumaisCCJSR.html)). O "Milestones in Time" estudou marcos pessoais e públicos ao lado da linha do tempo de resultados, mas o texto completo não foi obtido ([registro](https://www.bibsonomy.org/bibtex/2b510c0ed2a30ac50f36b02d530d3e133/lysander07?lang=de)).

Para lugares, o Google tem uma busca reversa: a partir de um lugar, "Your visits and Maps history" lista as idas ([Google Help](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid)). O Arc tem "When Was I Last At…" ([bigpaua.com](https://www.bigpaua.com/arcapp/)). O Dawarich tornou as viagens pesquisáveis por nome, lugares e notas ([1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0)).

**Inferência: o spec já acerta o essencial da busca.** Ele prevê um campo único, `/` como atalho, resultados agrupados por dia e Enter abrindo o dia com o item destacado. Faltam quatro coisas:

- **Cabeçalho de dia como marco:** data, rótulo do lugar principal, capa e evento da agenda, porque o usuário lembra "foi no dia em que estive em X".
- **Acerto com contexto:** o item encontrado aparece com um ou dois vizinhos do mesmo bloco, à maneira do MyEachtra, sem abrir o dia.
- **Faceta de lugar:** ao lado das de categoria e período.
- **Card de lugar ou viagem:** quando a consulta casa com o rótulo de um lugar ou de uma viagem, um card no topo diz "Place → all visits (14, last 3 days ago)" ou "Trip → 12–18 Mar 2023".

Um analisador leve que reconheça ano e mês na consulta ("lisbon 2023") economiza filtros no celular. A divisão entre resultados exatos e relacionados só faz sentido se entrar busca semântica, que o spec não prevê. Uma bandeja de candidatos salvos e o feedback negativo dos sistemas de LSC são exagero para o uso diário.

## O que a pesquisa não conseguiu confirmar

Nenhuma fonte compara, com usuários, "lugares como espinha" contra um feed cronológico plano, nem dias agrupados contra uma lista ranqueada na busca. As recomendações acima vêm da convergência entre produtos e de decisões publicadas pelos desenvolvedores (Dawarich 1.12.0, Arc 1.6.0), não de experimentos. Os limiares, como 1,75σ, os tetos por grupo e os 45 min de lacuna, são heurísticas de produto, sem base em pesquisa. Também não foi encontrado:

- precedente para pinos numerados que casam com as linhas da lista;
- precedente para faixas de viagem sobre o calendário;
- descrição de como o Arc 4 desenha mês ou viagens de vários dias;
- descrição do layout atual da web do Exist ou do visualizador de memórias do Immich.

Strava e Fitbit não foram pesquisados. As críticas do Reddit ficaram de fora porque o domínio estava bloqueado. Algumas afirmações vêm só de trecho de busca, como o status do Recall em 2026, o Daylio e o iOS 26 Photos, e estão marcadas no texto.

## Conclusão

A pesquisa muda onde está o risco do Life. O spec trata a UI como o problema ("pobre e feio"), mas os produtos que acertaram a forma do dia continuaram perdendo usuários por causa de **semântica**: lugar sem nome, dia que começa no vazio, estadia picotada, buraco que parece dado, correção que some. O Odysseus herda esses problemas do Dawarich e acrescenta um seu, a falta de geocodificador. A vantagem dele é ler um Dawarich que, desde a 1.12.0, já trata lacunas, confiança e correções do jeito certo. O trabalho do Life é não jogar fora esse sinal ao achatar tudo em `label` e `day`.

A segunda lição é sobre onde gastar o esforço de design. Trocar navegação estável por superfícies curadas foi o erro caro do período (iOS 18), e o valor que os usuários dão a esses arquivos aparece quando perguntam algo específico ("aquele restaurante", "onde eu estava quando paguei isso"). Daí as prioridades: rótulos e lacunas honestos primeiro, depois a busca com contexto e "abrir no original", e por último as visões de resumo (mês, ano, "neste dia"). Essas visões são onde a polidez visual rende mais e onde o erro custa menos.

## Mudanças priorizadas no spec

O que **fica como está**:

- as decisões 1 a 4 (dia como página, fontes da v1, abordagem A, nenhuma coordenada no PC);
- os princípios da seção UI/UX;
- a moldura com migalha, setas e atalhos `←/→ ↑ t / Esc`;
- duas colunas a partir de 1100 px;
- o selo de viagem "day 2 of 6";
- os pinos numerados, que fazem sentido mesmo sem precedente documentado;
- os chips de filtro com contagem que somem quando vazios;
- a limpeza de títulos do Takeout, incluindo "YouTube video (unavailable)";
- esqueletos e carregamento lazy;
- o dia vazio com atalhos para os dias com dados mais próximos;
- o heatmap com semanas em colunas, igual ao do Dawarich que o usuário já vê;
- a busca num campo só, com Enter abrindo o dia destacado.

O que **não acrescentar**:

- abas de Insights, Cities ou Places por categoria (o próprio entusiasta do Google as achou "not terribly useful");
- correlações estilo Exist;
- fila de revisão de visitas (o Dawarich a removeu).

P0 muda o esquema de `services.sqlite` ou o contrato de `/api/lifelog/day` e deve entrar no desenho da fase 2 antes de se escrever o exportador. P1 é o núcleo da UI das fases 1 a 3. P2 é refinamento.

| # | Prior. | Seção do spec | Ação | Mudança concreta | Base |
|---|---|---|---|---|---|
| 1 | P0 | `services.sqlite` → `moves`; Dia | Mudar | Trocar o agregado `moves(day, distance_km, points)` por trechos `moves(id, start_ts, end_ts, distance_km, mode, confidence)` vindos dos tracks do Dawarich, sem geometria; o total do dia passa a ser a soma. Sem isso a linha "Moving · 25 min · 8 km" do mock não tem dado. | Inferência; padrão de linha única por deslocamento de [Dawarich 1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0), Arc e Google. Verificar tabela e modo na 1.20.1. |
| 2 | P0 | `visits`; `/day` | Mudar | Selecionar visitas por sobreposição `[start_ts, end_ts)` com o dia; primeira linha "Home · since 19:40 (Mon)", última "until 08:10 (Wed)". | Fato: [#3624](https://github.com/Freika/dawarich/issues/3624), [#2967](https://github.com/Freika/dawarich/issues/2967), [1.18.1](https://github.com/Freika/dawarich/releases/tag/1.18.1). |
| 3 | P0 | Dia → linha do tempo; "Dia vazio" | Acrescentar | Linha "Untracked · hh:mm–hh:mm" para intervalos ≥ 45 min sem visita nem trecho. Três estados distintos no mapa e na linha: NAS fora ("Map needs the NAS"), "No location recorded" neste dia, e "Before location tracking started". | Fato: [1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0), "Data Gap" no [Arc](https://support.bigpaua.com/t/missing-data-on-arc4/1266) e no [GeoPulse](https://geopulse.cc/docs/user-guide/core-features/timeline). |
| 4 | P0 | `visits` (colunas) | Acrescentar | Exportar `place_id`, contagem de visitas do place e `confidence` ou estado (confirmada/sugerida). Média confiança fica atenuada e baixa se dobra em "N brief stops". Juntar visitas consecutivas do mesmo `place_id` sem trecho entre elas. | Fato: [1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0), [#2966](https://github.com/Freika/dawarich/issues/2966), [MyEachtra](https://doras.dcu.ie/29497/1/3592573.3593100.pdf). Verificar colunas no esquema 1.20.1. |
| 5 | P0 | Decisão 5; `visits.label` | Mudar | Cadeia: nome do Place (via `place_id`) → nome da visita → Home → "Unnamed place · <city>" → "Unknown location". Nunca "Suggested place". Linha secundária com "12th visit · 2 h 10". | Fato: [#583](https://github.com/Freika/dawarich/issues/583), [#1281](https://github.com/Freika/dawarich/issues/1281), [Arc v1.6.0](https://apps.apple.com/us/app/arc-timeline-4/id6740688708), [GeoPulse](https://geopulse.cc/docs/user-guide/core-features/managing-places). Formato do rótulo: inferência. |
| 6 | P0 | `visits.kind = 'home'` | Mudar | Detectar Home numa janela longa (90 dias ou o ano) e nunca rotular como Home outra célula dentro de uma viagem do Dawarich. | Inferência (um hotel de três semanas vence a moda do mês). |
| 7 | P1 | Dia → "All day" | Mudar | Mover "All day" para uma faixa no **topo**, como nas agendas, com compras sem hora e eventos de dia inteiro. Corrigir o mock que mostra "12:40 R$ 48,00" dentro de uma visita, ou só pendurar compra em visita quando a fonte trouxer hora real. | Inferência; cruzar compra com lugar é uso real ([HN](https://news.ycombinator.com/item?id=40583946)). |
| 8 | P1 | Dia → mapa | Acrescentar | Hover na linha acende pino ou trecho e esmaece o resto; clique enquadra; rota com cor pela hora do dia; selo com número de fotos no pino. | Fato: [1.3.0](https://github.com/Freika/dawarich/releases/tag/1.3.0), [1.14.3](https://github.com/Freika/dawarich/releases/tag/1.14.3), [Timelinize](https://timelinize.com/). |
| 9 | P1 | Dia → Digital | Mudar | Uma linha por bloco da espinha (visita, trecho ou lacuna), dividida por lacuna de tempo só em blocos longos. Expandida: sublistas por fonte com 3–5 itens e "+N more", repetições como "×3" ("2 videos (3 views)"), indisponíveis contados à parte. Grupos montados no servidor. | Fato: [Timelinize](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js), ["[x] items"](https://9to5google.com/2025/05/24/google-app-activity-tab-wide/), [Recall top-3](https://blogs.windows.com/windows-insider/2025/06/23/announcing-windows-11-insider-preview-build-26200.5661-dev-channel/), [youtubewatched](https://pypi.org/project/youtubewatched/). |
| 10 | P1 | `Item`; todas as visões | Acrescentar | Ação "Open original ↗" em todo item, a partir do `url` (Immich, Dawarich no dia, Nextcloud, YouTube, webmail, commit). Por visita, também "Fix in Dawarich ↗", com o aviso de que a mudança aparece em até 1 h. | Fato: [Promnesia](https://github.com/karlicoss/promnesia), [Recall](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall), [Rewind](https://freshvanroot.com/blog/review-rewindai/). |
| 11 | P1 | Novo: "Name your places" | Acrescentar | Lista de lugares sem nome ordenada por visitas ou tempo total, com link para o Dawarich. Atualizar o Dawarich para ≥ 1.21.0 antes de nomear em massa. | Fato: [1.21.0](https://github.com/Freika/dawarich/releases/tag/1.21.0), [GeoPulse](https://geopulse.cc/docs/user-guide/core-features/managing-places), "semantic snapping" ([HN](https://news.ycombinator.com/item?id=40583946)). A lista é inferência. |
| 12 | P1 | Busca | Mudar | Resultados por dia com cabeçalho-marco (lugar, capa, evento da agenda); cada acerto com 1–2 vizinhos; faceta de lugar; card "Place → all visits (N, last …)" ou "Trip →" quando a consulta casa com um lugar ou uma viagem; incluir viagens no índice. | Fato: [LSC'21](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf), [MyEachtra](https://doras.dcu.ie/29497/1/3592573.3593100.pdf), [Google Help](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid), [Arc](https://www.bigpaua.com/arcapp/), [Dawarich 1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0). |
| 13 | P1 | Dia → filtros | Mudar | Filtrar mantém os cabeçalhos de visita (a espinha) e esconde só os itens das outras categorias. | Inferência. |
| 14 | P1 | Dia < 1100 px | Mudar | Mapa compacto no topo, como no Arc; depois a linha do tempo com fotos em mini-tira dentro das visitas; grade de fotos, "Day in numbers" e notas depois da história; controles de navegação sempre visíveis. | Fato: [Arc](https://www.bigpaua.com/arcapp/), [Exist 2025](https://exist.io/blog/exist-2025-redesign/), [Immich #30961](https://github.com/immich-app/immich/discussions/30961). A ordem é inferência. |
| 15 | P1 | Moldura | Acrescentar | Estado endereçável por URL (`#life/2023-03-14`, `#life/2023-03`, `#life/2023`, `#life/search?q=`), além de lembrar a última visão. Abrir sempre numa visão concreta, nunca num feed curado. Cabeçalho de data fixo ao rolar. | Fato: [Exist](https://exist.io/blog/historical-browsing/), [Tsai](https://mjtsai.com/blog/2024/06/13/redesigned-photos-app-in-ios-18), [Immich #1667](https://github.com/immich-app/immich/discussions/1667). |
| 16 | P2 | Ano | Mudar | Trocar "Activity" (indefinida, repete o "Trends") por "km moved" e acrescentar "Where" categórica (cidade de casa / outra cidade / exterior). Faixas fixas na legenda com topo cortado ("25+"); "sem dado" hachurado ≠ zero; viagens como contorno; Shift-clique para intervalo; sem pares vermelho-verde; testar se o tema escuro não inverte a leitura. | Fato: [GitHub #23261](https://github.com/orgs/community/discussions/23261), [Habitbox](https://habitbox.app/blog/year-in-pixels), [Dawarich 1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0), [GitHub Docs](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/viewing-contributions-on-your-profile). |
| 17 | P2 | Mês | Mudar | Capa = favorita do Immich, senão a melhor foto sem screenshots nem vídeos; célula vazia neutra; tingimento pela métrica escolhida no ano; totais com "vs average"; faixa de viagem fina, rotulada no primeiro dia de cada semana e com borda cortada; no celular, só número, capa ou tingimento e um ponto. | Fato: [Day One](https://dayoneapp.com/guides/calendar-view-in-day-one/), [Recent Days](https://www.macstories.net/stories/ios-and-ipados-18-the-macstories-review/9), [Exist](https://exist.io/blog/historical-browsing/). Faixa de viagem: sem precedente (inferência). |
| 18 | P2 | "On this day" | Mudar | Uma linha por ano ("3 years ago · Sat, 6 Nov 2023") com capa, frase-resumo e tira de 4 fotos; anos vazios colapsados; "±3 days" quando a data está vazia; mais recente primeiro, com alternância; o card abre uma visão completa. | Fato: [Day One](https://dayoneapp.com/releases/on-this-day-now-available-on-web/), [Apple Years](https://5minutephotos.substack.com/p/apple-photos-on-the-iphone-part-1), [Immich #8275](https://github.com/immich-app/immich/issues/8275), [fórum Day One](https://forums.dayoneapp.com/forums/topic/add-last-week-and-last-month-to-on-this-day-feature). |
| 19 | P2 | `/sources`; dia e ano | Acrescentar | Rodapé "Sources" com última atualização, início da cobertura por fonte (HA desde a ativação, OP Vault desde hoje, banco desde …) e erro. No dinheiro, "No bank data" ≠ "R$ 0". Em hoje, "as of 14:05" nas métricas. | Fato: [Feltron](https://www.itsnicethat.com/articles/nicholas-felton-releases-final-ever-personal-annual-report), [Apple Health](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/), [Google](https://9to5google.com/2025/03/07/google-maps-timeline-missing/). |
| 20 | P2 | Dia → cabeçalho e "Day in numbers" | Mudar | Chips em linguagem simples com delta contra a mediana de 30 dias; zeros e métricas de baixa prioridade atrás de "More"; frase-resumo por template, sem LLM; selos "First visit" e "First time in <city>". | Fato: [Exist](https://exist.io/), [pesquisa Exist](https://exist.io/blog/exist-survey-2025/), [Dawarich 1.20.0](https://github.com/Freika/dawarich/releases/tag/1.20.0), [Gyroscope](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/). |
| 21 | P2 | Dia → fotos (lightbox) | Mudar | Cabeçalho com hora e lugar; "Open in Immich"; tira de miniaturas; abrir em tela cheia por padrão. | Fato: [Immich v1.63.0](https://github.com/immich-app/immich/releases/tag/v1.63.0), [MacRumors](https://www.macrumors.com/2024/11/21/apples-photos-app-overhaul-controversial/). |
| 22 | P2 | Fuso (limitação conhecida) | Acrescentar | Aviso "times in BRT" quando o país da visita ≠ BR, sem implementar fuso por localização. | Fato: [Dawarich #3886](https://github.com/Freika/dawarich/issues/3886). |
| 23 | P2 | Fora do escopo → fase futura | Acrescentar depois | Exclusões no "On this day" (datas ou intervalos que não devem ressurgir) e "hide all from this source". | Fato: [Timelinize #8](https://github.com/timelinize/timelinize/issues/8), [Google Photos](https://blog.google/products/photos/redesigned-google-photos/), [My Activity](https://support.google.com/accounts/answer/465). |

## Apêndice: todas as fontes consultadas

As fontes abaixo são todas as que aparecem nas notas de pesquisa, agrupadas pela frente de pesquisa. "(trecho de busca)" marca as que só foram vistas como resumo de buscador.

### Linhas do tempo de localização (Google Maps Timeline, Arc, Dawarich, Moves, Life Cycle, Swarm, OwnTracks, Apple Maps, GeoPulse)

- [Google Maps blog, 2015-07-21 (trecho de busca)](https://maps.googleblog.com/2015/07/your-timeline-revisiting-world-that.html)
- [The Next Web 2015-07-22](https://thenextweb.com/news/google-maps-your-timeline-shows-where-youve-been-at-any-given-time)
- [9to5Google 2021-07-21 (trecho de busca)](https://9to5google.com/2021/07/21/google-maps-timeline-insights/)
- [9to5Google 2024-06-05](https://9to5google.com/2024/06/05/google-maps-timeline-web/)
- [Google Maps Help, Manage your Timeline](https://support.google.com/maps/answer/6258979)
- [TechRadar (trecho de busca)](https://www.techradar.com/phones/youve-got-more-time-the-great-google-maps-timeline-switch-gets-a-new-deadline-date)
- [PhoneArena (trecho de busca)](https://www.phonearena.com/news/google-gives-ios-android-users-an-ultimatum-to-update-timeline-settings_id168306)
- [The Register 2025-03-24 (trecho de busca)](https://www.theregister.com/2025/03/24/google_maps_timeline_data_loss/)
- [Android Police (trecho de busca)](https://www.androidpolice.com/google-maps-timeline-bug/)
- [Google Maps Help (Android)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DAndroid)
- [Help search snippet (iOS)](https://support.google.com/maps/answer/6258979?hl=en&co=GENIE.Platform%3DiOS)
- [Pocket-lint 2024-08-31](https://www.pocket-lint.com/how-to-see-location-history-in-google-maps/)
- [Local Guides Connect post, 2026-01-15](https://www.localguidesconnect.com/t/the-new-google-maps-timeline-better-insights-for-local-guides/502847)
- [Android Police, 2026-07-01](https://www.androidpolice.com/i-gave-google-maps-timeline-another-chance-and-it-totally-won-me-over/)
- [MakeUseOf 2023-06-22](https://www.makeuseof.com/tag/see-youve-google-maps-new-timeline-feature/)
- [Android Police (trecho de busca)](https://www.androidpolice.com/didnt-expect-much-from-google-maps-timeline/)
- [HN thread "Google Maps is killing Timeline for Web"](https://news.ycombinator.com/item?id=40583946)
- [MobileSyrup 2020-12-21](https://mobilesyrup.com/2020/12/21/google-photos-map-screen-views-travel-timeline/)
- [Android Central (trecho de busca)](https://www.androidcentral.com/how-use-map-browse-photos-places-google-photos)
- [bigpaua.com/arcapp](https://www.bigpaua.com/arcapp/)
- [Arc Timeline 4 announcement](https://support.bigpaua.com/t/introducing-arc-timeline-4-the-next-generation-of-arc/1141)
- [App Store, Arc Timeline 4](https://apps.apple.com/us/app/arc-timeline-4/id6740688708)
- [App Store, Arc Timeline](https://apps.apple.com/us/app/arc-timeline-trips-places/id1063151918)
- [Big Paua forum, 2024-10-28/29](https://support.bigpaua.com/t/many-problems-since-the-last-update/841)
- [Big Paua forum, 2021-09](https://support.bigpaua.com/t/issues-in-timeline/163)
- [Big Paua forum (trecho de busca)](https://support.bigpaua.com/t/missing-data-on-arc4/1266)
- [Big Paua forum: Arc4 stops recording](https://support.bigpaua.com/t/arc-timeline-4-stops-recording-location-and-misses-complete-trips/1352)
- [getdriftlog.com](https://getdriftlog.com/google-maps-timeline-alternatives-iphone/)
- [Dawarich release 0.36.2](https://github.com/Freika/dawarich/releases/tag/0.36.2)
- [Dawarich release 1.1.0](https://github.com/Freika/dawarich/releases/tag/1.1.0)
- [Dawarich release 1.3.0](https://github.com/Freika/dawarich/releases/tag/1.3.0)
- [Dawarich release 1.7.11](https://github.com/Freika/dawarich/releases/tag/1.7.11)
- [Dawarich release 1.8.0](https://github.com/Freika/dawarich/releases/tag/1.8.0)
- [Dawarich release 1.12.0](https://github.com/Freika/dawarich/releases/tag/1.12.0)
- [Dawarich PR #3302](https://github.com/Freika/dawarich/pull/3302)
- [Dawarich release 1.14.3](https://github.com/Freika/dawarich/releases/tag/1.14.3)
- [Dawarich release 1.16.0](https://github.com/Freika/dawarich/releases/tag/1.16.0)
- [Dawarich release 1.17.0](https://github.com/Freika/dawarich/releases/tag/1.17.0)
- [Dawarich release 1.18.1](https://github.com/Freika/dawarich/releases/tag/1.18.1)
- [Dawarich release 1.19.0](https://github.com/Freika/dawarich/releases/tag/1.19.0)
- [Dawarich release 1.20.0](https://github.com/Freika/dawarich/releases/tag/1.20.0)
- [Dawarich release 1.21.0](https://github.com/Freika/dawarich/releases/tag/1.21.0)
- [Dawarich release 1.0.2](https://github.com/Freika/dawarich/releases/tag/1.0.2)
- [Dawarich release 0.37.0](https://github.com/Freika/dawarich/releases/tag/0.37.0)
- [Dawarich docs: Visits and Places](https://dawarich.app/docs/features/visits-and-places/)
- [Dawarich README](https://github.com/Freika/dawarich/blob/master/README.md)
- [docs changelog](https://dawarich.app/docs/changelog/)
- [Dawarich issue #583](https://github.com/Freika/dawarich/issues/583)
- [Dawarich issue #1281](https://github.com/Freika/dawarich/issues/1281)
- [Dawarich issue #457](https://github.com/Freika/dawarich/issues/457)
- [Dawarich issue #2966](https://github.com/Freika/dawarich/issues/2966)
- [Dawarich issue #2967](https://github.com/Freika/dawarich/issues/2967)
- [Dawarich issue #3624](https://github.com/Freika/dawarich/issues/3624)
- [Dawarich issue #3454](https://github.com/Freika/dawarich/issues/3454)
- [Dawarich issue #3886](https://github.com/Freika/dawarich/issues/3886)
- [9to5Google 2018-07-02 (trecho de busca)](https://9to5google.com/2018/07/02/facebook-shutting-down-moves-tbh-hello/)
- [about.fb.com (trecho de busca)](https://about.fb.com/news/2018/07/hello-tbh-moving-on/amp/)
- [Quantified Map, App Store (trecho de busca)](https://apps.apple.com/us/app/quantified-map/id1224409581)
- [App Store listing via appfollow (trecho de busca)](https://apps.appfollow.io/ios/life-cycle-track-your-time/1064955217?country=ca)
- [Podfeet blog, Aug 2024 (trecho de busca)](https://www.podfeet.com/blog/2024/08/tracking-life-in-life-cycle/)
- [Foursquare design blog "How we designed Foursquare Swarm 5.0" (trecho de busca; página deu 403)](https://medium.com/foursquare-direct/d774b3164f3f)
- [Engadget 2017-08-08](https://www.engadget.com/2017-08-08-swarm-5.html)
- [owntracks/frontend README](https://github.com/owntracks/frontend)
- [Tom's Guide (trecho de busca)](https://www.tomsguide.com/phones/iphones/ive-tried-out-the-biggest-addition-to-ios-26-maps-heres-what-i-like-and-what-i-dont)
- [iGeeksBlog (trecho de busca)](https://www.igeeksblog.com/apple-maps-visited-places/)
- [heise (trecho de busca)](https://www.heise.de/en/news/Visited-Places-Tracking-in-Apple-Maps-Where-it-works-and-how-11077230.html)
- [GeoPulse docs: managing places](https://geopulse.cc/docs/user-guide/core-features/managing-places)
- [GeoPulse docs: timeline](https://geopulse.cc/docs/user-guide/core-features/timeline)

### Agregadores multi-fonte e relatórios (Timelinize, Gyroscope, Exist, HPI/Promnesia, Perkeep, Nomie, Memex/Heyday, Feltron, Spotify Wrapped, Apple Health, Google My Activity/Timeline, Day One)

- [timelinize.com](https://timelinize.com/)
- [Timelinize: GitHub README](https://github.com/timelinize/timelinize)
- [timelinize.com/docs](https://timelinize.com/docs)
- [Timelinize: GitHub releases](https://github.com/timelinize/timelinize/releases)
- [Timelinize: commits](https://github.com/timelinize/timelinize/commits/main)
- [Timelinize: timeline/schema.sql](https://github.com/timelinize/timelinize/blob/main/timeline/schema.sql)
- [Timelinize: timeline/graph.go](https://github.com/timelinize/timelinize/blob/main/timeline/graph.go)
- [Timelinize: issue #139](https://github.com/timelinize/timelinize/issues/139)
- [Timelinize: frontend/pages](https://github.com/timelinize/timelinize/tree/main/frontend/pages)
- [docs/tutorial](https://timelinize.com/docs/tutorial)
- [Timelinize: frontend/pages/timeline.html](https://github.com/timelinize/timelinize/blob/main/frontend/pages/timeline.html)
- [Timelinize: frontend/resources/js/items.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/items.js)
- [Timelinize: common-lib.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/common-lib.js)
- [Timelinize: frontend/resources/js/timeline.js](https://github.com/timelinize/timelinize/blob/main/frontend/resources/js/timeline.js)
- [Timelinize: issue #81](https://github.com/timelinize/timelinize/issues/81)
- [Timelinize: issue #42](https://github.com/timelinize/timelinize/issues/42)
- [Timelinize: issue #8](https://github.com/timelinize/timelinize/issues/8)
- [Timelinize no HN: HN Algolia](https://hn.algolia.com/api/v1/search?query=timelinize&tags=story)
- [Show HN: Timelinize (thread)](https://news.ycombinator.com/item?id=45504973)
- [Algolia items API](https://hn.algolia.com/api/v1/items/45504973)
- [TechCrunch, 2014-08-07](https://techcrunch.com/2014/08/07/this-guy-tracks-everything-about-himself-and-puts-it-up-online-for-everyone-to-see)
- [Personal Science Wiki: "From April Zero to Gyroscope"](https://wiki.openhumans.org/wiki/From_April_Zero_to_Gyroscope)
- [video](https://vimeo.com/149086539)
- [MIT Technology Review, 2014-12-04](https://www.technologyreview.com/2014/12/04/111021/your-online-journal-built-from-heartbeats-sleep-patterns-and-hikes/amp/)
- [Gyroscope: Printing annual report books, 2017-10-16](https://gyrosco.pe/timeline/2017-10-16/printing-annual-report-books/)
- [2017 in review](https://gyrosco.pe/timeline/2018-01-14/2017-in-review/)
- [Gyroscope Places update, 2019-10-02](https://gyrosco.pe/timeline/2019-10-02/gyroscope-places-update/)
- [Introducing Gyroscope v5, 2022-08-08](https://gyrosco.pe/timeline/2022-08-08/introducing-gyroscope-v5/)
- [Product Hunt: Gyroscope 2.0](https://www.producthunt.com/p/gyroscope/gyroscope-2-0)
- [Product Hunt reviews](https://www.producthunt.com/posts/gyroscope/reviews)
- [gyrosco.pe](https://gyrosco.pe/)
- [archived v1.8 post](https://gyrosco.pe/timeline/2016-10-28/new-improved-gyroscope-app/)
- [exist.io](https://exist.io/)
- [Exist blog: Historical browsing, 2019-09-25](https://exist.io/blog/historical-browsing/)
- [Exist developer docs: attributes](https://developer.exist.io/reference/attributes/)
- [Exist KB: service vs attribute](https://kb.exist.io/article/19-whats-the-difference-between-a-service-and-an-attribute)
- [Exist KB](https://kb.exist.io/article/55-will-exist-find-correlations-across-multiple-days)
- [Exist blog: Our 2025 redesign](https://exist.io/blog/exist-2025-redesign/)
- [Exist user survey 2025](https://exist.io/blog/exist-survey-2025/)
- [QS forum: Personal dashboards thread, 2020](https://forum.quantifiedself.com/t/personal-dashboards-for-self-tracking-data/8202)
- [HPI README](https://github.com/karlicoss/HPI)
- [Promnesia README](https://github.com/karlicoss/promnesia)
- [Perkeep overview](https://perkeep.org/doc/overview)
- [nomie6-oss on GitHub](https://github.com/IanSteg/nomie6-oss)
- [open-nomie/nomie5](https://github.com/open-nomie/nomie5)
- [Beeminder forum](https://forum.beeminder.com/t/looking-for-an-application-on-pc-to-easily-track-things/11417)
- [funkypenguin cookbook](https://geek-cookbook.funkypenguin.co.nz/blog/2023/03/02/new-recipe-nomie-swarm/)
- [SaaSHub](https://www.saashub.com/worldbrains-memex)
- [WorldBrain community](https://community.worldbrain.io/t/the-most-unfortunate-thing-happened-to-memex/858)
- [App Store: Memex Go](https://apps.apple.com/jo/app/memex-go/id1471860331)
- [mentoday.ru, 2023](https://www.mentoday.ru/technics/news/05-02-2023/kak-luchshe-zapominat-informaciyu-mujchina-nashel-reshenie-v-rasshirenii-dlya-brauzera/)
- [It's Nice That](https://www.itsnicethat.com/articles/nicholas-felton-releases-final-ever-personal-annual-report)
- [Cool Infographics](https://coolinfographics.com/blog/2013/8/2/the-2012-feltron-annual-report.html)
- [MoMA](https://www.moma.org/collection/works/145531)
- [Webtonic](https://www.webtonic.io/blog/spotify-wrapped-marketing-strategy-7-lessons-from-a-viral-campaign)
- [Storysoft](https://storysoft.io/data-storytelling-spotify-wrapped/)
- [DEV.to analysis](https://dev.to/bhumica08/what-i-learned-from-spotify-wrappeds-ux-magic-and-how-id-build-it-40nk)
- [Active Theory on Medium](https://medium.com/active-theory/spotify-wrapped-2018-technical-case-study-5b7cfb7e9d3a)
- [MacStories: Health in iOS 13](https://www.macstories.net/stories/health-in-ios-13-a-foundation-for-apples-grand-wellness-ambitions/)
- [MacRumors guide](https://www.macrumors.com/guide/health)
- [Google Account Help](https://support.google.com/accounts/answer/7028918?hl=en)
- [Android Central](https://www.androidcentral.com/apps-software/google-maps-gets-rid-of-another-feature-on-web)
- [9to5Google](https://9to5google.com/2025/03/07/google-maps-timeline-missing/)
- [Android Authority](https://www.androidauthority.com/google-accidentally-delete-maps-timeline-data-3537615)
- [Day One guide](https://dayoneapp.com/guides/tips-and-tutorials/on-this-day/)

### Diários, memórias e fotos (Day One, Journey, Apple Journal, Apple Photos, Google Photos, Immich, Daylio, Year in Pixels, GitHub)

- [Day One: Journal views for macOS](https://dayoneapp.com/guides/journal-views-in-day-one-for-macos/)
- [Day One: Journal views for iOS](https://dayoneapp.com/guides/day-one-ios/journal-views-in-day-one-for-ios/)
- [Day One: Calendar view](https://dayoneapp.com/guides/calendar-view-in-day-one/)
- [Day One: On This Day](https://dayoneapp.com/features/on-this-day/)
- [Day One release: On This Day now available on web](https://dayoneapp.com/releases/on-this-day-now-available-on-web/)
- [Day One: On This Day view](https://dayoneapp.com/guides/tips-and-tutorials/on-this-day-view/)
- [Day One forum: add last week / last month](https://forums.dayoneapp.com/forums/topic/add-last-week-and-last-month-to-on-this-day-feature)
- [Day One forum: customize On This Day](https://forums.dayoneapp.com/forums/topic/feature-request-customize-on-this-day/)
- [Journey: Calendar interface](https://support.journey.cloud/en/categories/app-interface-functionalities/articles/calendar-interface-in-journey)
- [Apple Newsroom, Dec 2023](https://www.apple.com/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/)
- [MacStories: Apple's Journal App](https://www.macstories.net/reviews/apples-journal-app-journaling-for-all/)
- [BGR: How Apple plans to make Journal cool again in iOS 26](https://bgr.com/1922123/ios-26-journal-preview-ipad-mac-app/)
- [9to5Mac: Everything new in Journal for iOS 18](https://9to5mac.com/heres-everything-new-in-the-journal-app-for-ios-18/)
- [TapSmart: Insights in Journal](https://www.tapsmart.com/tips-and-tricks/insights-in-journal/)
- [9to5Mac, 2025-06-17](https://9to5mac.com/2025/06/17/apples-journal-app-is-coming-to-ipad-and-mac-with-big-upgrades/)
- [iGeeksBlog: How to use Journal](https://www.igeeksblog.com/how-to-use-journal-app-on-iphone/)
- [9to5Mac, 2025-09-27](https://9to5mac.com/2025/09/27/macos-26-unlocks-the-real-potential-of-apples-journal-app/)
- [Numeric Citizen: Reviewing Apple Journal](https://numericcitizen.me/reviewing-apple-journal-a-summer-experiment/)
- [MacStories iOS 18 review, Photos](https://www.macstories.net/stories/ios-and-ipados-18-the-macstories-review/9)
- [Six Colors (Jason Snell)](https://sixcolors.com/post/2024/09/in-ios-18-photos-brings-collections-to-the-fore/)
- [Michael Tsai roundup](https://mjtsai.com/blog/2024/06/13/redesigned-photos-app-in-ios-18)
- [MacRumors, 2024-11-21](https://www.macrumors.com/2024/11/21/apples-photos-app-overhaul-controversial/)
- [9to5Mac, 2024-08-05](https://9to5mac.com/2024/08/05/ios-18-photos-app-changes/)
- [MacRumors iOS 18 Photos guide](https://macrumors.com/guide/ios-18-photos)
- [MacRumors forum](https://forums.macrumors.com/threads/ios-18-photos-app-all-the-new-features-and-design-updates.2433290)
- [Tom's Guide: iOS 26 Photos overhaul](https://tomsguide.com/phones/iphones/ios-26-has-brought-yet-another-photos-app-overhaul-for-your-iphone-heres-how-its-different)
- [5 Minute Photos: Library view](https://5minutephotos.substack.com/p/apple-photos-on-the-iphone-part-1)
- [Apple Support: Find photos and videos by date on Mac](https://support.apple.com/guide/photos/pht56eafa987)
- [Apple Community thread](https://discussions.apple.com/thread/256234546?page=2)
- [Google blog, 2020-06-25](https://blog.google/products/photos/redesigned-google-photos/)
- [9to5Google, 2024-11-28](https://9to5google.com/2024/11/28/google-photos-memories-moments)
- [9to5Google, 2025-03-20](https://9to5google.com/2025/03/20/google-photos-bottom-bar-android/)
- [Android Authority](https://www.androidauthority.com/google-photos-memories-carousel-redesign-3636414)
- [Immich: newreleases: v1.61.0](https://newreleases.io/project/github/immich-app/immich/release/v1.61.0)
- [Immich roadmap](https://immich.app/roadmap/)
- [Immich v1.63.0 release](https://github.com/immich-app/immich/releases/tag/v1.63.0)
- [Immich: newreleases: v1.129.0](https://newreleases.io/project/github/immich-app/immich/release/v1.129.0)
- [PixelUnion: On This Day in Immich (2026-05)](https://pixelunion.eu/blog/2026/05/immich-memories/)
- [Immich: GitHub #8275](https://github.com/immich-app/immich/issues/8275)
- [Immich: GitHub discussion #32769](https://github.com/immich-app/immich/discussions/32769)
- [Immich: GitHub #19728](https://github.com/immich-app/immich/issues/19728)
- [Immich: GitHub discussion #30961](https://github.com/immich-app/immich/discussions/30961)
- [Immich: GitHub discussion #32551](https://github.com/immich-app/immich/discussions/32551)
- [Immich: GitHub discussion #31360](https://github.com/immich-app/immich/discussions/31360)
- [Immich: GitHub discussion #4902](https://github.com/immich-app/immich/discussions/4902)
- [Immich: GitHub discussion #1667](https://github.com/immich-app/immich/discussions/1667)
- [PixelUnion: Immich map view (2026-05)](https://pixelunion.eu/blog/2026/05/immich-map-view/)
- [Immich v1.55.0 release](https://github.com/immich-app/immich/releases/tag/v1.55.0)
- [Daylio home](https://daylio.net/)
- [Daylio on the App Store](https://apps.apple.com/us/app/daylio-journal-mood-tracker/id1194023242)
- [Daylio FAQ: Activity and Mood Statistics](https://daylio.net/faq/?p=5703)
- [Habitbox: Year in Pixels](https://habitbox.app/blog/year-in-pixels)
- [GitHub Community discussion #23261](https://github.com/orgs/community/discussions/23261)
- [Gitblend: Understanding GitHub contribution graphs](https://gitblend.pages.dev/kb/understanding-github-contribution-graphs)
- [GitHub Docs: Viewing contributions on your profile](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/viewing-contributions-on-your-profile)

### Atividade digital e busca (Rewind/Limitless, Recall, Google My Activity, ActivityWatch, RescueTime, Digital Wellbeing, Screen Time, Lifelog Search Challenge, pesquisa acadêmica)

- [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)
- [Limitless homepage "Limitless has been acquired by Meta"](https://limitless.ai/)
- [Pascal's Chatbot Q&As](https://p4sc4l.beehiiv.com/p/limitless-ai-a-case-study-in-how-small-hardware-enabled-ai-companies-transition-their-products-user)
- [Fresh van Root review](https://freshvanroot.com/blog/review-rewindai/)
- [The Sweet Setup, "A first look at Rewind AI"](https://thesweetsetup.com/a-first-look-at-rewind-ai/)
- [TheSweetBits review](https://thesweetbits.com/tools/rewind-ai-review/)
- [TechCrunch, 2022](https://techcrunch.com/2022/11/01/rewind-wants-to-revamp-how-you-remember-with-millions-from-a16z)
- [screenpipe docs: vs Rewind](https://docs.screenpi.pe/vs-rewind)
- [r/software thread](https://redlib.hbubli.cc/r/software/comments/1fjfwg0/screenpipe_open_source_247_screen_audio_capture)
- [Microsoft Support, "Retrace your steps with Recall"](https://support.microsoft.com/en-us/windows/ai/ai-features/retrace-your-steps-with-recall)
- [Windows Insider Blog](https://blogs.windows.com/windows-insider/2025/06/23/announcing-windows-11-insider-preview-build-26200.5661-dev-channel/)
- [Windows Central](https://www.windowscentral.com/software-apps/windows-11/microsoft-unveils-big-windows-recall-update-now-showcases-your-most-used-apps-and-websites)
- [ElevenForum tutorial](https://www.elevenforum.com/t/use-recall-with-snapshots-in-windows-11.31003/latest)
- [Wikipedia: Windows Recall](https://en.wikipedia.org/wiki/Windows_Recall)
- [The Register](https://www.theregister.com/2025/04/11/microsoft_windows_recall/)
- [Gigazine](https://wbgsv0b.gigazine.net/gsc_news/en/20250414-windows-recall-release-preview)
- [digitpatrox](https://digitpatrox.com/hands-on-with-microsofts-windows-recall-not-impressive-yet/)
- [Tom's Guide](https://tomsguide.com/computing/windows-operating-systems/i-review-laptops-for-a-living-heres-my-honest-thoughts-on-windows-recall)
- [hubsite365 summarising Windows Central](https://www.hubsite365.com/de-ww/crm-pages/hands-on-with-windows-recall-on-windows-11-copilot-pcs-efb5b2f0-9f1a-4d64-aaf8-ccc87824276a.htm)
- [GeekWire](https://www.geekwire.com/2026/one-year-after-its-rocky-launch-microsofts-windows-recall-still-raises-security-red-flags/)
- [Windows Central](https://www.windowscentral.com/microsoft/windows-11/microsoft-is-reevaluating-its-ai-efforts-on-windows-11-plans-to-reduce-copilot-integrations-and-evolve-recall)
- [Windows Latest, 21 Oct 2026](https://www.windowslatest.com/2026/10/21/microsoft-is-now-scaling-back-copilot-in-windows-11-amid-microslop-backlash-pulling-8-ai-actions-from-file-explorer-and-calling-it-simplifying/)
- [The Hacker News, 2016](https://thehackernews.com/2016/06/google-my-activity.html)
- [Google Search Help Community thread](https://support.google.com/websearch/thread/24051371/how-do-i-view-all-of-my-recent-search-history-in-one-simple-list-there-used-to-be-a-view-all-option?hl=en)
- [support.com guide](https://www.techsolutions.support.com/how-to/how-to-check-your-google-account-history-11467)
- [Google Account Help, "Delete your activity"](https://support.google.com/accounts/answer/465)
- [9to5Google](https://9to5google.com/2025/05/24/google-app-activity-tab-wide/)
- [ActivityWatch docs: User Interface](https://docs.activitywatch.net/en/latest/features/user-interface.html)
- [It's FOSS](https://itsfoss.com/news/activitywatch-0-11-release/)
- [ActivityWatch forum: Categorizing Events](https://forum.activitywatch.net/t/categorizing-events/269)
- [ActivityWatch forum, Features](https://forum.activitywatch.net/c/features/8?page=1)
- [RescueTime help: Understanding your data](https://help.rescuetime.com/article/461-understanding-your-data)
- [Your first productivity insights](https://help.rescuetime.com/article/457-your-first-insights)
- [RescueTime help: Dashboard](https://help.rescuetime.com/article/30-dashboard)
- [The Categories Report](https://help.rescuetime.com/article/60-the-categories-report)
- [Timing blog: Timing vs RescueTime](https://timingapp.com/blog/timing-vs-rescuetime-comparing-features-capabilities.md)
- [Capterra reviews](https://www.capterra.com/p/103317/RescueTime/reviews/?page=4)
- [Android Help: Digital Wellbeing](https://support.google.com/android/answer/9346420)
- [TheGeekPage](https://thegeekpage.com/screen-time-not-showing-apps-in-app-activity-how-to-fix/)
- [Apple Community thread](https://discussions.apple.com/thread/256053750)
- [Tran et al., "Comparing Interactive Retrieval Approaches at LSC 2021", IEEE Access 2023 (PDF)](https://doras.dcu.ie/29962/1/Comparing_Interactive_Retrieval_Approaches_at_the_Lifelog_Search_Challenge_2021.pdf)
- [Gurrin et al., LSC2018 comparison](https://bora.uib.no/bora-xmlui/handle/1956/23844)
- [Tran et al., MyEachtra, LSC'23 (PDF)](https://doras.dcu.ie/29497/1/3592573.3593100.pdf)
- [E-Myscéal, DORAS](https://doras.dcu.ie/27801/1/EMySce%CC%81al.pdf)
- [Tran et al., "State-of-the-Art in Lifelog Retrieval: LSC 2022–24", arXiv](https://arxiv.org/pdf/2506.06743)
- [Dumais et al., "Stuff I've Seen", SIGIR 2003 (bib record)](https://bibtex.github.io/SIGIR-2003-DumaisCCJSR.html)
- [bibliographic listing via search](https://www.bibsonomy.org/bibtex/2b510c0ed2a30ac50f36b02d530d3e133/lysander07?lang=de)
- [Windows Digitals](https://windowsdigitals.com/get-old-search-back-windows-11-26h2)
- [motorsport.unibo.it article](https://cloud.motorsport.unibo.it/article/the-hidden-archive-how-to-find-your-youtube-history-like-a-pro)
- [Mozilla Support](https://support.mozilla.org/en-US/questions/988821)
- [PyPI: youtubewatched](https://pypi.org/project/youtubewatched/)
