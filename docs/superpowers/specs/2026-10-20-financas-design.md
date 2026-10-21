# Plano: Finanças pessoais no Odysseus (arquivo bancário vitalício, custo zero)

> **Primeira ação após aprovar:** salvar este plano como spec versionado em `docs/superpowers/specs/2026-10-20-financas-design.md`, a mesma pasta dos specs do painel de Vaults, e commitar como `docs(fork): spec Finanças -- ...`.

## Context
Você quer o histórico bancário da vida inteira guardado localmente no Odysseus, auditável e sem transação duplicada entre fontes.
- **Hoje:** Nubank (principal) e Santander, ativos.
- **Caixa:** só histórico.
- **Dados antigos:** guardados de forma misturada. A lista vem depois, e os importadores (uso único) são avaliados então.

Requisitos:
- **custo zero;**
- **a prioridade são os dados;** o painel vem depois;
- atualização automática e manual. Atraso de 24h é aceitável;
- a janela de 12 meses do Open Finance não pode virar problema, porque o completo sempre fica local;
- categorização por regras determinísticas, que eu escrevo;
- criptografia mapeada para o futuro.

## Avaliação (custo zero), já conferida online em 2026-10-20
- **Única fonte automática grátis: Meu Pluggy.**
  - Plano: "até 5 conexões ativas, todas de contas do mesmo titular", "Grátis e sem prazo", uso pessoal, atualização automática a cada 24h.
  - **Descartadas:** Open Finance direto (exige ser instituição autorizada), Pluggy comercial (a partir de R$ 2.500/mês), Belvo e Tecnospeed (pagos), pynubank e scrapers (bloqueados e contra os termos), e Actual ou Firefly como base.
- **Janela de 12 meses.** A especificação OFB obriga 12 meses para trás em conta, cartão, movimentação de investimento e pagamentos de empréstimo.
  - **Na Pluggy:** a criação do item busca até 12 meses. Depois, o trecho de 1 a 6 dias é relido a cada update e o de 7 a 365 dias **a cada 7 dias**, o que pode trazer correções retroativas.
  - **Implicação:** o local é append-only e é a fonte de verdade. Depois do primeiro sync, nenhum dia se perde.
- **Sem refresh forçado.** `PATCH /items/{id}` responde `400 "MeuPluggy item cant be updated"`.
  - **Automático:** polling barato, a cada ~3h, de `GET /items/{id}`. Só baixa quando `lastUpdatedAt` muda. O limite das nossas leituras é 360 req/min por IP. O aviso "Batch process are prohibited" se refere a forçar updates, não a leituras.
  - **Manual:** o botão puxa o snapshot. Para o dado de agora, importe o OFX/CSV que o app do Nubank manda por e-mail. Ele passa pelo mesmo dedup.
- **Autorização Meu Pluggy → app dura 1 ano** (`consentExpiresAt`). Depois disso as leituras voltam vazias. Renovar = refazer o login pelo Dashboard, e **o itemId pode mudar**.
- `GET /items` dá 403 no Meu Pluggy, então os itemIds ficam guardados na configuração.
- **Ids e transações:**
  - um PENDING recriado ganha id novo, e uma transação pode "sumir e reaparecer";
  - uma reconexão gera ids novos;
  - reconciliar por `providerId`. **Nada local é apagado por causa da Pluggy.**
- **Fatura aberta não vem** até fechar. Enquanto isso, aparece só como transações PENDING.
- **Webhooks:** são opcionais e exigem HTTPS público, então não serão usados.

**Conexões, dentro do limite de 5 (confirmar no spike):**
1. Nubank. O diretório OFB mostra um único servidor "NU PAGAMENTOS", com conta, cartão, renda fixa, fundos, Tesouro, renda variável e empréstimos. **NuInvest não é conexão separada.** As caixinhas aparecem como CDB.
2. Banco Santander PF: conta, e talvez cartão e loans.
3. Santander Cartões PF, só se o 2 não trouxer o cartão.
4. Santander Financiamentos (Aymoré) ou Santander Crédito Imobiliário, se houver financiamento lá. São servidores OFB separados.
5. Santander Corretora, se houver ações lá.

A Caixa não é conectada: o histórico vem por arquivo.

## Arquitetura de dados: três camadas, tudo auditável
Diretório: `data/finance/` (está no volume `./data`). Usa um SQLite próprio, `data/finance/finance.sqlite`, com `Base` SQLAlchemy próprio, sem tocar em `core/database.py`.

