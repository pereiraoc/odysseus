// static/js/trading.js — grupo "Trading" (fork-local, ver LOCAL_CHANGES.md §8)
//
// Painel fino sobre o Trading Lab (container tradingagents-lab, codigo no fork
// pereiraoc/TradingAgents): toda regra (fila, carteira ficticia, tamanho, preco,
// backtest, radar) vem da API dele via /api/trading/lab/* (routes/trading_routes.py).
// Aqui so desenho, formularios, o modelo escolhido e a Agenda (Tarefas do Odysseus).
//
// Modelo: um so, escolhido no topo (vale para tudo); presets do Cookbook mostram se estao
// ligados e ganham "Ligar" (tarefa cookbook_serve disparada na hora, mesmo mecanismo da
// Agenda). Uma analise com o modelo desligado ESPERA na fila (o lab nao falha).
//
// Agenda: com preset local cria DUAS tarefas -- trading_run sem horario (trigger_type
// "webhook", so roda encadeada) e cookbook_serve agendada com then_task_id para ela.
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
const SOURCE_PT = { bloomberg: 'Bloomberg', figure_news: 'Notícia', congress: 'Congresso EUA', insider: 'Executivo (SEC)' };
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
// Etapas do grafo, na ordem em que o lab manda os eventos (runner.REPORT_AGENTS + DEBATES)
const PIPELINE = [
  ['Analistas', [['Market Analyst', 'Técnico', 'market'], ['Sentiment Analyst', 'Sentimento', 'social'], ['News Analyst', 'Notícias', 'news'], ['Fundamentals Analyst', 'Fundamentos', 'fundamentals']]],
  ['Pesquisa', [['Bull Researcher', 'Otimista'], ['Bear Researcher', 'Pessimista'], ['Research Manager', 'Gerente']]],
  ['Trader', [['Trader', 'Trader']]],
  ['Risco', [['Aggressive Analyst', 'Agressivo'], ['Conservative Analyst', 'Conservador'], ['Neutral Analyst', 'Neutro']]],
  ['Decisão', [['Portfolio Manager', 'Gestor']]],
];
const AGENT_PT = Object.fromEntries(PIPELINE.flatMap(([, a]) => a.map(([k, l]) => [k, l])));

