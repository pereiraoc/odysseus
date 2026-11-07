// static/js/aiUsage.js — app "AI usage" do hub Life (fork-local, ver LOCAL_CHANGES.md)
// `mountAiUsage(host, hub)` desenha dentro do host do hub, com UI em inglês.
//
// Le /api/ai-usage/* (routes/ai_usage_routes.py), que consulta o banco do
// ai-usage-export do host: tokens por dia, sessao, modelo e categoria de Claude
// Code, Codex, Cursor, Copilot, Cline e do proprio Odysseus. Graficos em SVG
// feitos aqui (sem biblioteca externa: o CSP do app nao libera CDN).
import { esc } from './ui.js?v=20260916largetoolscroll1';
import { isIsoDate, lifeHref } from './life/router.js';

const API = '/api/ai-usage';
const METRICS = {
  total: 'Tokens (total)', output: 'Output', input: 'Input (no cache)', cache_read: 'Cache read',
  cache_write: 'Cache written', calls: 'Calls', cost_usd: 'Cost (US$, Cline only)',
};
const DIMS = { category: 'Category', model: 'Model', source: 'Tool', machine: 'Machine' };
const PERIODS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['all', 'All']];
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
let hubRef = null;      // hub do Life (navegação entre abas); definido em mountAiUsage
let resizeObs = null;   // ResizeObserver do corpo; desconectado no unmount

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
// AAAA-MM-DD → dd/mm/yyyy (formato en-GB do Life, ano com 4 dígitos); dayMonth: dd/mm (eixos)
function shortDay(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''; }
function dayMonth(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''; }
// AAAA-MM-DDTHH:MM… → dd/mm/yyyy HH:MM (o horário como veio do banco)
function shortStamp(ts) { return ts ? `${shortDay(ts.slice(0, 10))} ${ts.slice(11, 16)}`.trim() : ''; }
function isoDay(d) { return d.toISOString().slice(0, 10); }
// `from`/`to` da URL: só AAAA-MM-DD (isIsoDate, compartilhado com Finances) e uma data que existe
const isDate = v => isIsoDate(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));
// dia de uma sessão: link que abre o dia no Diary
function dayLink(d) {
  if (!d) return '';
  const iso = String(d).slice(0, 10);
  return `<a class="aiu-daylink" href="${esc(lifeHref('diary', [iso]))}" title="Open this day in Diary">${esc(shortDay(iso))}</a>`;
}
// período de uma sessão (primeiro → último dia), com links
function daySpan(a, b) { return dayLink(a) + (b && b !== a ? ' → ' + dayLink(b) : ''); }
// navega para uma aba mantendo o período personalizado na URL
function goTab(tab) { void hubRef.navigate([tab], st.period === 'custom' ? { from: st.from, to: st.to } : {}); }
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
  if (!n) { host.innerHTML = '<div class="aiu-empty">No data for this period/filters.</div>'; return; }
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
      r.addEventListener('mousemove', e => tip(e, `<b>${esc(data.bucket === 'day' ? shortDay(bk) : bk)}</b><br><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}: <b>${fmt(v)}</b><br>Bucket total: ${fmt(totals[i])}`));
      r.addEventListener('mouseleave', e => tip(e, null));
      if (onBucket) r.addEventListener('click', () => onBucket(bk));
      svg.append(r);
      y0 -= h;
    }
    if (i % every === 0) svg.append(svgEl('text', { x: x + w / 2, y: H - 8, class: 'aiu-axis', 'text-anchor': 'middle' },
      data.bucket === 'day' ? dayMonth(bk) : bk));
  });
  host.append(svg);
}