1. **Bruto imutável (`raw/`).** Toda resposta da API e todo arquivo importado é gravado exatamente como veio.
   - Caminho: `raw/<fonte>/<AAAA-MM>/<sha256>.<ext>`.
   - Registro em `fin_raw_blobs`: hash, fonte, conta, período, data de ingestão.
   - Nunca é editado. Erro de parser se corrige reprocessando.
2. **Registros de origem (`fin_source_records`).** Uma linha por transação de cada fonte:
   - valor em **centavos inteiros**, data, descrição bruta e normalizada;
   - id nativo (`id` e `providerId` da Pluggy, `FITID` do OFX, ou hash da linha);
   - `raw_blob_id`, e `seq` para linhas idênticas legítimas no mesmo arquivo.
3. **Livro canônico (`fin_transactions`).** Uma transação real, com N origens via `fin_tx_sources`.
   - Guarda categoria, regra, override e status (ativa, estornada, `deleted_upstream`).
   - **Reconstruível do zero** a partir de 1 + 2 + `fin_merge_decisions` (decisões manuais, persistidas e reversíveis).

**Outras tabelas:**
- `fin_accounts`, `fin_item_map`: itemId antigo/novo → mesmas contas, com `consentExpiresAt`;
- `fin_bills`;
- `fin_investment_snapshots`: série temporal de posições, porque o OFB só mostra posição ativa e o histórico de posição se constrói guardando snapshots;
- `fin_investment_txs`;
- `fin_loans`, com prestações e pagamentos;
- `fin_balance_checkpoints`: saldos observados, vindos de extrato, fatura, IR e Pluggy;
- `fin_sync_runs`.

**Deduplicação (o ponto crítico):**
1. **Mesmo id nativo e mesma fonte:** é atualização. Reimportar o mesmo arquivo é no-op pelo hash.
2. **Mesmo `providerId` com ids Pluggy diferentes:** funde (recriação ou reconexão).
3. **Entre fontes:** casamento bipartido com multiplicidade. Chave: (conta, valor exato), data ±3 dias, similaridade de descrição. Se a fonte A tem N registros iguais, eles casam com no máximo N da fonte B.
   - **Alta confiança:** funde automaticamente, com log.
   - **Média confiança:** vai para a fila de revisão.
4. **Prova:** depois de cada ingestão, recalcula o saldo em cada checkpoint. Se a diferença for igual ao valor de uma transação, ela é sinalizada como suspeita de duplicata ou faltante.
5. **Transferências entre contas suas** (Pix, pagamento de fatura): viram par com `transfer_group`. Não são duplicata e não contam como gasto.
6. **Precedência em divergência:** extrato oficial > Pluggy > planilha sua. Fica registrada, nunca sobrescreve em silêncio.

**Auditoria independente: hledger + git**
- Export diário para `data/finance/ledger/` (repositório git **privado**):
  - `main.journal` com `include AAAA.journal` em ordem (as asserções são cumulativas, então um ano isolado falha);
  - valores no formato `R$ 1234.56` (ponto decimal, sem milhar);
  - asserção `=` em cada checkpoint;
  - tags deliberadas `; src:pluggy, raw:<sha256>` (um `:` solto em comentário vira tag).
- Validação: `hledger check -s ordereddates` (hledger 1.52.4). Não imprime nada e sai com 0 quando a vida inteira bate.
- Commit automático a cada export, para ter o diff de tudo que mudou.

## Fases (dados primeiro)
**F0: spike de dados.** Eu, read-only, com os seus itemIds.
- Script no scratchpad que autentica (`POST /auth`, apiKey de 2h, header `X-API-KEY`) e salva o JSON bruto de:
  - `GET /items/{id}`, `/accounts?itemId=`;
  - `/v2/transactions?accountId=&dateFrom=` (paginação `after`/`next`, 500 por página);
  - `/bills?accountId=`, `/investments?itemId=`, `/investments/{id}/transactions`;
  - `/loans?itemId=`, `/identity?itemId=`.
- Relatório do que veio de fato, por conta e mês: quantos meses, cartão, caixinhas, ações, financiamento. Também confirma bills e loans pelo proxy, que nenhuma fonte garante.
- Com isso fecho a lista de conexões.

**F1: núcleo de dados.**
- Arquivos novos: `src/finance/{models,raw_store,pluggy_client,ingest_pluggy,dedup,reconcile,ledger_export,poller}.py`.
- **Ingestão:**
  - incremental: `dateFrom` = última data - 10 dias;
  - **releitura semanal completa dos 365 dias**, para pegar as correções retroativas, passando pelo dedup;
  - snapshots de saldo e investimentos a cada mudança de `lastUpdatedAt`.