const st = { tab: 'home', models: null, model: '', portfolios: [], pid: null, report: null, poll: null, focus: null, analysts: new Set(Object.keys(ANALYSTS)) };
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
const save = (k, v) => { try { localStorage.setItem(`odysseus-trd-${k}`, v); } catch (_) {} };
const load = k => { try { return localStorage.getItem(`odysseus-trd-${k}`); } catch (_) { return null; } };
function day(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''; }
// third-party feed URLs: only http(s) become links (no javascript:/data:)
function link(url, text) {
  return /^https?:\/\//i.test(url || '') ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text);
}
function ago(ts) {
  if (!ts) return '';
  const s = (Date.now() - new Date(ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z').getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
function money(v, cur) {
  try { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: cur || 'BRL', maximumFractionDigits: 2 }); }
  catch (_) { return Number(v || 0).toFixed(2); }
}
function pct(a, b) { return b ? ((a / b - 1) * 100) : 0; }
function signed(p) { return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`; }
function chip(text, cls = '') { return `<span class="trd-chip ${cls}">${esc(text)}</span>`; }
function ratingCls(r) { return ['Buy', 'Overweight'].includes(r) ? 'up' : ['Underweight', 'Sell'].includes(r) ? 'down' : r === 'REVIEW' ? 'warn' : ''; }
function ratingChip(r) { return r ? chip(RATING_PT[r] || r, ratingCls(r)) : ''; }
function statusChip(s) { return chip(STATUS_PT[s] || s, { done: 'ok', failed: 'down', review: 'warn', running: 'run' }[s] || ''); }
function tickers(text) { return String(text || '').split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean); }
function stopPoll() { if (st.poll) { clearTimeout(st.poll); st.poll = null; } }
function poll(fn, ms = 4000) { stopPoll(); st.poll = setTimeout(() => fn().catch(() => {}), ms); }
function card(title, body, extra = '') { return `<section class="trd-card"><header class="trd-card-h">${title}${extra}</header>${body}</section>`; }
function empty(text) { return `<div class="trd-empty">${text}</div>`; }

// ── modelo (um so, no topo) ──────────────────────────────────────────────
async function loadModels(force = false) {
  if (!st.models || force) st.models = await call('GET', `${API}/models`);
  const options = modelOptions();
  if (!options.some(o => o.value === st.model)) st.model = load('model') || '';
  if (!options.some(o => o.value === st.model)) st.model = (options.find(o => o.running) || options.find(o => o.recent) || options[0])?.value || '';
  return st.models;
}
function modelOptions() {
  const m = st.models || { endpoints: [], presets: [] };
  return [
    ...m.presets.map(p => ({ value: `preset|${p.name}`, label: p.name, group: 'Cookbook (local)', running: p.running, recent: p.recent, preset: p.name })),
    ...m.endpoints.flatMap(e => (e.models || []).map(x => ({ value: `ep|${e.id}|${x}`, label: x, group: e.name, running: e.running !== false }))),
  ];
}
function currentModel() { return modelOptions().find(o => o.value === st.model); }
function modelFields() {
  const [kind, a, b] = String(st.model || '').split('|');
  return kind === 'preset' ? { local_preset: a } : kind === 'ep' ? { endpoint_id: a, model_name: b } : {};
}
function renderModelBar() {
  const opts = modelOptions();
  const cur = currentModel();
  const groups = [...new Set(opts.map(o => o.group))];
  els.modelbar.innerHTML = opts.length ? `
    <span class="trd-mb-label">Modelo</span>
    <select class="trd-mb-select">${groups.map(g => `<optgroup label="${esc(g)}">${opts.filter(o => o.group === g).map(o =>
      `<option value="${esc(o.value)}" ${o.value === st.model ? 'selected' : ''}>${o.running ? '● ' : '○ '}${esc(o.label)}</option>`).join('')}</optgroup>`).join('')}</select>
    <span class="trd-dot ${cur?.running ? 'on' : 'off'}"></span><span class="trd-mb-state">${cur?.running ? 'ligado' : 'desligado'}</span>
    ${cur?.preset && !cur.running ? '<button class="trd-btn trd-primary trd-mb-start">Ligar</button>' : ''}
    <button class="trd-btn trd-ghost trd-mb-refresh" title="Atualizar">↻</button>`
    : '<span class="trd-mb-label">Nenhum modelo — ligue um no Cookbook ou cadastre uma API nas configurações.</span>';
  els.modelbar.querySelector('.trd-mb-select')?.addEventListener('change', e => { st.model = e.target.value; save('model', st.model); renderModelBar(); });
  els.modelbar.querySelector('.trd-mb-refresh')?.addEventListener('click', async () => { await loadModels(true); renderModelBar(); });
  els.modelbar.querySelector('.trd-mb-start')?.addEventListener('click', e => startPreset(cur.preset, e.target));
}
// Liga o preset pelo mesmo caminho da Agenda: tarefa cookbook_serve (webhook) disparada agora.
async function startPreset(preset, btn) {
  btn.disabled = true; btn.textContent = 'ligando…';
  try {
    const name = `Trading — ligar ${preset}`;
    const { tasks } = await call('GET', '/api/tasks');
    let task = tasks.find(t => t.name === name && t.action === 'cookbook_serve');
    if (!task) {
      task = await call('POST', '/api/tasks', { name, task_type: 'action', action: 'cookbook_serve', trigger_type: 'webhook',
        prompt: JSON.stringify({ preset, end_after_min: 240 }), notifications_enabled: false });
    }
    await call('POST', `/api/tasks/${task.id}/run`);
    showToast(`Ligando ${preset} — leva 1–2 min; as análises na fila esperam por ele (desliga sozinho em 4 h)`);
    setTimeout(async () => { await loadModels(true).catch(() => {}); renderModelBar(); }, 60000);
  } catch (e) { showError(`Ligar ${preset}: ${e.message}`); btn.disabled = false; btn.textContent = 'Ligar'; }
}

// ── campo de ação com busca ──────────────────────────────────────────────
function tickerField(cls, placeholder = 'Ação: PETR4, Nvidia, VALE3…') {
  return `<div class="trd-search"><input class="${cls}" placeholder="${placeholder}" autocomplete="off" spellcheck="false"><div class="trd-suggest hidden"></div></div>`;
}
function wireTicker(root, cls, onPick) {
  const input = root.querySelector(`.${cls}`), box = input.nextElementSibling;
  let timer = null, seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.split(/[\s,;]+/).pop();
    if (q.length < 2) { box.classList.add('hidden'); return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const { results } = await lab('GET', `/search?q=${encodeURIComponent(q)}`);
        if (mine !== seq) return;
        box.innerHTML = results.slice(0, 7).map(r => `<button type="button" data-sym="${esc(r.symbol)}"><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span><small>${esc(r.exchange)}</small></button>`).join('');
        box.classList.toggle('hidden', !results.length);
      } catch (_) { box.classList.add('hidden'); }
    }, 300);
  });
  box.addEventListener('mousedown', e => {
    const b = e.target.closest('[data-sym]');
    if (!b) return;
    e.preventDefault();
    const parts = input.value.split(/([\s,;]+)/);
    parts[parts.length - 1] = b.dataset.sym;
    input.value = parts.join('') + ' ';
    box.classList.add('hidden');
    input.focus();
    onPick?.(b.dataset.sym);
  });
  input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 150));
}
function analystToggles() {
  return `<div class="trd-toggles">${Object.entries(ANALYSTS).map(([k, l]) =>
    `<button type="button" class="trd-toggle ${st.analysts.has(k) ? 'on' : ''}" data-an="${k}">${l}</button>`).join('')}</div>`;
}
function wireToggles(root) {
  root.querySelectorAll('[data-an]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.an;
    if (st.analysts.has(k) && st.analysts.size > 1) st.analysts.delete(k); else st.analysts.add(k);
    root.querySelectorAll(`[data-an="${k}"]`).forEach(x => x.classList.toggle('on', st.analysts.has(k)));
  }));
}
async function refreshPortfolios() { st.portfolios = (await lab('GET', '/portfolios')).portfolios; }
function portfolioSelect(cls = 'trd-pf', none = 'sem carteira') {
  return `<select class="${cls}">${none ? `<option value="">${none}</option>` : ''}${st.portfolios.map(p =>
    `<option value="${p.id}">${esc(p.name)} · ${esc(p.currency)}</option>`).join('')}</select>`;
}
function needModel() {
  if (!st.model) { showError('Escolha um modelo no topo'); return false; }
  return true;
}

// ── andamento ao vivo (estilo do painel do TradingAgents) ───────────────
function pipelineHTML(job, events) {
  const done = new Set(events.map(e => e.agent));
  const waiting = events.length && events.at(-1).agent === 'Modelo' && job.status === 'queued';
  const picked = new Set(job.analysts?.length ? job.analysts : Object.keys(ANALYSTS));
  const firstPending = PIPELINE.flatMap(([, a]) => a).find(([k, , an]) => !done.has(k) && (!an || picked.has(an)));
  const stages = PIPELINE.map(([stage, agents]) => `<div class="trd-stage"><div class="trd-stage-h">${stage}</div>${agents.map(([k, l, an]) => {
    const skipped = an && !picked.has(an);
    const cls = skipped ? 'skip' : done.has(k) ? 'done' : (job.status === 'running' && firstPending?.[0] === k) ? 'now' : '';
    return `<div class="trd-agent ${cls}">${cls === 'done' ? '✓' : cls === 'now' ? '▸' : '·'} ${l}</div>`;
  }).join('')}</div>`).join('<div class="trd-arrow">→</div>');
  const feed = events.filter(e => e.note && e.agent !== 'Modelo').slice().reverse().map(e => `<div class="trd-feed-item">
    <div class="trd-feed-h"><b>${esc(AGENT_PT[e.agent] || e.agent)}</b><span>${esc(ago(e.ts))}</span></div>
    <div class="trd-feed-t">${esc(e.note)}${e.note.length >= 600 ? '…' : ''}</div></div>`).join('');
  return `
    <div class="trd-run-h"><b class="trd-big">${esc(job.ticker || 'backtest')}</b><span>${day(job.trade_date)}</span>${statusChip(job.status)}${ratingChip(job.rating)}
      <span class="trd-grow"></span><span class="trd-small">${esc(job.model?.quick || '')}</span></div>
    ${waiting ? `<div class="trd-banner">Esperando o modelo responder — ligue-o no topo. A análise começa sozinha quando ele subir.</div>` : ''}
    ${job.status === 'failed' ? `<div class="trd-banner bad">${esc(job.error || 'falhou')} <button class="trd-btn" data-retry="${job.id}">tentar de novo</button></div>` : ''}
    <div class="trd-pipeline">${stages}</div>
    ${feed ? `<div class="trd-feed">${feed}</div>` : ''}
    ${['done', 'review'].includes(job.status) ? `<button class="trd-btn trd-primary" data-open="${job.id}">Abrir relatório</button>` : ''}`;
}
function wireJobButtons(host, after) {
  host.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', async () => {
    try { await lab('POST', `/jobs/${b.dataset.retry}/retry`, {}); after(); } catch (e) { showError(e.message); }
  }));
  host.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    try { await lab('DELETE', `/jobs/${b.dataset.cancel}`); after(); } catch (e) { showError(e.message); }
  }));
  host.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { st.report = Number(b.dataset.open); switchTab('reports'); }));
  host.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => { st.focus = Number(b.dataset.focus); after(); }));
}
function queueRows(jobs) {
  return jobs.length ? `<div class="trd-rows">${jobs.map(j => `<div class="trd-row ${j.id === st.focus ? 'sel' : ''}" data-focus="${j.id}">
    <b>${esc(j.kind === 'analysis' ? j.ticker : j.kind)}</b><span class="trd-small">${day(j.trade_date)}</span>${statusChip(j.status)}${ratingChip(j.rating)}
    ${j.payload?.from === 'radar' ? chip('radar') : ''}${j.blocked_by && j.status === 'queued' ? chip(`parado: #${j.blocked_by} falhou`, 'warn') : ''}<span class="trd-grow"></span>
    ${j.status === 'queued' ? `<button class="trd-btn trd-ghost" data-cancel="${j.id}">cancelar</button>` : ''}
    ${j.status === 'failed' ? `<button class="trd-btn trd-ghost" data-retry="${j.id}">tentar de novo</button>` : ''}</div>`).join('')}</div>` : empty('Nada na fila.');
}

// ── Início ───────────────────────────────────────────────────────────────
function sparkline(curve) {
  if (!curve || curve.length < 2) return '';
  const v = curve.map(p => p.value), min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * 100).toFixed(1)},${(28 - (x - min) / span * 26).toFixed(1)}`).join(' ');
  return `<svg class="trd-spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}
async function renderHome(pane) {
  await refreshPortfolios();
  const [{ jobs }, rd, snaps] = await Promise.all([
    lab('GET', '/jobs?limit=40'), lab('GET', '/radar?days=7').catch(() => null),
    Promise.all(st.portfolios.map(p => lab('GET', `/portfolios/${p.id}`).catch(() => null))),
  ]);
  const live = jobs.filter(j => ['running', 'queued'].includes(j.status));
  const running = jobs.find(j => j.status === 'running') || live[0];
  const ev = running ? (await lab('GET', `/jobs/${running.id}`)).events : [];
  const decided = jobs.filter(j => j.kind === 'analysis' && ['done', 'review'].includes(j.status)).slice(0, 8);
  const pcards = snaps.filter(Boolean).map(s => {
    const p = s.portfolio, ret = pct(s.value, p.initial_cash), bench = s.benchmark_curve.at(-1)?.value;
    return `<div class="trd-pcard" data-pid="${p.id}"><div class="trd-pcard-h"><b>${esc(p.name)}</b>${chip(p.mode === 'replay' ? 'reencenação' : 'ao vivo')}${p.id === rd?.config?.portfolio_id ? chip('radar', 'run') : ''}</div>
      <div class="trd-pcard-v">${money(s.value, p.currency)}</div>
      <div class="trd-pcard-s"><span class="${ret >= 0 ? 'pos' : 'neg'}">${signed(ret)}</span> · índice ${bench ? signed(pct(bench, p.initial_cash)) : '—'}</div>${sparkline(s.curve)}</div>`;
  }).join('');
  const top = (rd?.ranking || []).slice(0, 6).map(b => `<div class="trd-row"><b>${esc(b.ticker)}</b>${scoreBar(b.score)}<span class="trd-small">${b.n} sinais · ${b.sources.map(s => SOURCE_PT[s] || s).join(', ')}</span>
    <span class="trd-grow"></span><button class="trd-btn trd-ghost" data-analyze="${esc(b.ticker)}">analisar</button></div>`).join('');
  pane.innerHTML = `<div class="trd-home">
    <div class="trd-home-main">
      ${card('Carteiras', pcards ? `<div class="trd-pcards">${pcards}</div>` : empty('Nenhuma carteira. <button class="trd-btn trd-primary" data-goto="portfolios">Criar carteira fictícia</button>'))}
      ${card('Agora', running ? `<div class="trd-live">${pipelineHTML(running, ev)}</div>${live.length > 1 ? `<div class="trd-small">+${live.length - 1} na fila</div>` : ''}` : empty('Nada rodando. <button class="trd-btn trd-primary" data-goto="analyze">Analisar uma ação</button>'))}
    </div>
    <div class="trd-home-side">
      ${card('Radar · 7 dias', top || empty('Sem sinais ainda — a coleta roda de hora em hora.'), '<button class="trd-btn trd-ghost trd-right" data-goto="radar">ver tudo</button>')}
      ${card('Últimas decisões', decided.length ? `<div class="trd-rows">${decided.map(j => `<div class="trd-row" data-open="${j.id}"><b>${esc(j.ticker)}</b><span class="trd-small">${day(j.trade_date)}</span>${ratingChip(j.rating)}</div>`).join('')}</div>` : empty('Nenhuma ainda.'))}
    </div></div>`;
  pane.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));
  pane.querySelectorAll('[data-pid]').forEach(c => c.addEventListener('click', () => { st.pid = Number(c.dataset.pid); switchTab('portfolios'); }));
  pane.querySelectorAll('[data-analyze]').forEach(b => b.addEventListener('click', () => { st.prefill = b.dataset.analyze; switchTab('analyze'); }));
  wireJobButtons(pane, () => renderHome(pane));
  if (live.length) poll(() => st.tab === 'home' ? renderHome(pane) : Promise.resolve(), 5000);
}

