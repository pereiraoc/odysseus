// static/js/aiUsage.js — painel "Uso de IA" (fork-local, ver LOCAL_CHANGES.md)
//
// Le /api/ai-usage/* (routes/ai_usage_routes.py), que consulta o banco do
// ai-usage-export do host: tokens por dia, sessao, modelo e categoria de Claude
// Code, Codex, Cursor, Copilot, Cline e do proprio Odysseus. Graficos em SVG
// feitos aqui (sem biblioteca externa: o CSP do app nao libera CDN).
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showError, esc } from './ui.js?v=20260916largetoolscroll1';
import { nextToolWindowZ } from './toolWindowZOrder.js';

const PANEL_ID = 'ai-usage-panel';
const API = '/api/ai-usage';
const METRICS = {
  total: 'Tokens (total)', output: 'Saída', input: 'Entrada sem cache', cache_read: 'Cache lido',
  cache_write: 'Cache gravado', calls: 'Chamadas', cost_usd: 'Custo (US$, só Cline)',
};
const DIMS = { category: 'Categoria', model: 'Modelo', source: 'Ferramenta', machine: 'Máquina' };
const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano'], ['all', 'Tudo']];
// cores bem separadas no matiz (nada de dois verdes vizinhos)
const PALETTE = ['#59c2ff', '#ffb454', '#7fd962', '#f07178', '#c792ea', '#2ec4b6', '#ff8f40', '#e6e16b',
  '#ff6ac1', '#8d9eff', '#a0785a', '#b8c4cc', '#3d9970', '#d9534f', '#f5c2e7', '#6c8ebf'];

const st = {
  period: '90', from: '', to: '', by: 'category', metric: 'total', bucket: 'day', estimated: true,
  filters: { sources: new Set(), categories: new Set(), models: new Set(), machines: new Set() },
  hidden: new Set(), tab: 'overview', meta: null, q: '', sort: 'total',
};
const colorMap = new Map();
let els = {};