- **Poller:** loop asyncio a cada ~3h, iniciado por hook em `app.py` junto ao do ai-usage (~linha 927), sem mexer no `TaskScheduler` do upstream.
- `routes/finance_routes.py` (padrão de `routes/ai_usage_routes.py`, `Depends(require_user)`):
  - `/api/finance/meta`, `POST /sync`, `GET accounts|transactions|bills|investments|loans|networth`;
  - `/audit`: cobertura por mês, checkpoints, fila de duplicatas, consentimentos vencendo.
- **Alertas ntfy:**
  - conta sem dado novo há mais de 3 dias (já houve casos de 10 a 13 dias com "ponto verde");
  - consentimento vencendo em menos de 30 dias;
  - checkpoint que não bate;
  - duplicata pendente.
- **Credenciais:** `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS` no `.env`, repassados em `docker/pereiraoc.yml`, como `VAULTFS_GIT_TOKEN`.
- **Volume do ledger:** `data/finance/ledger` precisa de git dentro do container. Verificar se a imagem já tem git; o painel de Vaults usa.
- Testes, depois rebuild da imagem, depois o primeiro sync real.

**F2: importação de arquivos** (inventário real abaixo).
- Interface `Importer` (arquivo → registros de origem + checkpoints).
- Importadores, por ordem de valor:

| # | Importador | Arquivos | Checkpoint de saldo | Dificuldade |
|---|---|---|---|---|
| 1 | `ofx_nubank` | Nubank conta, 55 OFX, 06/2019–12/2023 | `LEDGERBAL` de cada mês | baixa: FITID é UUID único |
| 2 | `wise_csv` | Wise, 20 CSVs, 10 moedas, 2022–2023 | coluna `Running Balance` | baixa: id `TransferWise ID`; câmbio gera 2 pernas |
| 3 | `pdf_santander_cc` | Santander conta, 78 PDFs com texto, 01/2017–12/2023, mais o "Extrato consolidado" de 05/2023 | saldo inicial e final do "Resumo" mensal | média: layout Compart estável, mudou um pouco em 2023 |
| 4 | `pdf_nubank_fatura` | Nubank cartão, 40 PDFs, 10/2019–01/2024 | total da fatura | média: parcelas "n/m" e IOF/internacional |
| 5 | `csv_santander_categorizado` | Santander, 34 CSVs `*_DESPESAS/RECEITAS`, 2022-01..05 e 2023-01..12 | — | baixa. São sem sinal (sinal vem do nome do arquivo) e repetem as transações dos PDFs, então são **origem secundária**: só dão dedup e uma dica de categoria. |
| 6 | `ofx_santander` | 1 OFX de 01–08/06/2023, duplicado com dois nomes (`extratoCC.ofx` e `2021_from_01-01-2021...`, mesmo md5; o nome mente) | — | `FITID=000000` em todas as linhas, então dedup por (data, valor, memo, seq) |
| 7 | `pdf_santander_fatura` | Santander cartão, 28 PDFs **protegidos por senha** | total da fatura | precisa da senha (normalmente derivada do CPF) |
| 8 | OCR | Santander conta 06–11/2021: 6 PDFs "Microsoft Print to PDF" **sem texto** (imagem) | Resumo mensal | tesseract/ocrmypdf (grátis), não instalado; os valores precisam fechar com o checkpoint |

- `fin_raw_blobs` deduplica por sha256, então o OFX de nome errado entra uma vez só.
- Antes de importar, eu gero o relatório de cobertura e de checkpoints (abaixo). A importação de cada fonte só é aceita quando a soma das transações do mês fecha com o saldo inicial e final daquele mês.

**Inventário de `/data/finances/finances.zip` (2026-10-20), 300 arquivos**

| Fonte | Cobre | Buracos |
|---|---|---|
| Santander conta | 01/2017–12/2023 | nenhum (06–11/2021 só como imagem) |
| Nubank conta | 06/2019–12/2023 | 07/2023 vai só até 08/07 (OFX parcial) |
| Nubank cartão | 10/2019–01/2024 | 03–08/2020, 10–12/2020, 02–04/2021 |
| Santander cartão | 10/2019–01/2024 | 02–12/2021, **2022 inteiro** (pasta vazia), 01/2023 |
| Wise | 2022–2023 | antes de 2022 e depois de 2023 |
| Caixa | — | **nenhum arquivo no zip** |
| Santander conta 2024 | — | pasta vazia |
| `Santander/230837725.txt` | — | arquivo vazio |

