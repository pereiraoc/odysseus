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

**F2: importação de arquivos.**
- Interface `Importer` (arquivo → registros de origem + checkpoints) e um importador OFX genérico, que cobre Nubank conta/fatura e Santander "Money 2000".
- Nubank CSV de conta e de fatura.
- Os importadores do histórico antigo (Caixa, planilhas suas) ficam **para quando você mandar a lista**. A reconciliação vai conta a conta até todas as âncoras baterem.

**F3: regras de categorização.**
- Motor determinístico: condições → ações, por prioridade, e `manual_override` nunca é sobrescrito.
- `GET /uncategorized?group_by=merchant` e import/export de regras em JSON com dry-run.
- Eu gero as regras a partir dos seus dados, e você revisa.

**F4: painel** `static/js/finance.js` + `zz-fork-finance.css`, no padrão de `static/js/aiUsage.js`.
- Abas: Visão geral/patrimônio, Transações, Cartões/parcelas, Investimentos, Financiamentos, Regras, **Auditoria**.
- CSS no precache do `sw.js` com o mesmo `?v=`.

**F5:** orçamento, metas e recorrências.

**F6:** Splitwise, com API key pessoal grátis.

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
8. **Depois:** me mande a lista dos seus arquivos antigos (Caixa, planilhas etc.).

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