// ── Analisar ─────────────────────────────────────────────────────────────
async function renderAnalyze(pane) {
  await refreshPortfolios();
  pane.innerHTML = `<div class="trd-analyze">
    ${card('Nova análise', `<div class="trd-form">
        ${tickerField('trd-ticker')}
        <label class="trd-field"><span>Data</span><input type="date" class="trd-date" value="${today()}" max="${today()}"></label>
        <label class="trd-field"><span>Carteira</span>${portfolioSelect()}</label>
        <button class="trd-btn trd-primary trd-run">Analisar</button></div>
      <div class="trd-form">${analystToggles()}<span class="trd-hint">uma análise leva 20–40 min com o Qwen local</span></div>`,
      '<span class="trd-hint trd-right">dinheiro fictício · nenhuma ordem real</span>')}
    <div class="trd-analyze-grid">
      ${card('Fila', '<div class="trd-queue"></div>')}
      ${card('Andamento', '<div class="trd-live"></div>')}
    </div></div>`;
  wireTicker(pane, 'trd-ticker');
  wireToggles(pane);
  if (st.prefill) { pane.querySelector('.trd-ticker').value = st.prefill; st.prefill = null; }
  pane.querySelector('.trd-run').addEventListener('click', async e => {
    const t = tickers(pane.querySelector('.trd-ticker').value);
    if (!t.length) return showError('Informe a ação');
    if (!needModel()) return;
    const base = { date: pane.querySelector('.trd-date').value || today(), analysts: [...st.analysts], ...modelFields() };
    const pf = pane.querySelector('.trd-pf').value;
    if (pf) base.portfolio_id = Number(pf);
    e.target.disabled = true;
    try {
      let last;
      for (const ticker of t) last = await lab('POST', '/jobs', { ...base, ticker });
      st.focus = last.id;
      showToast(currentModel()?.running ? `${t.length} análise(s) na fila` : `${t.length} análise(s) na fila — esperando o modelo ligar`);
      pane.querySelector('.trd-ticker').value = '';
      fillLive(pane);
    } catch (err) { showError(`Trading: ${err.message}`); } finally { e.target.disabled = false; }
  });
  fillLive(pane);
}
async function fillLive(pane) {
  const { jobs } = await lab('GET', '/jobs?limit=30');
  const live = jobs.filter(j => ['queued', 'running'].includes(j.status));
  if (!st.focus || !jobs.some(j => j.id === st.focus)) st.focus = (jobs.find(j => j.status === 'running') || live[0] || jobs[0])?.id;
  const job = jobs.find(j => j.id === st.focus);
  const detail = job ? await lab('GET', `/jobs/${job.id}`) : null;
  pane.querySelector('.trd-queue').innerHTML = queueRows(jobs);
  pane.querySelector('.trd-live').innerHTML = detail ? pipelineHTML(detail, detail.events) : empty('Escolha uma análise na fila.');
  wireJobButtons(pane.querySelector('.trd-analyze-grid'), () => fillLive(pane));
  if (live.length && st.tab === 'analyze') poll(() => st.tab === 'analyze' ? fillLive(pane) : Promise.resolve());
}