- **Buraco crítico: ~01/2024 até ~10/2025.** Os arquivos acabam em 12/2023 ou 01/2024, e a primeira sincronização da Pluggy só volta até ~10/2025. Esses ~21 meses só se recuperam exportando agora:
  - Nubank conta: OFX mês a mês pelo app;
  - Nubank faturas: CSV/OFX/PDF;
  - Santander conta e cartão: PDF ou OFX;
  - Wise: CSV de 2024 e 2025.

  Os bancos podem limitar até quando dá para voltar, então **quanto antes, melhor**.

**Wise** (conferido em 2026-10-20)
- O Wise Brasil está no diretório OFB **só com APIs de pagamento**, sem compartilhamento de dados, então não dá para conectar via Pluggy.
- **API pessoal:** é grátis, com token pessoal "read only".
  - `GET /v4/profiles/{id}/balances` (saldos atuais por moeda) e `/v1/transfers` funcionam.
  - **Extratos (balance statements) com token pessoal estão bloqueados**, exceto para perfis de US, CA, AU, NZ, SG e MY. Para UK/EEA o bloqueio é por PSD2. O fluxo de assinatura SCA foi aposentado para contas pessoais.
  - Fontes: https://docs.wise.com/guides/product/kyc/partner-accounts, https://github.com/newmancu/sure/issues/382
- **Plano:**
  - poller Wise: snapshot de saldo por moeda (checkpoint) e transfers;
  - transações de cartão e câmbio: CSV de extrato exportado periodicamente, com o mesmo formato dos arquivos de 2022–2023 (importador 2);
  - o spike confirma, com o seu token, quais endpoints respondem (por exemplo `/v1/profiles/{id}/activities`).
- **Multimoeda:** o canônico guarda moeda e valor original. A conversão para BRL é só para exibir (taxa da própria transação de câmbio Wise quando houver). No hledger, cada moeda vira commodity (`USD`, `EUR`, `ILS`…).

**F3: regras de categorização.**
- Motor determinístico: condições → ações, por prioridade, e `manual_override` nunca é sobrescrito.
- `GET /uncategorized?group_by=merchant` e import/export de regras em JSON com dry-run.
- Eu gero as regras a partir dos seus dados, e você revisa.

**F4: painel** `static/js/finance.js` + `zz-fork-finance.css`, no padrão de `static/js/aiUsage.js`.
- Abas: Visão geral/patrimônio, Transações, Cartões/parcelas, Investimentos, Financiamentos, Regras, **Auditoria**.
- CSS no precache do `sw.js` com o mesmo `?v=`.

**F5:** orçamento, metas e recorrências.

**F6:** Splitwise, com API key pessoal grátis.

Wise entra na F1 (poller de saldo) e na F2 (CSV), não aqui.

## Dados do governo (pesquisa de 2026-10-20)
**Nenhuma** plataforma do governo tem API para pessoa física:
- o Login Único gov.br é para serviços credenciados;
- o Conecta gov.br é só entre órgãos;
- o Open Finance não cobre dados do governo.

O caminho é baixar à mão (PDF, às vezes assinado) e importar com um parser por tipo, pela mesma camada `raw/` imutável.

| Prioridade | Fonte | O que dá | Formato | Cadência |
|---|---|---|---|---|
| 1 | Meu INSS: CNIS "relações previdenciárias **e remunerações**" | vínculos desde 1976, salário de contribuição mês a mês desde 1990 | PDF | semestral |
| 1 | Receita e-CAC: cópia das declarações IRPF | o **.DEC** (único arquivo nativo legível por máquina) + recibo. Só ~5 exercícios ficam disponíveis | .DEC/.REC | anual, após entregar |
| 1 | Registrato (BCB): **CCS** | toda conta que você já teve em qualquer instituição. Serve para checar se falta alguma conta no arquivo | PDF | semestral |
| 1 | Registrato: SCR e **Câmbio** | empréstimos por instituição, mês a mês; operações de câmbio desde 1995 (casa com o Wise) | PDF | semestral |
| 2 | FGTS (app) | extrato por contrato | PDF | semestral / ao trocar de emprego |
| 2 | CTPS Digital | contratos e salário contratual (eSocial desde 2019; antes vem do CNIS) | PDF | ao mudar de emprego |
| 2 | Registrato: Chaves Pix (completo) | chaves atuais e excluídas | relatório | semestral |
| 3 | CDT: CNH e CRLV-e | documentos assinados (ICP-Brasil); infrações só aparecem na tela | PDF | anual |
| 3 | Meu SUS Digital | certificado de vacinação | PDF | quando houver dose nova |
| 3 | CIN, e-Título, CadÚnico | documentos | PDF | uma vez |