function hbars(host, rows, { onClick, valueKey = 'value', label = r => r.key, sub } = {}) {
  host.innerHTML = '';
  if (!rows.length) { host.innerHTML = '<div class="aiu-empty">No data.</div>'; return; }
  const max = Math.max(1, ...rows.map(r => r[valueKey] || 0));
  const sum = rows.reduce((a, r) => a + (r[valueKey] || 0), 0) || 1;
  for (const r of rows) {
    const key = label(r) ?? '(none)';
    const row = document.createElement('div');
    row.className = 'aiu-hbar' + (onClick ? ' clickable' : '');
    row.innerHTML = `<div class="aiu-hbar-label" title="${esc(key)}"><span class="aiu-sw" style="background:${colorFor(key)}"></span>${esc(key)}${r.estimated ? ' <span class="aiu-est" title="includes estimates">≈</span>' : ''}</div>
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
  if (!rows.length) { host.innerHTML = '<div class="aiu-empty">No data.</div>'; return; }
  const byDay = new Map(rows.map(r => [r.day, r]));
  const first = new Date(rows[0].day + 'T12:00:00'), last = new Date(rows[rows.length - 1].day + 'T12:00:00');
  const start = new Date(first); start.setDate(start.getDate() - start.getDay());
  const weeks = Math.ceil(((last - start) / 864e5 + 1) / 7);
  const C = 16, G = 3, L = 28, T = 18;
  const max = Math.max(1, ...rows.map(r => r.value || 0));
  const svg = svgEl('svg', { width: L + weeks * (C + G) + 4, height: T + 7 * (C + G) + 4, class: 'aiu-svg' });
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => i % 2 && svg.append(svgEl('text', { x: 0, y: T + i * (C + G) + 11, class: 'aiu-axis' }, d)));
  let lastMonth = -1, lastLabelW = -9;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      if (day > last) break;
      const k = isoDay(day), r = byDay.get(k), v = r?.value || 0;
      if (d === 0 && day.getMonth() !== lastMonth && w - lastLabelW >= 3) {
        lastMonth = day.getMonth(); lastLabelW = w;
        svg.append(svgEl('text', { x: L + w * (C + G), y: 11, class: 'aiu-axis' }, day.toLocaleDateString('en-GB', { month: 'short' })));
      }
      const a = v ? 0.18 + 0.82 * Math.sqrt(v / max) : 0;
      const cell = svgEl('rect', { x: L + w * (C + G), y: T + d * (C + G), width: C, height: C, rx: 3,
        class: 'aiu-cell' + (v ? '' : ' empty'), style: v ? `fill-opacity:${a}` : '' });
      cell.addEventListener('mousemove', e => tip(e, `<b>${shortDay(k)}</b><br>${fmt(v)}${r ? ` · ${r.sessions} session(s)` : ''}`));
      cell.addEventListener('mouseleave', e => tip(e, null));
      if (v) cell.addEventListener('click', () => { st.period = 'custom'; st.from = k; st.to = k; syncToolbar(); goTab('sessions'); });
      svg.append(cell);
    }
  }
  host.append(svg);
}

function lineChart(host, rows) {
  host.innerHTML = '';
  if (!rows.length) { host.innerHTML = '<div class="aiu-empty">No limit readings (only Codex records them).</div>'; return; }
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
      c.addEventListener('mousemove', e => tip(e, `<b>${esc(shortDay(r.day))}</b><br>${esc(n)} (${Math.round(r.window_minutes / 60)} h window): <b>${r.used_percent}%</b> · plan ${esc(r.plan || '')}`));
      c.addEventListener('mouseleave', e => tip(e, null));
      svg.append(c);
    }
  }
  const every = Math.ceil(days.length / 8);
  days.forEach((d, i) => i % every === 0 && svg.append(svgEl('text', { x: x(i), y: H - 6, class: 'aiu-axis', 'text-anchor': 'middle' }, dayMonth(d))));
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
    <div class="aiu-card"><div class="aiu-card-h"><span>${METRICS[st.metric]} per ${st.bucket === 'day' ? 'day' : st.bucket === 'week' ? 'week' : 'month'} · ${DIMS[st.by]}</span><span class="aiu-hint">click a bar = show only that period · click the legend = hide</span></div>
      <div class="aiu-chart"></div><div class="aiu-legend clickable"></div></div>
    <div class="aiu-grid2">
      <div class="aiu-card"><div class="aiu-card-h">By ${DIMS[st.by].toLowerCase()} <span class="aiu-hint">click = filter</span></div><div class="aiu-break"></div></div>
      <div class="aiu-card"><div class="aiu-card-h">Hour of day</div><div class="aiu-hours"></div>
        <div class="aiu-card-h" style="margin-top:12px">Tool</div><div class="aiu-bysrc"></div></div>
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
    kpi('tokens in total', fmt(tot, 'total'), `${fmt(br.reduce((a, r) => a + (r.cache_read || 0), 0), 'total')} cache read`) +
    kpi('output (generated text)', fmt(out, 'total')) +
    kpi('days with usage', days.size, days.size ? `${fmt(tot / days.size, 'total')} per active day` : '') +
    kpi('sessions', fmt(sessions, 'calls')) +
    kpi(`top ${DIMS[st.by].toLowerCase()}`, esc(br[0]?.key || '—'), br[0] ? `${(100 * br[0].value / (br.reduce((a, r) => a + r.value, 0) || 1)).toFixed(0)}%` : '');
  stackedBars(pane.querySelector('.aiu-chart'), series, {
    onBucket: bk => {
      if (st.bucket !== 'day') return;
      st.period = 'custom'; st.from = bk; st.to = bk; syncToolbar(); goTab('overview');
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
    sub: r => `${fmt(r.output, 'total')} output · ${r.sessions} sessions · ${r.days} days · ${esc(shortDay(r.first_day))} → ${esc(shortDay(r.last_day))}`,
  });
  hoursChart(pane.querySelector('.aiu-hours'), hrs);
  hbars(pane.querySelector('.aiu-bysrc'), bysrc, { onClick: r => { st.filters.sources.add(r.key); syncFilters(); render(); } });
}

async function renderModels(pane) {
  const rows = await get('breakdown', { by: 'model', metric: st.metric });
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">Models · ${METRICS[st.metric]} <span class="aiu-hint">click = filter by model</span></div>
    <table class="aiu-table"><thead><tr><th>Model</th><th>Tools</th><th class="num">${METRICS[st.metric]}</th><th class="num">Total</th><th class="num">Output</th><th class="num">Cache read</th><th class="num">Calls</th><th class="num">Sessions</th><th class="num">Days</th><th>Period</th></tr></thead><tbody></tbody></table></div>`;
  const tb = pane.querySelector('tbody');
  const max = Math.max(1, ...rows.map(r => r.value || 0));
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `<td><span class="aiu-sw" style="background:${colorFor(r.key || '(none)')}"></span>${esc(r.key || '(no model)')}${r.estimated ? ' <span class="aiu-est">≈</span>' : ''}</td>
      <td>${esc(r.sources || '')}</td>
      <td class="num"><div class="aiu-cellbar" style="width:${100 * (r.value || 0) / max}%"></div>${fmt(r.value)}</td>
      <td class="num">${fmt(r.total, 'total')}</td><td class="num">${fmt(r.output, 'total')}</td><td class="num">${fmt(r.cache_read, 'total')}</td>
      <td class="num">${fmt(r.calls, 'calls')}</td><td class="num">${r.sessions}</td><td class="num">${r.days}</td><td class="aiu-nowrap">${esc(shortDay(r.first_day))} → ${esc(shortDay(r.last_day))}</td>`;
    tr.addEventListener('click', () => { st.filters.models.add(r.key); syncFilters(); st.by = 'category'; syncToolbar(); goTab('overview'); });
    tb.append(tr);
  }
}