// ── Radar ────────────────────────────────────────────────────────────────
function scoreBar(score) {
  const w = Math.min(100, Math.abs(score) * 40);
  return `<span class="trd-score ${score >= 0 ? 'up' : 'down'}" title="pontuação ${score}"><i style="width:${w}%"></i><em>${score >= 0 ? '+' : ''}${score.toFixed(2)}</em></span>`;
}
async function renderRadar(pane) {
  await refreshPortfolios();
  const rd = await lab('GET', '/radar?days=7');
  const cfg = rd.config, rep = cfg.last_report || {};
  const rows = rd.ranking.map((b, i) => `<details class="trd-rank" ${i === 0 ? 'open' : ''}><summary>
      <b class="trd-tk">${esc(b.ticker)}</b>${scoreBar(b.score)}<span class="trd-small">${b.n} sinais</span>
      ${b.sources.map(s => chip(SOURCE_PT[s] || s, 'src')).join('')}<span class="trd-grow"></span>
      <span class="trd-small">${esc(ago(b.last_ts))}</span><button class="trd-btn trd-ghost" data-analyze="${esc(b.ticker)}">analisar</button></summary>
      <div class="trd-sigs">${b.signals.map(s => `<div class="trd-sig"><span class="trd-arrowdir ${s.direction > 0 ? 'up' : 'down'}">${s.direction > 0 ? '▲' : '▼'}</span>
        <span class="trd-small">${esc(SOURCE_PT[s.source] || s.source)}${s.actor ? ' · ' + esc(s.actor) : ''}</span>
        ${link(s.url, s.title)}
        ${s.reason ? `<span class="trd-small">— ${esc(s.reason)}</span>` : ''}</div>`).join('')}</div></details>`).join('');
  const feed = rd.signals.slice(0, 40).map(s => `<div class="trd-sig"><span class="trd-small trd-src">${esc(SOURCE_PT[s.source] || s.source)}</span>
    ${link(s.url, s.title)}
    ${s.hits.map(h => chip(`${h.direction > 0 ? '▲' : '▼'} ${h.ticker}`, h.direction > 0 ? 'up' : 'down')).join('')}
    ${!s.processed ? chip('não lida', 'warn') : ''}<span class="trd-grow"></span><span class="trd-small">${esc(ago(s.ts))}</span></div>`).join('');
  pane.innerHTML = `<div class="trd-radar">
    <div class="trd-radar-main">
      ${card('Ações em destaque · 7 dias', rows || empty('Nenhuma ação apontada ainda. Colete e depois "Ler com IA".'),
        `<span class="trd-hint trd-right">${rd.pending} sinais esperando a IA ler</span>`)}
      ${card('Sinais recentes', `<div class="trd-feedlist">${feed || empty('Nada coletado ainda.')}</div>`)}
    </div>
    <div class="trd-radar-side">
      ${card('Rodar', `<div class="trd-stack">
        <button class="trd-btn trd-collect">Coletar agora</button>
        <button class="trd-btn trd-primary trd-read">Ler com IA e escolher ações</button>
        <div class="trd-small">Coleta: ${cfg.last_collect ? esc(ago(cfg.last_collect)) + ' atrás' : 'nunca'} · ${Object.entries(rep).map(([k, v]) => `${SOURCE_PT[k] || k}: ${typeof v === 'number' ? '+' + v : 'falhou'}`).join(' · ')}</div>
        <div class="trd-small">A coleta roda sozinha de hora em hora. "Ler com IA" usa o modelo do topo e, se houver carteira do Radar, enfileira as ${cfg.top_n} melhores nela.</div></div>`)}
      ${card('Carteira do Radar', `<div class="trd-stack">
        <label class="trd-field"><span>Carteira que segue o Radar</span>${portfolioSelect('trd-rpf', 'nenhuma (só sugerir)')}</label>
        <label class="trd-field"><span>Ações por rodada</span><input type="number" class="trd-rtop" min="1" max="10" value="${cfg.top_n}"></label>
        <label class="trd-field"><span>Pontuação mínima</span><input type="number" class="trd-rmin" step="0.1" min="0" value="${cfg.min_score}"></label>
        <div class="trd-small">Só compra (sem venda a descoberto), na moeda da carteira; não repete a mesma ação em ${cfg.cooldown_days} dias.</div>
        <button class="trd-btn trd-rsave">Salvar</button></div>`)}
      ${card('Fontes', `<div class="trd-stack">${Object.entries(SOURCE_PT).map(([k, l]) =>
        `<label class="trd-check"><input type="checkbox" data-src="${k}" ${cfg.sources[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        <div class="trd-field"><span>Figuras públicas (notícias sobre o que disseram)</span><div class="trd-figs">${cfg.figures.map((f, i) =>
          `<span class="trd-chip">${esc(f.name)} <small>${f.lang}</small> <button class="trd-x" data-delfig="${i}">×</button></span>`).join('')}</div>
          <div class="trd-form"><input class="trd-fig" placeholder="Nome"><select class="trd-figlang"><option value="en">EN</option><option value="pt">PT</option></select><button class="trd-btn trd-addfig">+</button></div></div></div>`)}
    </div></div>`;
  pane.querySelector('.trd-rpf').value = cfg.portfolio_id || '';
  pane.querySelectorAll('[data-analyze]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); st.prefill = b.dataset.analyze; switchTab('analyze'); }));
  const saveCfg = async patch => { try { await lab('POST', '/radar/config', patch); renderRadar(pane); } catch (e) { showError(e.message); } };
  pane.querySelector('.trd-collect').addEventListener('click', async e => {
    e.target.disabled = true; e.target.textContent = 'coletando… (~1 min)';
    try { await lab('POST', '/radar/collect'); renderRadar(pane); } catch (err) { showError(err.message); e.target.disabled = false; }
  });
  pane.querySelector('.trd-read').addEventListener('click', async () => {
    if (!needModel()) return;
    try { await lab('POST', '/radar/run', { analysts: [...st.analysts], ...modelFields() }); showToast('Radar na fila — acompanhe em Analisar'); }
    catch (e) { showError(e.message); }
  });
  pane.querySelector('.trd-rsave').addEventListener('click', () => saveCfg({
    portfolio_id: Number(pane.querySelector('.trd-rpf').value) || null,
    top_n: Number(pane.querySelector('.trd-rtop').value) || 3, min_score: Number(pane.querySelector('.trd-rmin').value) || 0 }));
  pane.querySelectorAll('[data-src]').forEach(c => c.addEventListener('change', () => saveCfg({ sources: { ...cfg.sources, [c.dataset.src]: c.checked } })));
  pane.querySelectorAll('[data-delfig]').forEach(b => b.addEventListener('click', () => saveCfg({ figures: cfg.figures.filter((_, i) => i !== Number(b.dataset.delfig)) })));
  pane.querySelector('.trd-addfig').addEventListener('click', () => {
    const name = pane.querySelector('.trd-fig').value.trim();
    if (name) saveCfg({ figures: [...cfg.figures, { name, lang: pane.querySelector('.trd-figlang').value }] });
  });
}

// ── Relatórios ───────────────────────────────────────────────────────────
async function renderReports(pane) {
  const [done, review] = await Promise.all([lab('GET', '/jobs?status=done&limit=200'), lab('GET', '/jobs?status=review&limit=50')]);
  const rows = [...review.jobs, ...done.jobs].filter(j => j.kind === 'analysis');
  if (!rows.length) { pane.innerHTML = empty('Nenhum relatório ainda — rode uma análise.'); return; }
  if (!st.report || !rows.some(j => j.id === st.report)) st.report = rows[0].id;
  pane.innerHTML = `<div class="trd-split">
    <div class="trd-list">${rows.map(j => `<button class="trd-li ${j.id === st.report ? 'active' : ''}" data-id="${j.id}">
      <span><b>${esc(j.ticker)}</b> ${ratingChip(j.rating)}</span><span class="trd-small">${day(j.trade_date)}${j.portfolio_id ? ' · carteira' : ''}</span></button>`).join('')}</div>
    <div class="trd-viewer"></div></div>`;
  pane.querySelectorAll('.trd-li').forEach(li => li.addEventListener('click', () => { st.report = Number(li.dataset.id); renderReports(pane); }));
  const job = rows.find(j => j.id === st.report);
  const viewer = pane.querySelector('.trd-viewer');
  const reviewBar = job.status === 'review' ? `<div class="trd-banner">A nota final não pôde ser lida. Decida:
      <select class="trd-resolve">${RATINGS.map(r => `<option value="${r}">${RATING_PT[r]}</option>`).join('')}<option value="">ignorar</option></select>
      <button class="trd-btn trd-primary trd-apply">Aplicar</button></div>` : '';
  viewer.innerHTML = `${reviewBar}<div class="trd-run-h"><b class="trd-big">${esc(job.ticker)}</b><span>${day(job.trade_date)}</span>${ratingChip(job.rating)}
      <span class="trd-grow"></span><button class="trd-btn trd-ghost trd-md">Baixar Markdown</button></div>
    <iframe class="trd-report" sandbox title="Relatório"></iframe>`;
  try { viewer.querySelector('.trd-report').srcdoc = await lab('GET', `/reports/${job.id}`); }
  catch (e) { viewer.querySelector('.trd-report').outerHTML = empty(esc(e.message)); }
  viewer.querySelector('.trd-md').addEventListener('click', async () => {
    const md = await lab('GET', `/reports/${job.id}/md`);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `${job.ticker}_${job.trade_date}.md` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  viewer.querySelector('.trd-apply')?.addEventListener('click', async () => {
    try { await lab('POST', `/jobs/${job.id}/resolve`, { rating: viewer.querySelector('.trd-resolve').value || null }); renderReports(pane); }
    catch (e) { showError(e.message); }
  });
}

// ── Carteiras ────────────────────────────────────────────────────────────
function lineChart(host, a, b) {
  const W = 760, H = 200, P = 40;
  if (!a || a.length < 2) { host.innerHTML = empty('A curva aparece depois de alguns pregões.'); return; }
  const bIdx = new Map((b || []).map(p => [p.date, p]));
  const bAligned = a.map(p => bIdx.get(p.date)).filter(Boolean);
  const all = [...a, ...bAligned].map(x => x.value);
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const x = i => P + (i / (a.length - 1)) * (W - P - 8);
  const y = v => H - 18 - ((v - min) / span) * (H - 30);
  const path = s => s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  host.innerHTML = `<svg class="trd-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${[min, (min + max) / 2, max].map(v => `<line class="trd-grid" x1="${P}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text class="trd-axis" x="2" y="${y(v) + 4}">${Math.round(v)}</text>`).join('')}
    <text class="trd-axis" x="${P}" y="${H - 3}">${day(a[0].date)}</text><text class="trd-axis" x="${W - 76}" y="${H - 3}">${day(a.at(-1).date)}</text>
    ${bAligned.length > 1 ? `<path d="${path(bAligned)}" class="trd-line bench"/>` : ''}<path d="${path(a)}" class="trd-line"/></svg>
    <div class="trd-legend"><span><i class="me"></i>carteira</span><span><i class="bench"></i>índice</span></div>`;
}
async function renderPortfolios(pane) {
  await refreshPortfolios();
  if (st.pid && !st.portfolios.some(p => p.id === st.pid)) st.pid = null;
  st.pid = st.pid || st.portfolios[0]?.id || null;
  pane.innerHTML = `<div class="trd-split">
    <div class="trd-list">${st.portfolios.map(p => `<button class="trd-li ${p.id === st.pid ? 'active' : ''}" data-id="${p.id}">
      <span><b>${esc(p.name)}</b> ${chip(p.mode === 'replay' ? 'reencenação' : 'ao vivo')}</span><span class="trd-small">${esc(p.currency)} · ${money(p.initial_cash, p.currency)}</span></button>`).join('')}
      <button class="trd-btn trd-new">+ nova carteira</button></div>
    <div class="trd-viewer trd-pf-detail"></div></div>`;
  pane.querySelectorAll('.trd-li').forEach(li => li.addEventListener('click', () => { st.pid = Number(li.dataset.id); renderPortfolios(pane); }));
  pane.querySelector('.trd-new').addEventListener('click', () => newPortfolioForm(pane.querySelector('.trd-pf-detail'), pane));
  const host = pane.querySelector('.trd-pf-detail');
  if (!st.pid) { newPortfolioForm(host, pane); return; }
  const s = await lab('GET', `/portfolios/${st.pid}`);
  const p = s.portfolio, cur = p.currency, bench = s.benchmark_curve.at(-1)?.value;
  host.innerHTML = `
    <div class="trd-kpis">
      <div class="trd-kpi"><span>Valor</span><b>${money(s.value, cur)}</b><small class="${s.value >= p.initial_cash ? 'pos' : 'neg'}">${signed(pct(s.value, p.initial_cash))}</small></div>
      <div class="trd-kpi"><span>Caixa</span><b>${money(s.cash, cur)}</b></div>
      <div class="trd-kpi"><span>Índice ${esc(p.benchmark)}</span><b>${bench ? signed(pct(bench, p.initial_cash)) : '—'}</b><small>mesmo período</small></div>
      <div class="trd-kpi"><span>Operações</span><b>${s.trades.filter(t => t.status === 'filled').length}</b><small>${s.trades.filter(t => t.status === 'pending').length} pendentes</small></div>
    </div>
    ${card('Valor × índice', '<div class="trd-chart"></div>')}
    ${p.mode === 'live' ? card('Analisar nesta carteira', `<div class="trd-form">${tickerField('trd-run-t', 'Ações: PETR4 VALE3…')}<button class="trd-btn trd-primary trd-run-pf">Enfileirar</button></div>${analystToggles()}`) : ''}
    ${card('Posições', s.positions.length ? `<table class="trd-table"><thead><tr><th>Ação</th><th class="num">Qtd</th><th class="num">Preço médio</th><th class="num">Último</th><th class="num">Valor</th><th class="num">Resultado</th></tr></thead><tbody>${s.positions.map(x => `
      <tr><td><b>${esc(x.ticker)}</b></td><td class="num">${x.quantity}</td><td class="num">${money(x.avg_price, cur)}</td><td class="num">${money(x.last, cur)}</td>
      <td class="num">${money(x.value, cur)}</td><td class="num ${x.last >= x.avg_price ? 'pos' : 'neg'}">${signed(pct(x.last, x.avg_price))}</td></tr>`).join('')}</tbody></table>` : empty('Sem posições.'))}
    ${card('Extrato', s.trades.length ? `<table class="trd-table"><thead><tr><th>Análise</th><th>Ação</th><th>Nota</th><th>Operação</th><th class="num">Qtd</th><th class="num">Preço</th><th>Execução</th><th>Tamanho</th><th></th></tr></thead><tbody>${s.trades.map(t => `
      <tr><td>${day(t.trade_date)}</td><td><b>${esc(t.ticker)}</b></td><td>${ratingChip(t.rating)}</td>
      <td>${t.status === 'filled' ? chip(t.side === 'buy' ? 'compra' : 'venda', t.side === 'buy' ? 'up' : 'down') : t.status === 'pending' ? chip('pendente', 'warn') : chip(t.reason || 'sem operação')}</td>
      <td class="num">${t.quantity ?? ''}</td><td class="num">${t.price ? money(t.price, cur) : ''}</td><td>${day(t.fill_date)}</td>
      <td class="trd-small">${esc(SIZING_PT[t.sizing_source] || t.sizing_source || '')}</td>
      <td>${t.job_id ? `<button class="trd-btn trd-ghost" data-open="${t.job_id}">relatório</button>` : ''}</td></tr>`).join('')}</tbody></table>` : empty('Nenhuma decisão ainda.'))}`;
  lineChart(host.querySelector('.trd-chart'), s.curve, s.benchmark_curve);
  wireJobButtons(host, () => renderPortfolios(pane));
  if (host.querySelector('.trd-run-t')) { wireTicker(host, 'trd-run-t'); wireToggles(host); }
  host.querySelector('.trd-run-pf')?.addEventListener('click', async () => {
    const t = tickers(host.querySelector('.trd-run-t').value);
    if (!t.length) return showError('Informe as ações');
    if (!needModel()) return;
    try { const r = await lab('POST', `/portfolios/${p.id}/run`, { tickers: t, analysts: [...st.analysts], ...modelFields() }); showToast(`${r.ids.length} análise(s) na fila`); }
    catch (e) { showError(`Trading: ${e.message}`); }
  });
}
function newPortfolioForm(host, pane) {
  host.innerHTML = card('Nova carteira fictícia', `
    <div class="trd-form"><label class="trd-field"><span>Nome</span><input class="trd-n" value="Teste"></label>
      <label class="trd-field"><span>Moeda</span><select class="trd-cur"><option>BRL</option><option>USD</option></select></label>
      <label class="trd-field"><span>Dinheiro inicial</span><input type="number" class="trd-cash" value="10000" min="1"></label></div>
    <div class="trd-seg"><button class="trd-toggle on" data-mode="live">Ao vivo — de hoje em diante</button><button class="trd-toggle" data-mode="replay">Reencenar um período passado</button></div>
    <div class="trd-replay hidden"><div class="trd-form">${tickerField('trd-rt', 'Ações: PETR4 VALE3…')}
      <label class="trd-field"><span>Início</span><input type="date" class="trd-rs" max="${today()}"></label><label class="trd-field"><span>Fim</span><input type="date" class="trd-re" max="${today()}"></label>
      <label class="trd-field"><span>A cada (dias)</span><input type="number" class="trd-rev" value="7" min="1"></label></div>${analystToggles()}
      <div class="trd-hint">Cada data × ação vira uma análise com o modelo do topo (20–40 min cada com o Qwen).</div></div>
    <div class="trd-hint">.SA = BRL (índice Ibovespa); EUA = USD (índice SPY). Uma moeda por carteira.</div>
    <div class="trd-form"><button class="trd-btn trd-primary trd-create">Criar</button></div>`);
  let mode = 'live';
  host.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    host.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    host.querySelector('.trd-replay').classList.toggle('hidden', mode !== 'replay');
  }));
  wireTicker(host, 'trd-rt');
  wireToggles(host);
  host.querySelector('.trd-create').addEventListener('click', async () => {
    const body = { name: host.querySelector('.trd-n').value.trim() || 'Carteira', currency: host.querySelector('.trd-cur').value,
      initial_cash: Number(host.querySelector('.trd-cash').value), mode };
    if (mode === 'replay') {
      if (!needModel()) return;
      body.replay = { tickers: tickers(host.querySelector('.trd-rt').value), start: host.querySelector('.trd-rs').value,
        end: host.querySelector('.trd-re').value, every_days: Number(host.querySelector('.trd-rev').value) || 7, analysts: [...st.analysts], ...modelFields() };
      if (!body.replay.tickers.length || !body.replay.start || !body.replay.end) return showError('Reencenação: ações, início e fim');
    }
    try { st.pid = (await lab('POST', '/portfolios', body)).id; renderPortfolios(pane); }
    catch (e) { showError(`Trading: ${e.message}`); }
  });
}