- **Requisitos:** gov.br nível prata/ouro e 2FA. Sem automação headless: captcha e 2FA impedem, os termos de uso também, e ela quebra sem aviso.
- **Semi-automação aceitável no futuro:** um navegador visível em que você mesmo faz o login, e o script só salva os PDFs/JSON. Não guarda senha nem contorna captcha.
- **Destino:** `data/finance/raw/` (ou um irmão `data/personal/`) com o mesmo modelo de proveniência. Os parsers vêm depois dos bancos.
- **Projetos de referência** (status variado): `MaioranoB/CNIS-reader`, `CheweeBR/Filter-CNIS-PDF-to-CSV`, `acassiovilasboas/parse-pdf-extrato-fgts`, `Halqq/carteira-assinada`.

## Estado da implementação (2026-10-20)
- **Pronto:**
  - núcleo `src/finance/` (store, ingest, dedup, reconcile, ledger, cli) com 16 testes;
  - import real de `/data/finances/finances.zip`: 230 arquivos, 6.344 registros, 6.125 transações canônicas;
  - ledger com 411 asserções passando no hledger 1.52.4.
- **Lacunas explícitas (no ledger como `ajustes:lacunas`):**
  - Santander 06–11/2021 (PDFs em imagem: OCR pendente);
  - Nubank conta 09–31/07/2023 (OFX parcial).
- **Pendente:**
  - PDFs de fatura do Santander (senha);
  - 8 linhas das planilhas do Santander na fila de revisão;
  - Pluggy, Wise API, painel e regras.

## Estado (2026-10-21): categorização e análise mensal
- **Regras:**
  - motor em `src/finance/rules.py`; as regras ficam em `data/finance/ledger/rules.json` (dados do usuário, fora do repo);
  - 55 regras, 89% das transações categorizadas;
  - categoria manual pela UI vence qualquer regra.
- **Transferências entre contas próprias:** viram pares (`transfer_pairs`). Uma transferência sem par indica extrato ou fatura faltando do outro lado.
- **Aba Mensal** (`src/finance/analytics.py`):
  - KPIs: patrimônio, ganhos e gastos por mês, taxa de poupança, salário e reserva em meses;
  - gráficos: ganhos × gastos com saldo, patrimônio (+ aplicado estimado), salário, gastos por grupo empilhados, taxa de poupança;
  - tabela e CSV;
  - filtros: período, mês/trimestre/ano, moeda e Pix com pessoas;
  - meses com dados incompletos e o mês parcial aparecem apagados e ficam fora dos KPIs.
- **Próximos:**
  - patrimônio multimoeda via PTAX do Banco Central (grátis);
  - saldo real de investimentos via Open Finance;
  - orçamento/metas por categoria;
  - comparação ano a ano.

## Estado (2026-10-21): Open Finance ligado
- **Meu Pluggy conectado:** Nubank, Santander e Wise; o consentimento vale até 2027-10-21.
- **O que veio no spike** (12 meses, de 10/2025 em diante):
  - Nubank: conta, cartão (com parcelas futuras PENDING) e 38 CDBs/caixinhas;
  - Santander: conta e cartão;
  - Wise: saldos por moeda;
  - nenhum empréstimo.
- **Sem saldo por transação:** a Pluggy não manda. O período dela só fecha com os extratos de 01/2024 a 09/2025.
- **Conta-salário Santander 033/3735/71308654-8:** não entra no Open Finance. O salário chega ao Nubank como transferência do próprio CPF; a regra `salario-conta-salario-santander` classifica.
- **Mesmo CPF:** transferências de/para o próprio CPF ganham a marca `self_transfer` e viram transferência interna.
- **Categorias da Pluggy:** as categorias em inglês viram regras de reserva, com prioridade 50; cobertura de 91%.

## Passos que dependem de você (o resto eu faço)
Você faz isso uma vez, antes da F0, e me manda Client ID, Client Secret e os Item IDs. Eu coloco no `.env`, que é gitignored.
1. Criar conta em **meu.pluggy.ai** e clicar em **"Conectar Minha Conta"**.
   - Conectar **Nubank** e **Banco Santander (PF)**, autorizando no app de cada banco.
   - Por enquanto **não** conectar Santander Cartões, Financiamentos nem Corretora. O spike diz se precisa.