// ── util ────────────────────────────────────────────────────────────────
function fmt(n, metric = st.metric) {
  n = Number(n || 0);
  if (metric === 'cost_usd') return '$' + n.toFixed(n < 10 ? 2 : 0);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + ' B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + ' M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + ' k';
  return String(Math.round(n));
}
function colorFor(key) {
  if (!colorMap.has(key)) {
    // ordem de chegada: a 1a chave vista pega a 1a cor (as maiores aparecem primeiro)
    const n = colorMap.size;
    colorMap.set(key, n < PALETTE.length ? PALETTE[n] : `hsl(${(n * 137) % 360} 55% 62%)`);
  }
  return colorMap.get(key);
}
function shortDay(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : ''; }
function isoDay(d) { return d.toISOString().slice(0, 10); }
function range() {
  if (st.period === 'custom') return { from: st.from, to: st.to };
  if (st.period === 'all') return { from: '', to: '' };
  const max = st.meta?.day_max ? new Date(st.meta.day_max + 'T12:00:00') : new Date();
  const d = new Date(max); d.setDate(d.getDate() - Number(st.period) + 1);
  return { from: isoDay(d), to: isoDay(max) };
}
function qs(extra = {}) {
  const p = new URLSearchParams();
  const r = range();
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  for (const [k, set] of Object.entries(st.filters)) if (set.size) p.set(k, [...set].join(','));
  if (!st.estimated) p.set('estimated', 'false');
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') p.set(k, v);
  return p.toString();
}
async function get(path, extra) {
  const r = await fetch(`${API}/${path}?${qs(extra)}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function tip(e, html) {
  const t = els.tip;
  if (!html) { t.style.display = 'none'; return; }
  t.innerHTML = html;
  t.style.display = 'block';
  const r = els.content.getBoundingClientRect();
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  if (x + t.offsetWidth > r.width - 8) x = e.clientX - r.left - t.offsetWidth - 14;
  if (y + t.offsetHeight > r.height - 8) y = e.clientY - r.top - t.offsetHeight - 14;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}

// ── graficos ────────────────────────────────────────────────────────────
function stackedBars(host, data, { onBucket } = {}) {
  host.innerHTML = '';
  const series = data.series.filter(s => !st.hidden.has(s.key));
  const n = data.buckets.length;
  if (!n) { host.innerHTML = '<div class="aiu-empty">Sem dados no período/filtros.</div>'; return; }
  const W = Math.max(host.clientWidth || 700, 320), H = 260, L = 56, B = 26, T = 8;
  const totals = data.buckets.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = Math.max(1, ...totals);
  const svg = svgEl('svg', { width: W, height: H, class: 'aiu-svg' });
  const bw = (W - L - 8) / n;
  for (let g = 0; g <= 4; g++) {
    const y = T + (H - T - B) * (1 - g / 4);
    svg.append(svgEl('line', { x1: L, x2: W - 4, y1: y, y2: y, class: 'aiu-grid' }));
    svg.append(svgEl('text', { x: L - 6, y: y + 4, class: 'aiu-axis', 'text-anchor': 'end' }, fmt(max * g / 4)));
  }
  const every = Math.ceil(n / Math.floor((W - L) / 70));
  data.buckets.forEach((bk, i) => {
    let y0 = H - B;
    const x = L + i * bw + bw * 0.12, w = Math.max(1, bw * 0.76);
    for (const s of series) {
      const v = s.values[i] || 0;
      if (!v) continue;
      const h = (H - T - B) * v / max;
      const r = svgEl('rect', { x, y: y0 - h, width: w, height: Math.max(h, 0.5), fill: colorFor(s.key), class: 'aiu-bar' });
      r.addEventListener('mousemove', e => tip(e, `<b>${esc(bk)}</b><br><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}: <b>${fmt(v)}</b><br>Total do período: ${fmt(totals[i])}`));
      r.addEventListener('mouseleave', e => tip(e, null));
      if (onBucket) r.addEventListener('click', () => onBucket(bk));
      svg.append(r);
      y0 -= h;
    }
    if (i % every === 0) svg.append(svgEl('text', { x: x + w / 2, y: H - 8, class: 'aiu-axis', 'text-anchor': 'middle' },
      data.bucket === 'day' ? bk.slice(5) : bk));
  });
  host.append(svg);
}

function hbars(host, rows, { onClick, valueKey = 'value', label = r => r.key, sub } = {}) {
  host.innerHTML = '';
  if (!rows.length) { host.innerHTML = '<div class="aiu-empty">Sem dados.</div>'; return; }
  const max = Math.max(1, ...rows.map(r => r[valueKey] || 0));
  const sum = rows.reduce((a, r) => a + (r[valueKey] || 0), 0) || 1;
  for (const r of rows) {
    const key = label(r) ?? '(sem)';
    const row = document.createElement('div');
    row.className = 'aiu-hbar' + (onClick ? ' clickable' : '');
    row.innerHTML = `<div class="aiu-hbar-label" title="${esc(key)}"><span class="aiu-sw" style="background:${colorFor(key)}"></span>${esc(key)}${r.estimated ? ' <span class="aiu-est" title="inclui estimativas">≈</span>' : ''}</div>
      <div class="aiu-hbar-track"><div class="aiu-hbar-fill" style="width:${100 * (r[valueKey] || 0) / max}%;background:${colorFor(key)}"></div></div>
      <div class="aiu-hbar-val">${fmt(r[valueKey])}<small>${(100 * (r[valueKey] || 0) / sum).toFixed(1)}%</small></div>
      ${sub ? `<div class="aiu-hbar-sub">${sub(r)}</div>` : ''}`;
    if (onClick) row.addEventListener('click', () => onClick(r));
    host.append(row);
  }
}

function hoursChart(host, rows) {
  host.innerHTML = '';
  const vals = Array.from({ length: 24 }, (_, h) => (rows.find(r => r.hour === h)?.value) || 0);
  const W = Math.max(host.clientWidth || 300, 260), H = 120, B = 18;
  const max = Math.max(1, ...vals), bw = W / 24;
  const svg = svgEl('svg', { width: W, height: H, class: 'aiu-svg' });
  vals.forEach((v, h) => {
    const bh = (H - B - 4) * v / max;
    const r = svgEl('rect', { x: h * bw + 1, y: H - B - bh, width: bw - 2, height: Math.max(bh, 0.5), class: 'aiu-hour' });
    r.addEventListener('mousemove', e => tip(e, `<b>${h}h</b>: ${fmt(v)}`));
    r.addEventListener('mouseleave', e => tip(e, null));
    svg.append(r);
    if (h % 3 === 0) svg.append(svgEl('text', { x: h * bw + bw / 2, y: H - 4, class: 'aiu-axis', 'text-anchor': 'middle' }, `${h}h`));
  });
  host.append(svg);
}

function heatmap(host, rows) {
  host.innerHTML = '';
  if (!rows.length) { host.innerHTML = '<div class="aiu-empty">Sem dados.</div>'; return; }
  const byDay = new Map(rows.map(r => [r.day, r]));
  const first = new Date(rows[0].day + 'T12:00:00'), last = new Date(rows[rows.length - 1].day + 'T12:00:00');
  const start = new Date(first); start.setDate(start.getDate() - start.getDay());
  const weeks = Math.ceil(((last - start) / 864e5 + 1) / 7);
  const C = 16, G = 3, L = 28, T = 18;
  const max = Math.max(1, ...rows.map(r => r.value || 0));
  const svg = svgEl('svg', { width: L + weeks * (C + G) + 4, height: T + 7 * (C + G) + 4, class: 'aiu-svg' });
  ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach((d, i) => i % 2 && svg.append(svgEl('text', { x: 0, y: T + i * (C + G) + 11, class: 'aiu-axis' }, d)));
  let lastMonth = -1, lastLabelW = -9;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      if (day > last) break;
      const k = isoDay(day), r = byDay.get(k), v = r?.value || 0;
      if (d === 0 && day.getMonth() !== lastMonth && w - lastLabelW >= 3) {
        lastMonth = day.getMonth(); lastLabelW = w;
        svg.append(svgEl('text', { x: L + w * (C + G), y: 11, class: 'aiu-axis' }, day.toLocaleDateString('pt-BR', { month: 'short' })));
      }
      const a = v ? 0.18 + 0.82 * Math.sqrt(v / max) : 0;
      const cell = svgEl('rect', { x: L + w * (C + G), y: T + d * (C + G), width: C, height: C, rx: 3,
        class: 'aiu-cell' + (v ? '' : ' empty'), style: v ? `fill-opacity:${a}` : '' });
      cell.addEventListener('mousemove', e => tip(e, `<b>${k}</b><br>${fmt(v)}${r ? ` · ${r.sessions} sessão(ões)` : ''}`));
      cell.addEventListener('mouseleave', e => tip(e, null));
      if (v) cell.addEventListener('click', () => { st.period = 'custom'; st.from = k; st.to = k; syncToolbar(); st.tab = 'sessions'; render(); });
      svg.append(cell);
    }
  }
  host.append(svg);
}

function lineChart(host, rows) {
  host.innerHTML = '';
  if (!rows.length) { host.innerHTML = '<div class="aiu-empty">Sem leituras de limite (só o Codex grava).</div>'; return; }
  const days = [...new Set(rows.map(r => r.day))].sort();
  const names = [...new Set(rows.map(r => r.limit_name))];
  const W = Math.max(host.clientWidth || 600, 320), H = 220, L = 40, B = 24, T = 8;
  const svg = svgEl('svg', { width: W, height: H, class: 'aiu-svg' });
  for (let g = 0; g <= 4; g++) {
    const y = T + (H - T - B) * (1 - g / 4);
    svg.append(svgEl('line', { x1: L, x2: W - 4, y1: y, y2: y, class: 'aiu-grid' }));
    svg.append(svgEl('text', { x: L - 6, y: y + 4, class: 'aiu-axis', 'text-anchor': 'end' }, `${g * 25}%`));
  }
  const x = i => L + (W - L - 10) * (days.length > 1 ? i / (days.length - 1) : 0.5);
  for (const n of names) {
    const pts = rows.filter(r => r.limit_name === n).map(r => [x(days.indexOf(r.day)), T + (H - T - B) * (1 - r.used_percent / 100), r]);
    svg.append(svgEl('polyline', { points: pts.map(p => `${p[0]},${p[1]}`).join(' '), fill: 'none', stroke: colorFor(n), 'stroke-width': 2 }));
    for (const [px, py, r] of pts) {
      const c = svgEl('circle', { cx: px, cy: py, r: 3, fill: colorFor(n) });
      c.addEventListener('mousemove', e => tip(e, `<b>${r.day}</b><br>${esc(n)} (janela ${Math.round(r.window_minutes / 60)} h): <b>${r.used_percent}%</b> · plano ${esc(r.plan || '')}`));
      c.addEventListener('mouseleave', e => tip(e, null));
      svg.append(c);
    }
  }
  const every = Math.ceil(days.length / 8);
  days.forEach((d, i) => i % every === 0 && svg.append(svgEl('text', { x: x(i), y: H - 6, class: 'aiu-axis', 'text-anchor': 'middle' }, d.slice(5))));
  host.append(svg);
  const lg = document.createElement('div');
  lg.className = 'aiu-legend';
  lg.innerHTML = names.map(n => `<span><span class="aiu-sw" style="background:${colorFor(n)}"></span>${esc(n)}</span>`).join('');
  host.append(lg);
}

// ── abas ────────────────────────────────────────────────────────────────
async function renderOverview(pane) {
  pane.innerHTML = `
    <div class="aiu-kpis"></div>
    <div class="aiu-card"><div class="aiu-card-h"><span>${METRICS[st.metric]} por ${st.bucket === 'day' ? 'dia' : st.bucket === 'week' ? 'semana' : 'mês'} · ${DIMS[st.by]}</span><span class="aiu-hint">clique numa barra = ver só aquele período · clique na legenda = esconder</span></div>
      <div class="aiu-chart"></div><div class="aiu-legend clickable"></div></div>
    <div class="aiu-grid2">
      <div class="aiu-card"><div class="aiu-card-h">Por ${DIMS[st.by].toLowerCase()} <span class="aiu-hint">clique = filtrar</span></div><div class="aiu-break"></div></div>
      <div class="aiu-card"><div class="aiu-card-h">Hora do dia</div><div class="aiu-hours"></div>
        <div class="aiu-card-h" style="margin-top:12px">Ferramenta</div><div class="aiu-bysrc"></div></div>
    </div>`;
  const [series, br, hrs, bysrc] = await Promise.all([
    get('series', { bucket: st.bucket, by: st.by, metric: st.metric }),
    get('breakdown', { by: st.by, metric: st.metric }),
    get('hours', { metric: st.metric === 'cost_usd' ? 'total' : st.metric }),
    get('breakdown', { by: 'source', metric: st.metric }),
  ]);
  const tot = br.reduce((a, r) => a + (r.total || 0), 0), out = br.reduce((a, r) => a + (r.output || 0), 0);
  const days = new Set(), sessions = br.reduce((a, r) => a + r.sessions, 0);
  const daysActive = (await get('heatmap', { metric: 'total' })).filter(r => r.value > 0);
  daysActive.forEach(r => days.add(r.day));
  const kpi = (label, val, sub = '') => `<div class="aiu-kpi"><div class="aiu-kpi-v">${val}</div><div class="aiu-kpi-l">${label}</div>${sub ? `<div class="aiu-kpi-s">${sub}</div>` : ''}</div>`;
  pane.querySelector('.aiu-kpis').innerHTML =
    kpi('tokens no total', fmt(tot, 'total'), `${fmt(br.reduce((a, r) => a + (r.cache_read || 0), 0), 'total')} de cache lido`) +
    kpi('de saída (texto gerado)', fmt(out, 'total')) +
    kpi('dias com uso', days.size, days.size ? `${fmt(tot / days.size, 'total')} por dia ativo` : '') +
    kpi('sessões', fmt(sessions, 'calls')) +
    kpi(`maior ${DIMS[st.by].toLowerCase()}`, esc(br[0]?.key || '—'), br[0] ? `${(100 * br[0].value / (br.reduce((a, r) => a + r.value, 0) || 1)).toFixed(0)}%` : '');
  stackedBars(pane.querySelector('.aiu-chart'), series, {
    onBucket: bk => {
      if (st.bucket !== 'day') return;
      st.period = 'custom'; st.from = bk; st.to = bk; syncToolbar(); render();
    },
  });
  const lg = pane.querySelector('.aiu-legend');
  lg.innerHTML = series.series.map(s => `<span data-k="${esc(s.key)}" class="${st.hidden.has(s.key) ? 'off' : ''}"><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}</span>`).join('');
  lg.onclick = e => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    st.hidden.has(k) ? st.hidden.delete(k) : st.hidden.add(k);
    stackedBars(pane.querySelector('.aiu-chart'), series);
    e.target.closest('[data-k]').classList.toggle('off');
  };
  const dimKey = { category: 'categories', model: 'models', source: 'sources', machine: 'machines' }[st.by];
  hbars(pane.querySelector('.aiu-break'), br.slice(0, 25), {
    onClick: r => { st.filters[dimKey].add(r.key); syncFilters(); render(); },
    sub: r => `${fmt(r.output, 'total')} saída · ${r.sessions} sessões · ${r.days} dias · ${esc(r.first_day)} → ${esc(r.last_day)}`,
  });
  hoursChart(pane.querySelector('.aiu-hours'), hrs);
  hbars(pane.querySelector('.aiu-bysrc'), bysrc, { onClick: r => { st.filters.sources.add(r.key); syncFilters(); render(); } });
}

async function renderModels(pane) {
  const rows = await get('breakdown', { by: 'model', metric: st.metric });
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">Modelos · ${METRICS[st.metric]} <span class="aiu-hint">clique = filtrar por modelo</span></div>
    <table class="aiu-table"><thead><tr><th>Modelo</th><th>Ferramentas</th><th class="num">${METRICS[st.metric]}</th><th class="num">Total</th><th class="num">Saída</th><th class="num">Cache lido</th><th class="num">Chamadas</th><th class="num">Sessões</th><th class="num">Dias</th><th>Período</th></tr></thead><tbody></tbody></table></div>`;
  const tb = pane.querySelector('tbody');
  const max = Math.max(1, ...rows.map(r => r.value || 0));
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `<td><span class="aiu-sw" style="background:${colorFor(r.key || '(sem)')}"></span>${esc(r.key || '(sem modelo)')}${r.estimated ? ' <span class="aiu-est">≈</span>' : ''}</td>
      <td>${esc(r.sources || '')}</td>
      <td class="num"><div class="aiu-cellbar" style="width:${100 * (r.value || 0) / max}%"></div>${fmt(r.value)}</td>
      <td class="num">${fmt(r.total, 'total')}</td><td class="num">${fmt(r.output, 'total')}</td><td class="num">${fmt(r.cache_read, 'total')}</td>
      <td class="num">${fmt(r.calls, 'calls')}</td><td class="num">${r.sessions}</td><td class="num">${r.days}</td><td class="aiu-nowrap">${esc(shortDay(r.first_day))} → ${esc(shortDay(r.last_day))}</td>`;
    tr.addEventListener('click', () => { st.filters.models.add(r.key); syncFilters(); st.tab = 'overview'; st.by = 'category'; syncToolbar(); render(); });
    tb.append(tr);
  }
}