// ── Backtest ─────────────────────────────────────────────────────────────
async function renderBacktest(pane) {
  const { backtests } = await lab('GET', '/backtests');
  pane.innerHTML = card('Novo backtest', `<div class="trd-form">${tickerField('trd-bt', 'Ações: NVDA AAPL…')}
      <label class="trd-field"><span>Início</span><input type="date" class="trd-bs" max="${today()}"></label><label class="trd-field"><span>Fim</span><input type="date" class="trd-be" max="${today()}"></label>
      <label class="trd-field"><span>A cada (dias)</span><input type="number" class="trd-bev" value="7" min="1"></label>
      <button class="trd-btn trd-primary trd-bgo">Enfileirar</button></div>${analystToggles()}`,
    '<span class="trd-hint trd-right">mede se as notas acertam a direção; não simula carteira</span>')
    + backtests.map(b => card(`#${b.id} ${esc(b.tickers.join(', '))} <span class="trd-small">${day(b.start)} → ${day(b.end)} · a cada ${b.every_days}d</span> ${statusChip(b.status)}`,
      b.summary ? `${b.summary.by_rating ? `<table class="trd-table"><thead><tr><th>Nota</th><th class="num">n</th><th class="num">Acertou a direção</th><th class="num">Alfa médio</th></tr></thead><tbody>${Object.entries(b.summary.by_rating).map(([r, v]) => `
        <tr><td>${ratingChip(r)}</td><td class="num">${v.count}</td><td class="num">${v.hit_rate == null ? '—' : Math.round(v.hit_rate * 100) + '%'}</td><td class="num ${v.mean_alpha >= 0 ? 'pos' : 'neg'}">${(v.mean_alpha * 100).toFixed(2)}%</td></tr>`).join('')}</tbody></table>` : ''}
        <pre class="trd-pre">${esc(b.summary.text || '')}</pre>` : '<div class="trd-small">acompanhe em Analisar › Fila</div>')).join('');
  wireTicker(pane, 'trd-bt');
  wireToggles(pane);
  pane.querySelector('.trd-bgo').addEventListener('click', async () => {
    if (!needModel()) return;
    const body = { tickers: tickers(pane.querySelector('.trd-bt').value), start: pane.querySelector('.trd-bs').value,
      end: pane.querySelector('.trd-be').value, every_days: Number(pane.querySelector('.trd-bev').value) || 7, analysts: [...st.analysts], ...modelFields() };
    if (!body.tickers.length || !body.start || !body.end) return showError('Backtest: ações, início e fim');
    try { await lab('POST', '/backtests', body); renderBacktest(pane); } catch (e) { showError(`Trading: ${e.message}`); }
  });
}