2. Criar conta em **dashboard.pluggy.ai**, de preferência com o mesmo e-mail.
3. Criar **uma** aplicação. Na aba **"Aplicação"**, copiar o **Client ID** e o **Client Secret**.
4. Nas configurações de conectores da aplicação, **ativar o conector "MeuPluggy"**. Não ative o do banco, Sandbox nem Pluggy Bank.
   - Sem isso, a API responde com lista vazia.
   - **Faça os passos 2 a 4 no mesmo dia:** as fontes divergem sobre a lista de conectores travar quando o trial de 15 dias acaba. Se travar, peça extensão no Discord da Pluggy.
5. Na página **Demo** (Connected Items), menu ⋮ → **"Copiar Item ID"**, uma vez por banco.
6. **Anualmente:** quando eu avisar que o consentimento está vencendo, refaça o login MeuPluggy pelo Dashboard e me passe o itemId novo, se mudar.
7. **Sempre que quiser o dado de agora:** no app do Nubank, peça o extrato ou a fatura em OFX/CSV por e-mail e importe no painel.
8. **Fechar o buraco 01/2024 → hoje.** Exportar e colocar em `/data/finances/`:
   - Nubank conta: OFX de cada mês;
   - Nubank faturas: CSV, ou OFX, ou PDF;
   - Santander conta: PDF ou OFX;
   - Santander faturas;
   - Wise: CSV por moeda, de 2024 até hoje.

   Também completar os meses faltantes do inventário, se o banco ainda deixar.
9. **Senha dos PDFs de fatura do Santander:** me diga qual é (ou o padrão, por exemplo os primeiros dígitos do CPF). Ela fica só no `.env`.
10. **Caixa:** colocar os arquivos que você tiver em `/data/finances/Caixa/`. O zip não tem nenhum.
11. **Wise:** em wise.com → Configurações → API tokens, criar um token **Read only** e me passar.

## Criptografia: mapa para o futuro (não entra no v1)
1. **Já, recomendado:**
   - backup **restic** cifrado (AES-256, deduplicado) de `data/finance/` para fora da máquina (B2, S3 ou SFTP), com a senha guardada fora da máquina;
   - **LUKS** no disco, se ainda não tiver.
2. **sops + age** para os segredos (client secret da Pluggy, chave do Splitwise) em vez de texto puro no `.env`.
3. **age** nos blobs de `raw/` (`.age` por arquivo, chave X25519 ou YubiKey via plugin). O parser decifra em memória ao reprocessar.
4. **SQLCipher via `sqlcipher3`** (0.6.4, wheels estáticas; SQLAlchemy 2.0 nativo: `sqlite+pysqlcipher://:senha@//...`).
   - Só se o SQLite sair da máquina.
   - O canônico é reconstruível a partir de `raw/` + decisões, então cifrar esses dois já basta.
   - `pysqlcipher3` está abandonado.
5. **Repo do ledger:**
   - privado e local, com o backup via restic;
   - git-crypt (determinístico, vaza tamanho e igualdade de arquivos) ou git-remote-gcrypt só se for para um remoto não confiável.
- **Limite comum a todas as opções:** nenhuma protege contra quem já está dentro do container com a chave em memória. O modelo de ameaça é disco roubado, backup vazado e remoto comprometido.

## Verificação
- **pytest em `./venv`:**
  - dedup adversarial: mesmo café 2x no dia; a mesma compra no OFX e na Pluggy com ±2 dias; PENDING recriado; reconexão com ids novos; transação que some e reaparece; reimportação do mesmo arquivo; transferência entre contas;
  - reconciliação de checkpoints;
  - export hledger, com `hledger check` se o binário estiver disponível;
  - rotas no padrão de `tests/test_vaultfs_routes.py`;
  - `test_static_css_balanced` e paridade de `?v=` na F4.
- **Propriedade:** apagar o canônico e reconstruir a partir de `raw/` + decisões tem que dar resultado idêntico.
- **End to end:**
  - rebuild da imagem, depois sync real;
  - `/api/finance/audit` com 12 meses cobertos e checkpoints batendo;
  - `hledger check -s ordereddates` com saída 0;
  - saldo de cada conta igual ao do app do banco.
- **Docs:** `LOCAL_CHANGES.md` seção 7 e commits `feat(fork): Finanças -- ...`.