async function renderSessions(pane) {
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">Sessions
      <input class="aiu-search" placeholder="search title, folder…" value="${esc(st.q)}">
      <select class="aiu-sort">${[['total', 'Most tokens'], ['output', 'Most output'], ['calls', 'Most calls'], ['days', 'Most days'], ['last', 'Most recent']].map(([v, l]) => `<option value="${v}" ${st.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <table class="aiu-table"><thead><tr><th>Session</th><th>Tool</th><th>Categories</th><th>Models</th><th class="num">Total</th><th class="num">Output</th><th class="num">Calls</th><th class="num">Days</th><th>Period</th></tr></thead><tbody></tbody></table></div>
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
        <td class="num">${r.days}</td><td class="aiu-nowrap">${daySpan(r.first_day, r.last_day)}</td>`;
      tr.addEventListener('click', e => { if (e.target.closest('a')) return; showSession(pane.querySelector('.aiu-detail'), r.session_key); });
      tb.append(tr);
    }
    if (!rows.length) tb.innerHTML = '<tr><td colspan="9" class="aiu-empty">No sessions.</td></tr>';
  }
  await fill();
}

async function showSession(host, key) {
  host.innerHTML = '<div class="aiu-card">Loading…</div>';
  const r = await fetch(`${API}/session?key=${encodeURIComponent(key)}`, { credentials: 'same-origin' });
  if (!r.ok) { host.innerHTML = `<div class="aiu-card aiu-empty">Error ${r.status}</div>`; return; }
  const d = await r.json(), s = d.session;
  const days = [...new Set(d.days.map(x => x.day))];
  const models = [...new Set(d.days.map(x => x.model || '(none)'))];
  const series = { buckets: days, bucket: 'day', series: models.map(m => ({ key: m, values: days.map(day => d.days.filter(x => x.day === day && (x.model || '(none)') === m).reduce((a, x) => a + (x[st.metric === 'cost_usd' ? 'total' : st.metric] || 0), 0)) })) };
  host.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">${esc(s.ai_title || s.title || s.session_id)} <button class="aiu-x" title="close">✕</button></div>
    <div class="aiu-meta">
      <div><b>Tool</b> ${esc(s.source)} · ${esc(s.machine || '')}${s.entrypoint ? ' · ' + esc(s.entrypoint) : ''}${s.version ? ' v' + esc(s.version) : ''}</div>
      <div><b>Folder</b> ${esc(s.cwd || '—')}${s.branch ? ` · branch ${esc(s.branch)}` : ''}</div>
      <div><b>Category</b> ${esc(s.category || '')} <small>(${esc(s.reason || '')})</small></div>
      <div><b>Period</b> ${esc(shortStamp(s.first_ts || ''))} → ${esc(shortStamp(s.last_ts || ''))}${s.active_ms ? ` · ${Math.round(s.active_ms / 60000)} min of agent work` : ''}${s.compactions ? ` · ${s.compactions} compactions` : ''}</div>
      <div><b>Days</b> ${days.map(dayLink).join(', ') || '—'}</div>
      <div><b>Prompts</b> ${s.user_prompts || d.prompts.n || 0}${d.extra.reasoning ? ` · reasoning ${fmt(d.extra.reasoning, 'total')}` : ''}${d.extra.ws ? ` · ${d.extra.ws} web searches` : ''}${d.extra.efforts ? ` · effort ${esc(d.extra.efforts)}` : ''}${d.extra.latency ? ` · average latency ${(d.extra.latency / 1000).toFixed(1)} s` : ''}${s.lines_added ? ` · +${s.lines_added}/−${s.lines_removed || 0} lines` : ''}</div>
    </div>
    <div class="aiu-card-h">${METRICS[st.metric]} per day and model</div><div class="aiu-chart"></div>
    <div class="aiu-legend">${models.map(m => `<span><span class="aiu-sw" style="background:${colorFor(m)}"></span>${esc(m)}</span>`).join('')}</div>
    <div class="aiu-card-h aiu-gap">Tools the agent used</div><div class="aiu-tools"></div></div>`;
  host.querySelector('.aiu-x').onclick = () => { host.innerHTML = ''; };
  stackedBars(host.querySelector('.aiu-chart'), series);
  hbars(host.querySelector('.aiu-tools'), d.tools.map(t => ({ key: t.tool, value: t.n })), { valueKey: 'value' });
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderCalendar(pane) {
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">${METRICS[st.metric]} per day <span class="aiu-hint">click a day = see its sessions</span></div><div class="aiu-heat"></div></div>`;
  heatmap(pane.querySelector('.aiu-heat'), await get('heatmap', { metric: st.metric }));
}