// ── Agenda ───────────────────────────────────────────────────────────────
async function renderSchedule(pane) {
  await refreshPortfolios();
  const [{ watchlists }, { tasks }] = await Promise.all([lab('GET', '/watchlists'), call('GET', '/api/tasks')]);
  const mine = tasks.filter(t => t.action === 'trading_run' || (t.action === 'cookbook_serve' && t.name.startsWith('Trading')));
  const when = t => t.trigger_type === 'webhook' ? (t.action === 'cookbook_serve' ? 'manual (botão Ligar)' : 'quando o modelo ligar') : `${t.schedule === 'weekly' ? WEEKDAYS[t.scheduled_day ?? 0] + ' ' : 'todo dia '}${t.scheduled_time}`;
  pane.innerHTML = `<div class="trd-analyze-grid">
    ${card('Listas de ações', `${watchlists.map(w => `<div class="trd-row"><b>${esc(w.name)}</b><span class="trd-small">${esc(w.tickers.join(' '))}</span><span class="trd-grow"></span><button class="trd-btn trd-ghost" data-delwl="${w.id}">excluir</button></div>`).join('') || empty('Nenhuma lista.')}
      <div class="trd-form"><label class="trd-field"><span>Nome</span><input class="trd-wn"></label>${tickerField('trd-wt', 'Ações: PETR4 VALE3 ITUB4…')}<button class="trd-btn trd-wadd">Salvar lista</button></div>`)}
    ${card('Nova agenda', `<div class="trd-form">
        <label class="trd-field"><span>O quê</span><select class="trd-skind"><option value="list">analisar uma lista</option><option value="radar">rodar o Radar</option></select></label>
        <label class="trd-field trd-swl-f"><span>Lista</span><select class="trd-swl">${watchlists.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
        <label class="trd-field trd-spf-f"><span>Carteira</span>${portfolioSelect()}</label></div>
      <div class="trd-form"><label class="trd-field"><span>Frequência</span><select class="trd-sf"><option value="daily">todo dia</option><option value="weekly">toda semana</option></select></label>
        <label class="trd-field"><span>Dia</span><select class="trd-sd">${WEEKDAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
        <label class="trd-field"><span>Hora</span><input type="time" class="trd-sh" value="03:00"></label>
        <label class="trd-field"><span>Desligar o modelo local após (min)</span><input type="number" class="trd-send" value="240" min="30"></label>
        <button class="trd-btn trd-primary trd-sadd">Agendar</button></div>
      <div class="trd-hint">Usa o modelo do topo. Com modelo local, a agenda liga o modelo antes e espera ele subir. Avisa ao terminar.</div>`)}
    </div>${card('Agendas', mine.length ? `<div class="trd-rows">${mine.map(t => `<div class="trd-row">
      <b>${esc(t.name)}</b>${chip(when(t))}${chip(t.status, t.status === 'active' ? 'ok' : '')}
      <span class="trd-small">${t.last_run ? 'última: ' + new Date(t.last_run).toLocaleString('pt-BR') : ''}</span><span class="trd-grow"></span>
      <button class="trd-btn trd-ghost" data-runtask="${t.id}">rodar agora</button><button class="trd-btn trd-ghost" data-deltask="${t.id}">excluir</button></div>`).join('')}</div>` : empty('Nenhuma agenda.'))}`;
  wireTicker(pane, 'trd-wt');
  const kind = pane.querySelector('.trd-skind');
  kind.addEventListener('change', () => { pane.querySelector('.trd-swl-f').classList.toggle('hidden', kind.value === 'radar'); pane.querySelector('.trd-spf-f').classList.toggle('hidden', kind.value === 'radar'); });
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
    try { await call('POST', `/api/tasks/${b.dataset.runtask}/run`); showToast('Disparado — acompanhe em Analisar'); } catch (e) { showError(e.message); }
  }));
  pane.querySelector('.trd-sadd').addEventListener('click', async e => {
    if (!needModel()) return;
    const model = modelFields();
    const radarRun = kind.value === 'radar';
    const wl = pane.querySelector('.trd-swl').value;
    if (!radarRun && !wl) return showError('Crie uma lista de ações antes');
    const cfg = { analysts: [...st.analysts], ...model, wait_model_min: 30 };
    if (radarRun) cfg.radar = true;
    else {
      cfg.watchlist_id = Number(wl);
      const pf = pane.querySelector('.trd-pf').value;
      if (pf) cfg.portfolio_id = Number(pf); else cfg.tickers = watchlists.find(x => x.id === Number(wl))?.tickers || [];
    }
    const sched = { schedule: pane.querySelector('.trd-sf').value, scheduled_time: pane.querySelector('.trd-sh').value || '03:00',
      scheduled_day: pane.querySelector('.trd-sf').value === 'weekly' ? Number(pane.querySelector('.trd-sd').value) : null };
    const name = radarRun ? 'Trading: Radar' : `Trading: ${watchlists.find(x => x.id === Number(wl))?.name || 'lista'}`;
    e.target.disabled = true;
    try {
      if (model.local_preset) {
        const run = await call('POST', '/api/tasks', { name, prompt: JSON.stringify(cfg), task_type: 'action', action: 'trading_run', trigger_type: 'webhook', notifications_enabled: true });
        await call('POST', '/api/tasks', { name: `${name} — ligar ${model.local_preset}`, task_type: 'action', action: 'cookbook_serve',
          prompt: JSON.stringify({ preset: model.local_preset, end_after_min: Number(pane.querySelector('.trd-send').value) || 240 }),
          ...sched, then_task_id: run.id, notifications_enabled: false });
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
  home: ['Início', renderHome], radar: ['Radar', renderRadar], analyze: ['Analisar', renderAnalyze],
  reports: ['Relatórios', renderReports], portfolios: ['Carteiras', renderPortfolios],
  backtest: ['Backtest', renderBacktest], schedule: ['Agenda', renderSchedule],
};

function switchTab(tab) { st.tab = tab; save('tab', tab); render(); }

async function render() {
  if (!els.body) return;
  stopPoll();
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = els.body;
  if (!pane.children.length) pane.innerHTML = empty('Carregando…');
  pane.style.opacity = '0.6';
  try {
    await TABS[st.tab][1](pane);
  } catch (e) {
    const down = /fora do ar|503/.test(e.message);
    pane.innerHTML = empty(down ? 'Trading Lab fora do ar — <code>docker compose up -d tradingagents-lab</code> na pasta do Odysseus.' : 'Falhou: ' + esc(e.message));
  } finally {
    pane.style.opacity = '';
  }
}

async function refreshStatus() {
  try {
    const h = await lab('GET', '/health');
    els.status.textContent = h.waiting_model ? `esperando o modelo ligar · ${h.queued} na fila`
      : `${h.running ? 'analisando' : 'parado'} · ${h.queued} na fila`;
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
      <div class="trd-top"><nav class="trd-tabs">${Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
        <div class="trd-modelbar"></div></div>
      <div class="trd-body"></div>
    </div>`;
  document.body.appendChild(panel);
  els = { panel, content: panel.querySelector('.modal-content'), header: panel.querySelector('.modal-header'),
    tabs: panel.querySelector('.trd-tabs'), body: panel.querySelector('.trd-body'), status: panel.querySelector('.trd-status'),
    modelbar: panel.querySelector('.trd-modelbar') };
  panel.querySelector('.close-btn').addEventListener('click', () => { stopPoll(); Modals.close(PANEL_ID); });
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', () => {
    try {
      panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
    } catch (_) {}
  }, true);
  els.tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  st.tab = load('tab') || 'home';
  if (!TABS[st.tab]) st.tab = 'home';
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
  try { await loadModels(true); } catch (e) { st.models = { endpoints: [], presets: [] }; }
  renderModelBar();
  refreshStatus();
  render();
}

function mountSidebar() {
  const list = document.getElementById('trading-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  const item = document.createElement('div');
  item.className = 'list-item trd-side-item';
  item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg><span class="grow">Radar, análises e carteiras</span>`;
  item.addEventListener('click', openPanel);
  list.append(item);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebar);
else mountSidebar();

export { openPanel };