async function renderSessions(pane) {
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">Sessões
      <input class="aiu-search" placeholder="buscar título, pasta…" value="${esc(st.q)}">
      <select class="aiu-sort">${[['total', 'Mais tokens'], ['output', 'Mais saída'], ['calls', 'Mais chamadas'], ['days', 'Mais dias'], ['last', 'Mais recentes']].map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <table class="aiu-table"><thead><tr><th>Sessão</th><th>Ferramenta</th><th>Categorias</th><th>Modelos</th><th class="num">Total</th><th class="num">Saída</th><th class="num">Chamadas</th><th class="num">Dias</th><th>Período</th></tr></thead><tbody></tbody></table></div>
    <div class="aiu-detail"></div>`;
  const search = pane.querySelector('.aiu-search');
  let tmr;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = search.value; fill(); }, 300); });
  pane.querySelector('.aiu-sort').addEventListener('change', e => { st.sort = e.target.value; fill(); });
  async function fill() {
    const rows = await get('sessions', { q: st.q, sort: st.sort, limit: 400 });
    const tb = pane.querySelector('tbody');
    tb.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.className = 'clickable';
      tr.innerHTML = `<td class="aiu-title" title="${esc(r.cwd || '')}">${esc((r.title || r.session_key).slice(0, 90))}</td><td>${esc(r.source)}${r.machine ? `<small> · ${esc(r.machine)}</small>` : ''}</td>
        <td>${(r.categories || '').split(',').map(c => `<span class="aiu-chip" style="border-color:${colorFor(c)}">${esc(c)}</span>`).join('')}</td>
        <td><small>${esc((r.models || '').split(',').join(', '))}</small></td>
        <td class="num">${fmt(r.total, 'total')}${r.estimated ? ' <span class="aiu-est">≈</span>' : ''}</td><td class="num">${fmt(r.output, 'total')}</td><td class="num">${fmt(r.calls, 'calls')}</td>
        <td class="num">${r.days}</td><td class="aiu-nowrap">${esc(shortDay(r.first_day))}${r.last_day !== r.first_day ? ' → ' + esc(shortDay(r.last_day)) : ''}</td>`;
      tr.addEventListener('click', () => showSession(pane.querySelector('.aiu-detail'), r.session_key));
      tb.append(tr);
    }
    if (!rows.length) tb.innerHTML = '<tr><td colspan="9" class="aiu-empty">Nenhuma sessão.</td></tr>';
  }
  await fill();
}

async function showSession(host, key) {
  host.innerHTML = '<div class="aiu-card">Carregando…</div>';
  const r = await fetch(`${API}/session?key=${encodeURIComponent(key)}`, { credentials: 'same-origin' });
  if (!r.ok) { host.innerHTML = `<div class="aiu-card aiu-empty">Erro ${r.status}</div>`; return; }
  const d = await r.json(), s = d.session;
  const days = [...new Set(d.days.map(x => x.day))];
  const models = [...new Set(d.days.map(x => x.model || '(sem)'))];
  const series = { buckets: days, bucket: 'day', series: models.map(m => ({ key: m, values: days.map(day => d.days.filter(x => x.day === day && (x.model || '(sem)') === m).reduce((a, x) => a + (x[st.metric === 'cost_usd' ? 'total' : st.metric] || 0), 0)) })) };
  host.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">${esc(s.ai_title || s.title || s.session_id)} <button class="aiu-x" title="fechar">✕</button></div>
    <div class="aiu-meta">
      <div><b>Ferramenta</b> ${esc(s.source)} · ${esc(s.machine || '')}${s.entrypoint ? ' · ' + esc(s.entrypoint) : ''}${s.version ? ' v' + esc(s.version) : ''}</div>
      <div><b>Pasta</b> ${esc(s.cwd || '—')}${s.branch ? ` · branch ${esc(s.branch)}` : ''}</div>
      <div><b>Categoria</b> ${esc(s.category || '')} <small>(${esc(s.reason || '')})</small></div>
      <div><b>Período</b> ${esc((s.first_ts || '').slice(0, 16).replace('T', ' '))} → ${esc((s.last_ts || '').slice(0, 16).replace('T', ' '))}${s.active_ms ? ` · ${Math.round(s.active_ms / 60000)} min de trabalho do agente` : ''}${s.compactions ? ` · ${s.compactions} compactações` : ''}</div>
      <div><b>Prompts</b> ${s.user_prompts || d.prompts.n || 0}${d.extra.reasoning ? ` · raciocínio ${fmt(d.extra.reasoning, 'total')}` : ''}${d.extra.ws ? ` · ${d.extra.ws} buscas web` : ''}${d.extra.efforts ? ` · esforço ${esc(d.extra.efforts)}` : ''}${d.extra.latency ? ` · latência média ${(d.extra.latency / 1000).toFixed(1)} s` : ''}${s.lines_added ? ` · +${s.lines_added}/−${s.lines_removed || 0} linhas` : ''}</div>
    </div>
    <div class="aiu-card-h">${METRICS[st.metric]} por dia e modelo</div><div class="aiu-chart"></div>
    <div class="aiu-legend">${models.map(m => `<span><span class="aiu-sw" style="background:${colorFor(m)}"></span>${esc(m)}</span>`).join('')}</div>
    <div class="aiu-card-h aiu-gap">Ferramentas que o agente usou</div><div class="aiu-tools"></div></div>`;
  host.querySelector('.aiu-x').onclick = () => { host.innerHTML = ''; };
  stackedBars(host.querySelector('.aiu-chart'), series);
  hbars(host.querySelector('.aiu-tools'), d.tools.map(t => ({ key: t.tool, value: t.n })), { valueKey: 'value' });
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderCalendar(pane) {
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">${METRICS[st.metric]} por dia <span class="aiu-hint">clique num dia = ver as sessões dele</span></div><div class="aiu-heat"></div></div>`;
  heatmap(pane.querySelector('.aiu-heat'), await get('heatmap', { metric: st.metric }));
}

async function renderTools(pane) {
  const r = range();
  const p = new URLSearchParams();
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  if (st.filters.sources.size) p.set('sources', [...st.filters.sources].join(','));
  const rows = await (await fetch(`${API}/tools?${p}`, { credentials: 'same-origin' })).json();
  pane.innerHTML = '<div class="aiu-card"><div class="aiu-card-h">Ferramentas mais chamadas pelos agentes</div><div class="aiu-tools"></div></div>';
  hbars(pane.querySelector('.aiu-tools'), rows.map(x => ({ ...x, key: `${x.tool} · ${x.source}`, value: x.calls })), {
    valueKey: 'value', sub: x => `${x.sessions} sessões`,
  });
}

async function renderLimits(pane) {
  pane.innerHTML = '<div class="aiu-card"><div class="aiu-card-h">Limites do plano (Codex) — maior uso do dia em cada janela</div><div class="aiu-lim"></div></div>';
  const rows = await (await fetch(`${API}/limits`, { credentials: 'same-origin' })).json();
  lineChart(pane.querySelector('.aiu-lim'), rows);
}

function seriesFrom(rows, keyField, valField) {
  const buckets = [...new Set(rows.map(r => r.day))].sort();
  const keys = [...new Set(rows.map(r => r[keyField]))];
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const tot = new Map(keys.map(k => [k, 0]));
  rows.forEach(r => tot.set(r[keyField], tot.get(r[keyField]) + (r[valField] || 0)));
  keys.sort((a, b) => tot.get(b) - tot.get(a));
  return { bucket: 'day', buckets, series: keys.map(k => {
    const v = new Array(buckets.length).fill(0);
    rows.forEach(r => { if (r[keyField] === k) v[idx.get(r.day)] += r[valField] || 0; });
    return { key: k, values: v };
  }) };
}
function rangeQs() {
  const r = range(), p = new URLSearchParams();
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  return p.toString();
}

async function renderWeb(pane) {
  const d = await (await fetch(`${API}/web?${rangeQs()}`, { credentials: 'same-origin' })).json();
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">Chats de IA no navegador · visitas por dia <span class="aiu-hint">do histórico do Firefox/Chrome: sem tokens (os sites não expõem); só o período filtra</span></div>
      <div class="aiu-chart"></div><div class="aiu-legend"></div></div>
    <div class="aiu-grid2">
      <div class="aiu-card"><div class="aiu-card-h">Conversas mais visitadas</div>
        <table class="aiu-table"><thead><tr><th>Conversa</th><th>Site</th><th class="num">Visitas</th><th>Período</th></tr></thead><tbody></tbody></table></div>
      <div class="aiu-card"><div class="aiu-card-h">Por site</div><div class="aiu-sites"></div></div>
    </div>`;
  const prev = 'calls';
  const fmtVis = v => fmt(v, prev);
  const series = seriesFrom(d.days, 'site', 'visits');
  const saved = st.metric; st.metric = 'calls';
  stackedBars(pane.querySelector('.aiu-chart'), series);
  st.metric = saved;
  pane.querySelector('.aiu-legend').innerHTML = series.series.map(s => `<span><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}</span>`).join('');
  hbars(pane.querySelector('.aiu-sites'), d.sites.map(x => ({ ...x, key: x.site, value: x.visits })), {
    sub: x => `${x.conversations} conversas · ${x.days} dias · ${esc(shortDay(x.first_day))} → ${esc(shortDay(x.last_day))}`,
  });
  const tb = pane.querySelector('tbody');
  tb.innerHTML = d.conversations.map(c => `<tr><td class="aiu-title" title="${esc(c.title || '')}">${esc(c.title || c.conversation)}</td><td>${esc(c.site)}</td><td class="num">${fmtVis(c.visits)}</td><td class="aiu-nowrap">${esc(shortDay(c.first_day))}${c.last_day !== c.first_day ? ' → ' + esc(shortDay(c.last_day)) : ''}</td></tr>`).join('')
    || '<tr><td colspan="4" class="aiu-empty">Nenhuma conversa no período.</td></tr>';
}

async function renderCode(pane) {
  const d = await (await fetch(`${API}/ai-code?${rangeQs()}`, { credentials: 'same-origin' })).json();
  const tot = d.commits.reduce((a, c) => ({ add: a.add + (c.lines_added || 0), ai: a.ai + (c.ai_added || 0), hu: a.hu + (c.human_added || 0) }), { add: 0, ai: 0, hu: 0 });
  pane.innerHTML = `<div class="aiu-kpis">
      <div class="aiu-kpi"><div class="aiu-kpi-v">${fmt(d.models.reduce((a, m) => a + m.blocks, 0), 'calls')}</div><div class="aiu-kpi-l">blocos de código gerados</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${d.commits.length}</div><div class="aiu-kpi-l">commits avaliados</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${tot.add ? Math.round(100 * tot.ai / tot.add) : 0}%</div><div class="aiu-kpi-l">das linhas commitadas vieram da IA</div><div class="aiu-kpi-s">${fmt(tot.ai, 'calls')} de ${fmt(tot.add, 'calls')} linhas</div></div>
    </div>
    <div class="aiu-card"><div class="aiu-card-h">Cursor · blocos de código por dia e modelo <span class="aiu-hint">ai-code-tracking do Cursor; só o período filtra</span></div><div class="aiu-chart"></div><div class="aiu-legend"></div></div>
    <div class="aiu-grid2">
      <div class="aiu-card"><div class="aiu-card-h">Commits (linhas IA × humano)</div>
        <table class="aiu-table"><thead><tr><th>Dia</th><th>Branch</th><th>Commit</th><th class="num">+ linhas</th><th class="num">IA</th><th class="num">IA %</th></tr></thead><tbody></tbody></table></div>
      <div class="aiu-card"><div class="aiu-card-h">Por modelo</div><div class="aiu-models"></div></div>
    </div>`;
  const series = seriesFrom(d.days, 'model', 'blocks');
  const saved = st.metric; st.metric = 'calls';
  stackedBars(pane.querySelector('.aiu-chart'), series);
  hbars(pane.querySelector('.aiu-models'), d.models.map(m => ({ ...m, key: m.model, value: m.blocks })), {
    sub: m => `${esc(m.kind)} · ${m.conversations} conversas · ${esc(shortDay(m.first_day))} → ${esc(shortDay(m.last_day))}`,
  });
  st.metric = saved;
  pane.querySelector('.aiu-legend').innerHTML = series.series.map(s => `<span><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}</span>`).join('');
  pane.querySelector('tbody').innerHTML = d.commits.map(c => `<tr><td class="aiu-nowrap">${esc(shortDay(c.day))}</td><td>${esc(c.branch || '')}</td><td><code>${esc((c.commit_hash || '').slice(0, 8))}</code></td><td class="num">${c.lines_added || 0}</td><td class="num">${c.ai_added || 0}</td><td class="num">${c.lines_added ? Math.round(100 * (c.ai_added || 0) / c.lines_added) : 0}%</td></tr>`).join('')
    || '<tr><td colspan="6" class="aiu-empty">Nenhum commit no período.</td></tr>';
}

const TABS = { overview: ['Visão geral', renderOverview], models: ['Modelos', renderModels], sessions: ['Sessões', renderSessions],
  calendar: ['Calendário', renderCalendar], tools: ['Ferramentas', renderTools], limits: ['Limites Codex', renderLimits],
  web: ['Chats web', renderWeb], code: ['Código IA', renderCode] };

async function render() {
  if (!els.body) return;
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = els.body;
  // mantem o desenho anterior esmaecido enquanto carrega (sem trocar por "Carregando…": era o que piscava)
  if (!pane.children.length) pane.innerHTML = '<div class="aiu-empty">Carregando…</div>';
  pane.style.opacity = '0.55';
  try {
    await TABS[st.tab][1](pane);
  } catch (e) {
    pane.innerHTML = `<div class="aiu-empty">Falhou: ${esc(e.message)}</div>`;
  } finally {
    pane.style.opacity = '';
  }
}

// ── toolbar / filtros ───────────────────────────────────────────────────
function syncToolbar() {
  const t = els.toolbar;
  t.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b.dataset.period === st.period));
  t.querySelector('.aiu-from').value = st.period === 'custom' ? st.from : range().from;
  t.querySelector('.aiu-to').value = st.period === 'custom' ? st.to : range().to;
  t.querySelector('.aiu-by').value = st.by;
  t.querySelector('.aiu-metric').value = st.metric;
  t.querySelector('.aiu-bucket').value = st.bucket;
  t.querySelector('.aiu-estim').checked = st.estimated;
}
function syncFilters() {
  const host = els.filters;
  const names = { sources: 'ferramenta', categories: 'categoria', models: 'modelo', machines: 'máquina' };
  const chips = [];
  for (const [k, set] of Object.entries(st.filters)) for (const v of set) chips.push(`<span class="aiu-fchip" data-k="${k}" data-v="${esc(v)}">${names[k]}: ${esc(v || '(sem)')} ✕</span>`);
  host.innerHTML = chips.length ? chips.join('') + '<span class="aiu-fclear">limpar filtros</span>' : '';
}

function buildToolbar() {
  const t = els.toolbar;
  t.innerHTML = `
    <div class="aiu-tgroup">${PERIODS.map(([v, l]) => `<button data-period="${v}">${l}</button>`).join('')}
      <input type="date" class="aiu-from"><span>→</span><input type="date" class="aiu-to"></div>
    <div class="aiu-tgroup">
      <label>Agrupar <select class="aiu-by">${Object.entries(DIMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Métrica <select class="aiu-metric">${Object.entries(METRICS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Por <select class="aiu-bucket"><option value="day">dia</option><option value="week">semana</option><option value="month">mês</option></select></label>
      <label title="Cursor e parte do Copilot não gravam tokens: o valor é estimado pelo texto (subestima)"><input type="checkbox" class="aiu-estim"> incluir estimados (≈)</label>
    </div>`;
  t.addEventListener('click', e => {
    const b = e.target.closest('[data-period]');
    if (b) { st.period = b.dataset.period; syncToolbar(); render(); }
  });
  const onDate = () => { st.period = 'custom'; st.from = t.querySelector('.aiu-from').value; st.to = t.querySelector('.aiu-to').value; syncToolbar(); render(); };
  t.querySelector('.aiu-from').addEventListener('change', onDate);
  t.querySelector('.aiu-to').addEventListener('change', onDate);
  t.querySelector('.aiu-by').addEventListener('change', e => { st.by = e.target.value; st.hidden.clear(); render(); });
  t.querySelector('.aiu-metric').addEventListener('change', e => { st.metric = e.target.value; render(); });
  t.querySelector('.aiu-bucket').addEventListener('change', e => { st.bucket = e.target.value; render(); });
  t.querySelector('.aiu-estim').addEventListener('change', e => { st.estimated = e.target.checked; render(); });
  els.filters.addEventListener('click', e => {
    const c = e.target.closest('.aiu-fchip');
    if (c) { st.filters[c.dataset.k].delete(c.dataset.v); syncFilters(); render(); return; }
    if (e.target.closest('.aiu-fclear')) { Object.values(st.filters).forEach(s => s.clear()); syncFilters(); render(); }
  });
}

function buildPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'modal hidden';
  panel.innerHTML = `
    <div class="modal-content aiu-content">
      <div class="modal-header aiu-header">
        <span class="aiu-titlebar">Uso de IA</span>
        <span class="aiu-status"></span>
        <button class="close-btn" aria-label="Fechar">✖</button>
      </div>
      <div class="aiu-toolbar"></div>
      <div class="aiu-filters"></div>
      <div class="aiu-tabs">${Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="aiu-body"></div>
      <div class="aiu-tip"></div>
    </div>`;
  document.body.appendChild(panel);
  els = {
    panel, content: panel.querySelector('.modal-content'), header: panel.querySelector('.modal-header'),
    toolbar: panel.querySelector('.aiu-toolbar'), filters: panel.querySelector('.aiu-filters'),
    tabs: panel.querySelector('.aiu-tabs'), body: panel.querySelector('.aiu-body'), tip: panel.querySelector('.aiu-tip'),
    status: panel.querySelector('.aiu-status'),
  };
  panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', () => {
    try {
      panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
    } catch (_) {}
  }, true);
  els.tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { st.tab = b.dataset.tab; try { localStorage.setItem('odysseus-aiu-tab', st.tab); } catch (_) {} render(); }
  });
  try { st.tab = localStorage.getItem('odysseus-aiu-tab') || 'overview'; } catch (_) {}
  if (!TABS[st.tab]) st.tab = 'overview';
  buildToolbar();
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, {
      label: 'Uso de IA',
      restoreFn: () => {},
      closeFn: () => document.getElementById(PANEL_ID)?.classList.add('hidden'),
    });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
  let rt;
  // so redesenha quando a janela muda de largura de verdade. Antes: a barra de rolagem aparecer mudava a
  // largura util -> redesenho -> conteudo encolhia no meio do redesenho -> barra sumia -> loop (piscava 2x/s)
  let lastW = 0;
  new ResizeObserver(() => {
    // offsetWidth inclui a barra de rolagem: ela aparecer/sumir NAO muda esse valor (contentRect mudava)
    const w = els.body.offsetWidth;
    if (Math.abs(w - lastW) <= 8) return;
    lastW = w;
    clearTimeout(rt); rt = setTimeout(() => { if (!panel.classList.contains('hidden')) render(); }, 250);
  }).observe(els.body);
  return panel;
}

async function openPanel() {
  const panel = buildPanel();
  panel.classList.remove('hidden');
  try {
    panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
  } catch (_) {}
  try {
    st.meta = await (await fetch(`${API}/meta`, { credentials: 'same-origin' })).json();
  } catch (e) {
    showError(`Uso de IA: ${e.message}`);
    return;
  }
  if (!st.meta.available) {
    els.body.innerHTML = `<div class="aiu-empty">Banco não encontrado. ${esc(st.meta.hint || '')}</div>`;
    return;
  }
  const lr = st.meta.last_run;
  els.status.textContent = `${st.meta.day_min} → ${st.meta.day_max}` + (lr ? ` · atualizado ${new Date(lr.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : '');
  syncToolbar();
  syncFilters();
  render();
}

function mountSidebar() {
  const list = document.getElementById('ai-usage-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  const item = document.createElement('div');
  item.className = 'list-item aiu-side-item';
  item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg><span class="grow">Tokens, modelos e sessões</span>`;
  item.addEventListener('click', openPanel);
  list.append(item);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebar);
else mountSidebar();

export { openPanel };