async function renderTools(pane) {
  const r = range();
  const p = new URLSearchParams();
  if (r.from) p.set('from', r.from);
  if (r.to) p.set('to', r.to);
  if (st.filters.sources.size) p.set('sources', [...st.filters.sources].join(','));
  const rows = await (await fetch(`${API}/tools?${p}`, { credentials: 'same-origin' })).json();
  pane.innerHTML = '<div class="aiu-card"><div class="aiu-card-h">Tools most called by the agents</div><div class="aiu-tools"></div></div>';
  hbars(pane.querySelector('.aiu-tools'), rows.map(x => ({ ...x, key: `${x.tool} · ${x.source}`, value: x.calls })), {
    valueKey: 'value', sub: x => `${x.sessions} sessions`,
  });
}

async function renderLimits(pane) {
  pane.innerHTML = '<div class="aiu-card"><div class="aiu-card-h">Plan limits (Codex) — highest usage of the day in each window</div><div class="aiu-lim"></div></div>';
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
  pane.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">AI chats in the browser · visits per day <span class="aiu-hint">from the Firefox/Chrome history: no tokens (sites do not expose them); only the period filters</span></div>
      <div class="aiu-chart"></div><div class="aiu-legend"></div></div>
    <div class="aiu-grid2">
      <div class="aiu-card"><div class="aiu-card-h">Most visited conversations</div>
        <table class="aiu-table"><thead><tr><th>Conversation</th><th>Site</th><th class="num">Visits</th><th>Period</th></tr></thead><tbody></tbody></table></div>
      <div class="aiu-card"><div class="aiu-card-h">By site</div><div class="aiu-sites"></div></div>
    </div>`;
  const prev = 'calls';
  const fmtVis = v => fmt(v, prev);
  const series = seriesFrom(d.days, 'site', 'visits');
  const saved = st.metric; st.metric = 'calls';
  stackedBars(pane.querySelector('.aiu-chart'), series);
  st.metric = saved;
  pane.querySelector('.aiu-legend').innerHTML = series.series.map(s => `<span><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}</span>`).join('');
  hbars(pane.querySelector('.aiu-sites'), d.sites.map(x => ({ ...x, key: x.site, value: x.visits })), {
    sub: x => `${x.conversations} conversations · ${x.days} days · ${esc(shortDay(x.first_day))} → ${esc(shortDay(x.last_day))}`,
  });
  const tb = pane.querySelector('tbody');
  tb.innerHTML = d.conversations.map(c => `<tr><td class="aiu-title" title="${esc(c.title || '')}">${esc(c.title || c.conversation)}</td><td>${esc(c.site)}</td><td class="num">${fmtVis(c.visits)}</td><td class="aiu-nowrap">${daySpan(c.first_day, c.last_day)}</td></tr>`).join('')
    || '<tr><td colspan="4" class="aiu-empty">No conversations in this period.</td></tr>';
}

async function renderCode(pane) {
  const d = await (await fetch(`${API}/ai-code?${rangeQs()}`, { credentials: 'same-origin' })).json();
  const tot = d.commits.reduce((a, c) => ({ add: a.add + (c.lines_added || 0), ai: a.ai + (c.ai_added || 0), hu: a.hu + (c.human_added || 0) }), { add: 0, ai: 0, hu: 0 });
  pane.innerHTML = `<div class="aiu-kpis">
      <div class="aiu-kpi"><div class="aiu-kpi-v">${fmt(d.models.reduce((a, m) => a + m.blocks, 0), 'calls')}</div><div class="aiu-kpi-l">code blocks generated</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${d.commits.length}</div><div class="aiu-kpi-l">commits evaluated</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${tot.add ? Math.round(100 * tot.ai / tot.add) : 0}%</div><div class="aiu-kpi-l">of committed lines came from AI</div><div class="aiu-kpi-s">${fmt(tot.ai, 'calls')} of ${fmt(tot.add, 'calls')} lines</div></div>
    </div>
    <div class="aiu-card"><div class="aiu-card-h">Cursor · code blocks per day and model <span class="aiu-hint">Cursor's ai-code-tracking; only the period filters</span></div><div class="aiu-chart"></div><div class="aiu-legend"></div></div>
    <div class="aiu-grid2">
      <div class="aiu-card"><div class="aiu-card-h">Commits (AI × human lines)</div>
        <table class="aiu-table"><thead><tr><th>Day</th><th>Branch</th><th>Commit</th><th class="num">+ lines</th><th class="num">AI</th><th class="num">AI %</th></tr></thead><tbody></tbody></table></div>
      <div class="aiu-card"><div class="aiu-card-h">By model</div><div class="aiu-models"></div></div>
    </div>`;
  const series = seriesFrom(d.days, 'model', 'blocks');
  const saved = st.metric; st.metric = 'calls';
  stackedBars(pane.querySelector('.aiu-chart'), series);
  hbars(pane.querySelector('.aiu-models'), d.models.map(m => ({ ...m, key: m.model, value: m.blocks })), {
    sub: m => `${esc(m.kind)} · ${m.conversations} conversations · ${esc(shortDay(m.first_day))} → ${esc(shortDay(m.last_day))}`,
  });
  st.metric = saved;
  pane.querySelector('.aiu-legend').innerHTML = series.series.map(s => `<span><span class="aiu-sw" style="background:${colorFor(s.key)}"></span>${esc(s.key)}</span>`).join('');
  pane.querySelector('tbody').innerHTML = d.commits.map(c => `<tr><td class="aiu-nowrap">${dayLink(c.day)}</td><td>${esc(c.branch || '')}</td><td><code>${esc((c.commit_hash || '').slice(0, 8))}</code></td><td class="num">${c.lines_added || 0}</td><td class="num">${c.ai_added || 0}</td><td class="num">${c.lines_added ? Math.round(100 * (c.ai_added || 0) / c.lines_added) : 0}%</td></tr>`).join('')
    || '<tr><td colspan="6" class="aiu-empty">No commits in this period.</td></tr>';
}

const TABS = { overview: ['Overview', renderOverview], models: ['Models', renderModels], sessions: ['Sessions', renderSessions],
  calendar: ['Calendar', renderCalendar], tools: ['Tools', renderTools], limits: ['Codex limits', renderLimits],
  web: ['Web chats', renderWeb], code: ['AI code', renderCode] };

// Cada render() pega um número e desenha num painel próprio dentro de .aiu-body; o conteúdo atual passa para o painel
// novo e fica esmaecido enquanto carrega (sem trocar por "Loading…": era o que piscava). Um desenho antigo que termina
// por último escreve no painel dele, já fora da página, e só o mais novo mostra erro ou tira o esmaecido.
let renderSeq = 0;
async function render() {
  if (!els.body) return;
  const mine = ++renderSeq;
  const body = els.body;
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = document.createElement('div');
  pane.className = 'aiu-pane';
  const prev = els.pane;
  if (prev?.parentNode === body) { pane.append(...prev.childNodes); prev.replaceWith(pane); } else body.replaceChildren(pane);
  els.pane = pane;
  if (!pane.children.length) pane.innerHTML = '<div class="aiu-empty">Loading…</div>';
  body.style.opacity = '0.55';
  try {
    await TABS[st.tab][1](pane);
  } catch (e) {
    if (mine === renderSeq) pane.innerHTML = `<div class="aiu-empty">Failed: ${esc(e.message)}</div>`;
  } finally {
    if (mine === renderSeq) body.style.opacity = '';
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
  const names = { sources: 'tool', categories: 'category', models: 'model', machines: 'machine' };
  const chips = [];
  for (const [k, set] of Object.entries(st.filters)) for (const v of set) chips.push(`<span class="aiu-fchip" data-k="${k}" data-v="${esc(v)}">${names[k]}: ${esc(v || '(none)')} ✕</span>`);
  host.innerHTML = chips.length ? chips.join('') + '<span class="aiu-fclear">clear filters</span>' : '';
}

function buildToolbar() {
  const t = els.toolbar;
  t.innerHTML = `
    <div class="aiu-tgroup">${PERIODS.map(([v, l]) => `<button data-period="${v}">${l}</button>`).join('')}
      <input type="date" class="aiu-from"><span>→</span><input type="date" class="aiu-to"></div>
    <div class="aiu-tgroup">
      <label>Group by <select class="aiu-by">${Object.entries(DIMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Metric <select class="aiu-metric">${Object.entries(METRICS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>By <select class="aiu-bucket"><option value="day">day</option><option value="week">week</option><option value="month">month</option></select></label>
      <label title="Cursor and part of Copilot do not record tokens: the value is estimated from the text (underestimates)"><input type="checkbox" class="aiu-estim"> include estimates (≈)</label>
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

export async function mountAiUsage(host, hub) {
  hubRef = hub;
  host.innerHTML = `<div class="aiu-content aiu-embedded">
    <div class="aiu-subhead"><span class="aiu-status"></span></div>
    <div class="aiu-toolbar"></div><div class="aiu-filters"></div>
    <div class="aiu-tabs">${Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="aiu-body"></div><div class="aiu-tip"></div>
  </div>`;
  const content = host.querySelector('.aiu-content');
  els = {
    panel: host, content, toolbar: content.querySelector('.aiu-toolbar'), filters: content.querySelector('.aiu-filters'),
    tabs: content.querySelector('.aiu-tabs'), body: content.querySelector('.aiu-body'), tip: content.querySelector('.aiu-tip'),
    status: content.querySelector('.aiu-status'),
  };
  st.meta = null;
  if (st.period === 'custom') st.period = '90';  // o período personalizado vem da URL (route), não de um mount anterior
  els.tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) goTab(b.dataset.tab);
  });
  buildToolbar();
  let rt;
  // so redesenha quando a largura muda de verdade. Antes: a barra de rolagem aparecer mudava a
  // largura util -> redesenho -> conteudo encolhia no meio do redesenho -> barra sumia -> loop (piscava 2x/s)
  let lastW = 0;
  if (resizeObs) resizeObs.disconnect();
  const body = els.body;
  resizeObs = new ResizeObserver(() => {
    // offsetWidth inclui a barra de rolagem: ela aparecer/sumir NAO muda esse valor (contentRect mudava)
    const w = body.offsetWidth;
    if (!w) return;  // painel escondido (fechado/minimizado): nada a redesenhar
    if (Math.abs(w - lastW) <= 8) return;
    lastW = w;
    clearTimeout(rt); rt = setTimeout(() => { if (body.isConnected && st.meta?.available) void render(); }, 250);
  });
  resizeObs.observe(body);
  let metaFailed = '';
  try {
    // com prazo: a montagem espera pelo /meta e, com o servidor travado, seguraria a fila do hub
    const r = await fetch(`${API}/meta`, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`${r.status}`);
    st.meta = await r.json();
  } catch (e) { st.meta = null; metaFailed = e?.name === 'TimeoutError' ? 'the server did not answer in time' : e.message; }
  if (!st.meta) {
    body.innerHTML = `<div class="aiu-empty">Failed: ${esc(metaFailed)}</div>`;
  } else if (!st.meta.available) {
    body.innerHTML = `<div class="aiu-empty">Database not found. ${esc(st.meta.hint || '')}</div>`;
  } else {
    const lr = st.meta.last_run;
    els.status.textContent = `${shortDay(st.meta.day_min)} → ${shortDay(st.meta.day_max)}` + (lr ? ` · updated ${new Date(lr.ts).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(', ', ' ')}` : '');
    syncToolbar();
    syncFilters();
  }
  return {
    route(path, params) {
      const key = path?.[0];
      let tab = TABS[key] ? key : '';
      if (!tab) { try { tab = localStorage.getItem('odysseus-aiu-tab') || ''; } catch (_) {} }
      st.tab = TABS[tab] ? tab : 'overview';
      const p = params || {};
      const from = isDate(p.from) ? p.from : '';
      const to = isDate(p.to) ? p.to : '';
      // #life/ai sem aba: põe a aba na URL (replace), como o Diary faz com o dia; sem isso o voltar de uma aba
      // para #life/ai reabria a última aba e parecia não fazer nada. Só se a URL ainda for a que o hub está
      // aplicando: se o usuário já foi para outra, a rota nova vem na fila.
      if (!TABS[key]) {
        if (location.hash === hub.currentHash()) void hub.navigate([st.tab], { from, to }, { replace: true });
        return;
      }
      if (from || to) {
        st.period = 'custom';
        st.from = from;
        st.to = to;
        if (st.meta?.available) syncToolbar();
      } else if (st.period === 'custom') {
        // URL sem período: o personalizado de antes não vale mais; volta ao padrão (90 dias)
        st.period = '90';
        st.from = '';
        st.to = '';
        if (st.meta?.available) syncToolbar();
      }
      try { localStorage.setItem('odysseus-aiu-tab', st.tab); } catch (_) {}
      if (!st.meta?.available) return;  // sem banco: o estado vazio já está no corpo
      void render();  // sem await: o hub não espera os fetches da aba
    },
    unmount() {
      renderSeq += 1;  // desenhos em andamento deste mount não mexem mais no corpo
      if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
      if (els.tip) els.tip.style.display = 'none';
    },
  };
}
