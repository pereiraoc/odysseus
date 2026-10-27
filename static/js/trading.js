// static/js/trading.js — grupo "Trading" (fork-local, ver LOCAL_CHANGES.md §8)
//
// Painel fino sobre o Trading Lab (container tradingagents-lab, codigo no fork
// pereiraoc/TradingAgents): toda regra (fila, carteira ficticia, tamanho, preco,
// backtest) vem da API dele via /api/trading/lab/* (routes/trading_routes.py).
// Aqui so desenho, formularios e a Agenda (Tarefas do Odysseus).
//
// Agenda: com modelo local (preset do Cookbook) cria DUAS tarefas -- a trading_run
// sem horario (trigger_type "webhook", so roda encadeada) e uma cookbook_serve
// agendada com then_task_id apontando para ela (o agendador dispara a seguinte
// quando a anterior termina com sucesso). A trading_run espera o modelo subir
// (wait_model_min). Com modelo remoto, so a trading_run agendada.
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showError, showToast, esc } from './ui.js?v=20260916largetoolscroll1';
import { nextToolWindowZ } from './toolWindowZOrder.js';

const PANEL_ID = 'trading-panel';
const API = '/api/trading';
const ANALYSTS = { market: 'Técnico', social: 'Sentimento', news: 'Notícias', fundamentals: 'Fundamentos' };
const RATINGS = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell'];
const RATING_PT = { Buy: 'Comprar', Overweight: 'Aumentar', Hold: 'Manter', Underweight: 'Reduzir', Sell: 'Vender', REVIEW: 'Revisar' };
const STATUS_PT = { queued: 'na fila', running: 'rodando', done: 'pronto', failed: 'falhou', review: 'revisar' };
const SIZING_PT = { ai_percent: 'IA (%)', ai_quantity: 'IA (qtd)', ai_amount: 'IA (valor)', default_weight: 'peso padrão', hold: 'manter' };
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const st = { tab: 'analyze', models: null, portfolios: [], pid: null, report: null, poll: null };
let els = {};

// ── util ────────────────────────────────────────────────────────────────
async function call(method, path, body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(typeof data === 'object' ? (data.detail || JSON.stringify(data)) : data.slice(0, 300));
  return data;
}
const lab = (method, path, body) => call(method, `${API}/lab${path}`, body);
const today = () => new Date().toISOString().slice(0, 10);
function day(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''; }
function money(v, cur) {
  try { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: cur || 'BRL', maximumFractionDigits: 2 }); }
  catch (_) { return Number(v || 0).toFixed(2); }
}
function pct(a, b) { return b ? ((a / b - 1) * 100) : 0; }
function signed(p) { return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`; }
function chip(text, cls = '') { return `<span class="trd-chip ${cls}">${esc(text)}</span>`; }
function ratingChip(r) {
  if (!r) return '';
  const cls = ['Buy', 'Overweight'].includes(r) ? 'up' : ['Underweight', 'Sell'].includes(r) ? 'down' : r === 'REVIEW' ? 'warn' : '';
  return chip(RATING_PT[r] || r, cls);
}
function statusChip(s) { return chip(STATUS_PT[s] || s, { done: 'ok', failed: 'down', review: 'warn', running: 'run' }[s] || ''); }
function tickers(text) { return String(text || '').split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean); }

async function loadModels() {
  if (!st.models) st.models = await call('GET', `${API}/models`);
  return st.models;
}
function modelSelect(cls = 'trd-model') {
  const m = st.models || { endpoints: [], presets: [] };
  const eps = m.endpoints.map(e => `<optgroup label="${esc(e.name)} (ligado)">${(e.models || []).map(x =>
    `<option value="ep|${esc(e.id)}|${esc(x)}">${esc(x)}</option>`).join('')}</optgroup>`).join('');
  const pre = m.presets.length ? `<optgroup label="Cookbook (precisa estar ligado)">${m.presets.map(p =>
    `<option value="preset|${esc(p.name)}">${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  return `<select class="${cls}">${eps}${pre}</select>`;
}
// valor do select → campos que routes/trading_routes.py troca por model + api_key
function modelFields(value, deepValue) {
  const [kind, a, b] = String(value || '').split('|');
  const out = kind === 'preset' ? { local_preset: a } : kind === 'ep' ? { endpoint_id: a, model_name: b } : {};
  if (deepValue) {
    const [dk, , db] = deepValue.split('|');
    if (dk === 'ep' && kind === 'ep') out.deep_model_name = db;
  }
  return out;
}
function analystBoxes() {
  return `<span class="trd-analysts">${Object.entries(ANALYSTS).map(([k, l]) =>
    `<label><input type="checkbox" value="${k}" checked> ${l}</label>`).join('')}</span>`;
}
function pickedAnalysts(root) { return [...root.querySelectorAll('.trd-analysts input:checked')].map(i => i.value); }
function portfolioSelect(withNone = true) {
  return `<select class="trd-pf">${withNone ? '<option value="">sem carteira</option>' : ''}${st.portfolios.map(p =>
    `<option value="${p.id}">${esc(p.name)} (${esc(p.currency)})</option>`).join('')}</select>`;
}
async function refreshPortfolios() { st.portfolios = (await lab('GET', '/portfolios')).portfolios; }
function stopPoll() { if (st.poll) { clearTimeout(st.poll); st.poll = null; } }

// ── Analisar ─────────────────────────────────────────────────────────────
async function renderAnalyze(pane) {
  await Promise.all([loadModels(), refreshPortfolios()]);
  pane.innerHTML = `
    <div class="trd-card">
      <div class="trd-card-h">Nova análise <span class="trd-hint">dinheiro fictício · nenhuma ordem real</span></div>
      <div class="trd-form">
        <label>Ação <input class="trd-ticker" placeholder="PETR4.SA, NVDA…"></label>
        <label>Data <input type="date" class="trd-date" value="${today()}" max="${today()}"></label>
        <label>Modelo ${modelSelect()}</label>
        <label>Modelo de decisão ${modelSelect('trd-deep').replace('<select class="trd-deep">', '<select class="trd-deep"><option value="">o mesmo</option>')}</label>
        <label>Carteira ${portfolioSelect()}</label>
      </div>
      <div class="trd-form">${analystBoxes()}<button class="trd-btn trd-primary trd-run">Rodar</button></div>
      ${(st.models.endpoints.length || st.models.presets.length) ? '' : '<div class="trd-empty">Nenhum modelo: ligue um no Cookbook ou cadastre uma API nas configurações.</div>'}
    </div>
    <div class="trd-card"><div class="trd-card-h">Fila <span class="trd-hint">uma análise por vez</span></div><div class="trd-queue">Carregando…</div></div>`;
  pane.querySelector('.trd-run').addEventListener('click', async e => {
    const t = tickers(pane.querySelector('.trd-ticker').value);
    if (!t.length) return showError('Informe a ação');
    const base = {
      date: pane.querySelector('.trd-date').value || today(), analysts: pickedAnalysts(pane),
      ...modelFields(pane.querySelector('.trd-model').value, pane.querySelector('.trd-deep').value),
    };
    const pf = pane.querySelector('.trd-pf').value;
    if (pf) base.portfolio_id = Number(pf);
    e.target.disabled = true;
    try {
      for (const ticker of t) await lab('POST', '/jobs', { ...base, ticker });
      showToast(`${t.length} análise(s) na fila`);
      pane.querySelector('.trd-ticker').value = '';
      fillQueue(pane.querySelector('.trd-queue'));
    } catch (err) { showError(`Trading: ${err.message}`); } finally { e.target.disabled = false; }
  });
  fillQueue(pane.querySelector('.trd-queue'));
}

async function fillQueue(host) {
  stopPoll();
  const { jobs } = await lab('GET', '/jobs?limit=30');
  const live = jobs.filter(j => ['queued', 'running'].includes(j.status));
  const running = live.find(j => j.status === 'running');
  const events = running ? (await lab('GET', `/jobs/${running.id}`)).events : [];
  host.innerHTML = jobs.length ? `<table class="trd-table"><thead><tr><th>#</th><th>Ação</th><th>Data</th><th>Status</th><th>Nota</th><th>Andamento</th><th></th></tr></thead><tbody>${jobs.map(j => `
    <tr><td>${j.id}</td><td>${esc(j.kind === 'backtest' ? 'backtest' : j.ticker)}${j.portfolio_id ? ` ${chip('carteira ' + j.portfolio_id)}` : ''}</td>
    <td>${day(j.trade_date)}</td><td>${statusChip(j.status)}</td><td>${ratingChip(j.rating)}</td>
    <td class="trd-small">${j.id === running?.id ? esc(events.map(e => e.agent).join(' → ') || 'começando…') : j.status === 'failed' ? esc((j.error || '').slice(0, 140)) : ''}</td>
    <td class="trd-actions">${j.status === 'failed' ? `<button class="trd-btn" data-retry="${j.id}">tentar de novo</button>` : ''}
      ${j.status === 'queued' ? `<button class="trd-btn" data-cancel="${j.id}">cancelar</button>` : ''}
      ${['done', 'review'].includes(j.status) && j.kind === 'analysis' ? `<button class="trd-btn" data-open="${j.id}">relatório</button>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<div class="trd-empty">Nada na fila ainda.</div>';
  host.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', async () => {
    try { await lab('POST', `/jobs/${b.dataset.retry}/retry`, {}); fillQueue(host); } catch (e) { showError(e.message); }
  }));
  host.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    try { await lab('DELETE', `/jobs/${b.dataset.cancel}`); fillQueue(host); } catch (e) { showError(e.message); }
  }));
  host.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { st.report = Number(b.dataset.open); switchTab('reports'); }));
  if (live.length && st.tab === 'analyze') st.poll = setTimeout(() => fillQueue(host).catch(() => {}), 5000);
}

// ── Relatórios ───────────────────────────────────────────────────────────
async function renderReports(pane) {
  const [done, review] = await Promise.all([lab('GET', '/jobs?status=done&limit=200'), lab('GET', '/jobs?status=review&limit=50')]);
  const rows = [...review.jobs, ...done.jobs].filter(j => j.kind === 'analysis');
  if (!rows.length) { pane.innerHTML = '<div class="trd-empty">Nenhum relatório ainda.</div>'; return; }
  if (!st.report || !rows.some(j => j.id === st.report)) st.report = rows[0].id;
  pane.innerHTML = `<div class="trd-split">
    <div class="trd-list">${rows.map(j => `<div class="trd-li ${j.id === st.report ? 'active' : ''}" data-id="${j.id}">
      <b>${esc(j.ticker)}</b> ${ratingChip(j.rating)}<div class="trd-small">${day(j.trade_date)} · ${esc(j.model?.quick || '')}</div></div>`).join('')}</div>
    <div class="trd-viewer"></div></div>`;
  pane.querySelectorAll('.trd-li').forEach(li => li.addEventListener('click', () => { st.report = Number(li.dataset.id); renderReports(pane); }));
  const job = rows.find(j => j.id === st.report);
  const viewer = pane.querySelector('.trd-viewer');
  const reviewBar = job.status === 'review' ? `<div class="trd-form trd-review">A nota final não pôde ser lida. Decida:
      <select class="trd-resolve">${RATINGS.map(r => `<option value="${r}">${RATING_PT[r]}</option>`).join('')}<option value="">ignorar</option></select>
      <button class="trd-btn trd-primary trd-apply">Aplicar</button></div>` : '';
  viewer.innerHTML = `${reviewBar}<div class="trd-form"><button class="trd-btn trd-md">Baixar Markdown</button></div>
    <iframe class="trd-report" sandbox title="Relatório"></iframe>`;
  try { viewer.querySelector('.trd-report').srcdoc = await lab('GET', `/reports/${job.id}`); }
  catch (e) { viewer.querySelector('.trd-report').replaceWith(Object.assign(document.createElement('div'), { className: 'trd-empty', textContent: e.message })); }
  viewer.querySelector('.trd-md').addEventListener('click', async () => {
    const md = await lab('GET', `/reports/${job.id}/md`);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })),
      download: `${job.ticker}_${job.trade_date}.md` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  viewer.querySelector('.trd-apply')?.addEventListener('click', async () => {
    try { await lab('POST', `/jobs/${job.id}/resolve`, { rating: viewer.querySelector('.trd-resolve').value || null }); renderReports(pane); }
    catch (e) { showError(e.message); }
  });
}

// ── Carteiras ────────────────────────────────────────────────────────────
function lineChart(host, a, b) {
  const W = 760, H = 220, P = 34;
  const all = [...a, ...b].map(x => x.value);
  if (a.length < 2) { host.innerHTML = '<div class="trd-empty">A curva aparece depois de alguns pregões.</div>'; return; }
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const x = i => P + (i / (a.length - 1)) * (W - P - 8);
  const y = v => H - 18 - ((v - min) / span) * (H - 30);
  const path = s => s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const bIdx = new Map(b.map(p => [p.date, p]));
  const bAligned = a.map(p => bIdx.get(p.date)).filter(Boolean);
  host.innerHTML = `<svg class="trd-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line class="trd-grid" x1="${P}" x2="${W - 8}" y1="${y(min)}" y2="${y(min)}"/><line class="trd-grid" x1="${P}" x2="${W - 8}" y1="${y(max)}" y2="${y(max)}"/>
    <text class="trd-axis" x="2" y="${y(max) + 4}">${Math.round(max)}</text><text class="trd-axis" x="2" y="${y(min) + 4}">${Math.round(min)}</text>
    <text class="trd-axis" x="${P}" y="${H - 3}">${day(a[0].date)}</text><text class="trd-axis" x="${W - 70}" y="${H - 3}">${day(a.at(-1).date)}</text>
    ${bAligned.length > 1 ? `<path d="${path(bAligned)}" class="trd-line bench"/>` : ''}<path d="${path(a)}" class="trd-line"/></svg>
    <div class="trd-legend"><span><i class="me"></i>carteira</span><span><i class="bench"></i>índice</span></div>`;
}

async function renderPortfolios(pane) {
  await Promise.all([loadModels(), refreshPortfolios()]);
  if (st.pid && !st.portfolios.some(p => p.id === st.pid)) st.pid = null;
  st.pid = st.pid || st.portfolios[0]?.id || null;
  pane.innerHTML = `<div class="trd-split">
    <div class="trd-list">${st.portfolios.map(p => `<div class="trd-li ${p.id === st.pid ? 'active' : ''}" data-id="${p.id}">
      <b>${esc(p.name)}</b> ${chip(p.mode === 'replay' ? 'reencenação' : 'ao vivo')}<div class="trd-small">${esc(p.currency)} · ${money(p.initial_cash, p.currency)}</div></div>`).join('')}
      <button class="trd-btn trd-new">+ nova carteira</button></div>
    <div class="trd-viewer trd-pf-detail"></div></div>`;
  pane.querySelectorAll('.trd-li').forEach(li => li.addEventListener('click', () => { st.pid = Number(li.dataset.id); renderPortfolios(pane); }));
  pane.querySelector('.trd-new').addEventListener('click', () => newPortfolioForm(pane.querySelector('.trd-pf-detail'), pane));
  const host = pane.querySelector('.trd-pf-detail');
  if (!st.pid) { newPortfolioForm(host, pane); return; }
  const s = await lab('GET', `/portfolios/${st.pid}`);
  const p = s.portfolio, cur = p.currency;
  const bench = s.benchmark_curve.at(-1)?.value;
  host.innerHTML = `
    <div class="trd-kpis">
      <div class="trd-kpi"><span>Valor</span><b>${money(s.value, cur)}</b><small>${signed(pct(s.value, p.initial_cash))}</small></div>
      <div class="trd-kpi"><span>Caixa</span><b>${money(s.cash, cur)}</b></div>
      <div class="trd-kpi"><span>Índice (${esc(p.benchmark)})</span><b>${bench ? signed(pct(bench, p.initial_cash)) : '—'}</b><small>no mesmo período</small></div>
      <div class="trd-kpi"><span>Operações</span><b>${s.trades.filter(t => t.status === 'filled').length}</b><small>${s.trades.filter(t => t.status === 'pending').length} pendentes</small></div>
    </div>
    <div class="trd-card"><div class="trd-chart"></div></div>
    ${p.mode === 'live' ? `<div class="trd-card"><div class="trd-card-h">Rodar agora nesta carteira</div><div class="trd-form">
      <label>Ações <input class="trd-run-t" placeholder="PETR4.SA VALE3.SA"></label><label>Modelo ${modelSelect()}</label>
      ${analystBoxes()}<button class="trd-btn trd-primary trd-run-pf">Enfileirar</button></div></div>` : ''}
    <div class="trd-card"><div class="trd-card-h">Posições</div>${s.positions.length ? `<table class="trd-table"><thead><tr><th>Ação</th><th class="num">Qtd</th><th class="num">Preço médio</th><th class="num">Último</th><th class="num">Valor</th><th class="num">Resultado</th></tr></thead><tbody>${s.positions.map(x => `
      <tr><td>${esc(x.ticker)}</td><td class="num">${x.quantity}</td><td class="num">${money(x.avg_price, cur)}</td><td class="num">${money(x.last, cur)}</td>
      <td class="num">${money(x.value, cur)}</td><td class="num ${x.last >= x.avg_price ? 'pos' : 'neg'}">${signed(pct(x.last, x.avg_price))}</td></tr>`).join('')}</tbody></table>` : '<div class="trd-empty">Sem posições.</div>'}</div>
    <div class="trd-card"><div class="trd-card-h">Extrato</div>${s.trades.length ? `<table class="trd-table"><thead><tr><th>Análise</th><th>Ação</th><th>Nota</th><th>Operação</th><th class="num">Qtd</th><th class="num">Preço</th><th>Execução</th><th>Tamanho</th><th></th></tr></thead><tbody>${s.trades.map(t => `
      <tr><td>${day(t.trade_date)}</td><td>${esc(t.ticker)}</td><td>${ratingChip(t.rating)}</td>
      <td>${t.status === 'filled' ? chip(t.side === 'buy' ? 'compra' : 'venda', t.side === 'buy' ? 'up' : 'down') : t.status === 'pending' ? chip('pendente', 'warn') : chip(t.reason || 'sem operação')}</td>
      <td class="num">${t.quantity ?? ''}</td><td class="num">${t.price ? money(t.price, cur) : ''}</td><td>${day(t.fill_date)}</td>
      <td class="trd-small">${esc(SIZING_PT[t.sizing_source] || t.sizing_source || '')}</td>
      <td>${t.job_id ? `<button class="trd-btn" data-open="${t.job_id}">relatório</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="trd-empty">Nenhuma decisão ainda.</div>'}</div>`;
  lineChart(host.querySelector('.trd-chart'), s.curve, s.benchmark_curve);
  host.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { st.report = Number(b.dataset.open); switchTab('reports'); }));
  host.querySelector('.trd-run-pf')?.addEventListener('click', async () => {
    const t = tickers(host.querySelector('.trd-run-t').value);
    if (!t.length) return showError('Informe as ações');
    try {
      const r = await lab('POST', `/portfolios/${p.id}/run`, { tickers: t, analysts: pickedAnalysts(host), ...modelFields(host.querySelector('.trd-model').value) });
      showToast(`${r.ids.length} análise(s) na fila`);
    } catch (e) { showError(`Trading: ${e.message}`); }
  });
}

function newPortfolioForm(host, pane) {
  host.innerHTML = `<div class="trd-card"><div class="trd-card-h">Nova carteira fictícia</div>
    <div class="trd-form"><label>Nome <input class="trd-n" value="Teste"></label>
      <label>Moeda <select class="trd-cur"><option>BRL</option><option>USD</option></select></label>
      <label>Dinheiro inicial <input type="number" class="trd-cash" value="10000" min="1"></label>
      <label>Modo <select class="trd-mode"><option value="live">ao vivo (de hoje em diante)</option><option value="replay">reencenar um período passado</option></select></label></div>
    <div class="trd-form trd-replay hidden"><label>Ações <input class="trd-rt" placeholder="PETR4.SA VALE3.SA"></label>
      <label>Início <input type="date" class="trd-rs" max="${today()}"></label><label>Fim <input type="date" class="trd-re" max="${today()}"></label>
      <label>A cada (dias) <input type="number" class="trd-rev" value="7" min="1"></label><label>Modelo ${modelSelect()}</label>${analystBoxes()}</div>
    <div class="trd-hint">Ações .SA = BRL (índice Ibovespa); EUA = USD (índice SPY). Uma moeda por carteira.</div>
    <div class="trd-form"><button class="trd-btn trd-primary trd-create">Criar</button></div></div>`;
  const mode = host.querySelector('.trd-mode');
  mode.addEventListener('change', () => host.querySelector('.trd-replay').classList.toggle('hidden', mode.value !== 'replay'));
  host.querySelector('.trd-create').addEventListener('click', async () => {
    const body = { name: host.querySelector('.trd-n').value.trim() || 'Carteira', currency: host.querySelector('.trd-cur').value,
      initial_cash: Number(host.querySelector('.trd-cash').value), mode: mode.value };
    if (mode.value === 'replay') {
      body.replay = { tickers: tickers(host.querySelector('.trd-rt').value), start: host.querySelector('.trd-rs').value,
        end: host.querySelector('.trd-re').value, every_days: Number(host.querySelector('.trd-rev').value) || 7,
        analysts: pickedAnalysts(host), ...modelFields(host.querySelector('.trd-model').value) };
      if (!body.replay.tickers.length || !body.replay.start || !body.replay.end) return showError('Reencenação: ações, início e fim');
    }
    try { st.pid = (await lab('POST', '/portfolios', body)).id; renderPortfolios(pane); }
    catch (e) { showError(`Trading: ${e.message}`); }
  });
}

// ── Backtest ─────────────────────────────────────────────────────────────
async function renderBacktest(pane) {
  await loadModels();
  const { backtests } = await lab('GET', '/backtests');
  pane.innerHTML = `<div class="trd-card"><div class="trd-card-h">Novo backtest <span class="trd-hint">mede acerto das notas; não simula carteira</span></div>
    <div class="trd-form"><label>Ações <input class="trd-bt" placeholder="NVDA AAPL"></label>
      <label>Início <input type="date" class="trd-bs" max="${today()}"></label><label>Fim <input type="date" class="trd-be" max="${today()}"></label>
      <label>A cada (dias) <input type="number" class="trd-bev" value="7" min="1"></label><label>Modelo ${modelSelect()}</label></div>
    <div class="trd-form">${analystBoxes()}<button class="trd-btn trd-primary trd-bgo">Enfileirar</button></div></div>
    ${backtests.map(b => `<div class="trd-card"><div class="trd-card-h">#${b.id} ${esc(b.tickers.join(', '))} · ${day(b.start)}–${day(b.end)} a cada ${b.every_days}d ${statusChip(b.status)}</div>
      ${b.summary ? `${b.summary.by_rating ? `<table class="trd-table"><thead><tr><th>Nota</th><th class="num">n</th><th class="num">Acertou a direção</th><th class="num">Alfa médio</th></tr></thead><tbody>${Object.entries(b.summary.by_rating).map(([r, v]) => `
        <tr><td>${ratingChip(r)}</td><td class="num">${v.count}</td><td class="num">${v.hit_rate == null ? '—' : Math.round(v.hit_rate * 100) + '%'}</td><td class="num">${(v.mean_alpha * 100).toFixed(2)}%</td></tr>`).join('')}</tbody></table>` : ''}
        <pre class="trd-pre">${esc(b.summary.text || '')}</pre>` : '<div class="trd-small">acompanhe na aba Analisar › Fila</div>'}</div>`).join('')}`;
  pane.querySelector('.trd-bgo').addEventListener('click', async () => {
    const body = { tickers: tickers(pane.querySelector('.trd-bt').value), start: pane.querySelector('.trd-bs').value,
      end: pane.querySelector('.trd-be').value, every_days: Number(pane.querySelector('.trd-bev').value) || 7,
      analysts: pickedAnalysts(pane), ...modelFields(pane.querySelector('.trd-model').value) };
    if (!body.tickers.length || !body.start || !body.end) return showError('Backtest: ações, início e fim');
    try { await lab('POST', '/backtests', body); renderBacktest(pane); } catch (e) { showError(`Trading: ${e.message}`); }
  });
}

// ── Agenda ───────────────────────────────────────────────────────────────
async function renderSchedule(pane) {
  await Promise.all([loadModels(), refreshPortfolios()]);
  const [{ watchlists }, { tasks }] = await Promise.all([lab('GET', '/watchlists'), call('GET', '/api/tasks')]);
  const mine = tasks.filter(t => t.action === 'trading_run' || (t.action === 'cookbook_serve' && tasks.some(x => x.id === t.then_task_id && x.action === 'trading_run')));
  const when = t => t.trigger_type === 'webhook' ? 'quando o modelo ligar' : `${t.schedule === 'weekly' ? WEEKDAYS[t.scheduled_day ?? 0] + ' ' : 'todo dia '}${t.scheduled_time}`;
  pane.innerHTML = `
    <div class="trd-card"><div class="trd-card-h">Listas de ações</div>
      ${watchlists.map(w => `<div class="trd-row"><b>${esc(w.name)}</b> <span class="trd-small">${esc(w.tickers.join(' '))}</span><button class="trd-btn" data-delwl="${w.id}">excluir</button></div>`).join('') || '<div class="trd-small">Nenhuma lista.</div>'}
      <div class="trd-form"><label>Nome <input class="trd-wn"></label><label>Ações <input class="trd-wt" placeholder="PETR4.SA VALE3.SA ITUB4.SA"></label><button class="trd-btn trd-wadd">Salvar lista</button></div></div>
    <div class="trd-card"><div class="trd-card-h">Nova agenda <span class="trd-hint">vira Tarefa do Odysseus (avisa ao terminar)</span></div>
      <div class="trd-form"><label>Lista <select class="trd-swl">${watchlists.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
        <label>Carteira ${portfolioSelect()}</label><label>Modelo ${modelSelect()}</label></div>
      <div class="trd-form"><label>Frequência <select class="trd-sf"><option value="daily">todo dia</option><option value="weekly">toda semana</option></select></label>
        <label>Dia <select class="trd-sd">${WEEKDAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
        <label>Hora <input type="time" class="trd-sh" value="03:00"></label>
        <label>Desligar o modelo local após (min) <input type="number" class="trd-send" value="240" min="30"></label>
        ${analystBoxes()}<button class="trd-btn trd-primary trd-sadd">Agendar</button></div></div>
    <div class="trd-card"><div class="trd-card-h">Agendas</div>${mine.length ? mine.map(t => `<div class="trd-row">
      <b>${esc(t.name)}</b> ${chip(when(t))} ${chip(t.status, t.status === 'active' ? 'ok' : '')}
      <span class="trd-small">${t.last_run ? 'última: ' + new Date(t.last_run).toLocaleString('pt-BR') : ''}</span>
      <button class="trd-btn" data-runtask="${t.id}">rodar agora</button><button class="trd-btn" data-deltask="${t.id}">excluir</button></div>`).join('') : '<div class="trd-small">Nenhuma agenda.</div>'}</div>`;
  pane.querySelectorAll('[data-delwl]').forEach(b => b.addEventListener('click', async () => { await lab('DELETE', `/watchlists/${b.dataset.delwl}`); renderSchedule(pane); }));
  pane.querySelector('.trd-wadd').addEventListener('click', async () => {
    const name = pane.querySelector('.trd-wn').value.trim(), t = tickers(pane.querySelector('.trd-wt').value);
    if (!name || !t.length) return showError('Lista: nome e ações');
    try { await lab('POST', '/watchlists', { name, tickers: t }); renderSchedule(pane); } catch (e) { showError(e.message); }
  });
  pane.querySelectorAll('[data-deltask]').forEach(b => b.addEventListener('click', async () => {
    try { await call('DELETE', `/api/tasks/${b.dataset.deltask}`); renderSchedule(pane); } catch (e) { showError(e.message); }
  }));
  pane.querySelectorAll('[data-runtask]').forEach(b => b.addEventListener('click', async () => {
    try { await call('POST', `/api/tasks/${b.dataset.runtask}/run`); showToast('Disparado — acompanhe em Analisar › Fila'); } catch (e) { showError(e.message); }
  }));
  pane.querySelector('.trd-sadd').addEventListener('click', async e => {
    const wl = pane.querySelector('.trd-swl').value;
    if (!wl) return showError('Crie uma lista de ações antes');
    const model = modelFields(pane.querySelector('.trd-model').value);
    const pf = pane.querySelector('.trd-pf').value;
    const cfg = { watchlist_id: Number(wl), analysts: pickedAnalysts(pane), ...model, wait_model_min: 30 };
    if (pf) cfg.portfolio_id = Number(pf);
    else { const w = watchlists.find(x => x.id === Number(wl)); cfg.tickers = w ? w.tickers : []; }
    const sched = { schedule: pane.querySelector('.trd-sf').value, scheduled_time: pane.querySelector('.trd-sh').value || '03:00',
      scheduled_day: pane.querySelector('.trd-sf').value === 'weekly' ? Number(pane.querySelector('.trd-sd').value) : null };
    const name = `Trading: ${watchlists.find(x => x.id === Number(wl))?.name || 'lista'}`;
    e.target.disabled = true;
    try {
      if (model.local_preset) {
        const run = await call('POST', '/api/tasks', { name, prompt: JSON.stringify(cfg), task_type: 'action', action: 'trading_run',
          trigger_type: 'webhook', notifications_enabled: true });
        await call('POST', '/api/tasks', { name: `${name} — ligar ${model.local_preset}`, task_type: 'action', action: 'cookbook_serve',
          prompt: JSON.stringify({ preset: model.local_preset, end_after_min: Number(pane.querySelector('.trd-send').value) || 240 }),
          ...sched, then_task_id: run.id ?? run.task?.id, notifications_enabled: false });
      } else {
        await call('POST', '/api/tasks', { name, prompt: JSON.stringify(cfg), task_type: 'action', action: 'trading_run', ...sched, notifications_enabled: true });
      }
      showToast('Agenda criada');
      renderSchedule(pane);
    } catch (err) { showError(`Trading: ${err.message}`); } finally { e.target.disabled = false; }
  });
}

// ── shell (mesmo molde do finance.js) ────────────────────────────────────
const TABS = {
  analyze: ['Analisar', renderAnalyze], reports: ['Relatórios', renderReports], portfolios: ['Carteiras', renderPortfolios],
  backtest: ['Backtest', renderBacktest], schedule: ['Agenda', renderSchedule],
};

function switchTab(tab) { st.tab = tab; try { localStorage.setItem('odysseus-trd-tab', tab); } catch (_) {} render(); }

async function render() {
  if (!els.body) return;
  stopPoll();
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = els.body;
  if (!pane.children.length) pane.innerHTML = '<div class="trd-empty">Carregando…</div>';
  pane.style.opacity = '0.55';
  try {
    await TABS[st.tab][1](pane);
  } catch (e) {
    const down = /fora do ar|503/.test(e.message);
    pane.innerHTML = `<div class="trd-empty">${down ? 'Trading Lab fora do ar — <code>docker compose up -d tradingagents-lab</code> na pasta do Odysseus.' : 'Falhou: ' + esc(e.message)}</div>`;
  } finally {
    pane.style.opacity = '';
  }
}

async function refreshStatus() {
  try {
    const h = await lab('GET', '/health');
    els.status.textContent = `motor ${h.version} · ${h.running ? 'rodando #' + h.running : 'parado'} · ${h.queued} na fila`;
  } catch (_) { els.status.textContent = 'motor fora do ar'; }
}

function buildPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'modal hidden';
  panel.innerHTML = `
    <div class="modal-content trd-content">
      <div class="modal-header trd-header">
        <span class="trd-titlebar">Trading</span>
        <span class="trd-status"></span>
        <button class="close-btn" aria-label="Fechar">✖</button>
      </div>
      <div class="trd-tabs">${Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="trd-body"></div>
    </div>`;
  document.body.appendChild(panel);
  els = { panel, content: panel.querySelector('.modal-content'), header: panel.querySelector('.modal-header'),
    tabs: panel.querySelector('.trd-tabs'), body: panel.querySelector('.trd-body'), status: panel.querySelector('.trd-status') };
  panel.querySelector('.close-btn').addEventListener('click', () => { stopPoll(); Modals.close(PANEL_ID); });
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', () => {
    try {
      panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
    } catch (_) {}
  }, true);
  els.tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  try { st.tab = localStorage.getItem('odysseus-trd-tab') || 'analyze'; } catch (_) {}
  if (!TABS[st.tab]) st.tab = 'analyze';
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, { label: 'Trading', restoreFn: () => {}, closeFn: () => { stopPoll(); document.getElementById(PANEL_ID)?.classList.add('hidden'); } });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
  return panel;
}

async function openPanel() {
  const panel = buildPanel();
  panel.classList.remove('hidden');
  try {
    panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
  } catch (_) {}
  st.models = null;  // modelos ligados mudam (Cookbook): relê a cada abertura
  refreshStatus();
  render();
}

function mountSidebar() {
  const list = document.getElementById('trading-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  const item = document.createElement('div');
  item.className = 'list-item trd-side-item';
  item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg><span class="grow">Análises e carteiras fictícias</span>`;
  item.addEventListener('click', openPanel);
  list.append(item);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebar);
else mountSidebar();

export { openPanel };
