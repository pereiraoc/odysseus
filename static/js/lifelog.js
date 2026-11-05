// static/js/lifelog.js — painel "Life log" (fork-local, ver LOCAL_CHANGES.md)
//
// Le /api/lifelog/* (routes/lifelog_routes.py): historico do Google Takeout (pesquisas, YouTube, Maps, Play,
// Assistente...), Fit por dia, treinos e notas do Keep. Reaproveita o visual do painel "Uso de IA" (classes aiu-*);
// so o que e proprio fica em zz-fork-lifelog.css. Textos da UI em ingles (regra do usuario).
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showError, esc } from './ui.js?v=20260916largetoolscroll1';
import { nextToolWindowZ } from './toolWindowZOrder.js';

const PANEL_ID = 'lifelog-panel';
const API = '/api/lifelog';
const TABS = { day: 'Day', search: 'Search', trends: 'Trends' };
const LABEL = {
  search: 'Google Search', youtube_watch: 'YouTube · watched', youtube_search: 'YouTube · searched', maps: 'Maps',
  play: 'Play Store', assistant: 'Assistant', chrome: 'Chrome',
};
const ICON = { search: '🔎', youtube_watch: '▶️', youtube_search: '🔎', maps: '📍', play: '🛍️', assistant: '🎙️', chrome: '🌐' };
const PALETTE = ['#59c2ff', '#ffb454', '#7fd962', '#f07178', '#c792ea', '#2ec4b6', '#ff8f40', '#e6e16b',
  '#ff6ac1', '#8d9eff', '#a0785a', '#b8c4cc'];
const st = { tab: 'day', day: '', meta: null, q: '', source: '' };
let els = {};

const label = s => LABEL[s] || (s.startsWith('other:') ? s.slice(6) : s);
const icon = s => ICON[s] || '•';
const get = async (path, params = {}) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  const r = await fetch(`${API}/${path}${p.toString() ? '?' + p : ''}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `HTTP ${r.status}`);
  return r.json();
};
const time = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const nf = n => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }));

function buildPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'modal hidden';
  panel.innerHTML = `
    <div class="modal-content aiu-content">
      <div class="modal-header aiu-header">
        <span class="aiu-titlebar">Life log</span>
        <span class="aiu-status"></span>
        <button class="close-btn" aria-label="Close">✖</button>
      </div>
      <div class="aiu-tabs">${Object.entries(TABS).map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="aiu-body"></div>
    </div>`;
  document.body.appendChild(panel);
  els = { panel, content: panel.querySelector('.modal-content'), header: panel.querySelector('.modal-header'),
    tabs: panel.querySelector('.aiu-tabs'), body: panel.querySelector('.aiu-body'), status: panel.querySelector('.aiu-status') };
  panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', () => {
    try { panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important'); } catch (_) {}
  }, true);
  els.tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { st.tab = b.dataset.tab; render(); }
  });
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, { label: 'Life log', restoreFn: () => {}, closeFn: () => document.getElementById(PANEL_ID)?.classList.add('hidden') });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
  return panel;
}

function render() {
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  ({ day: renderDay, search: renderSearch, trends: renderTrends })[st.tab]().catch(e => {
    els.body.innerHTML = `<div class="aiu-card aiu-empty">${esc(e.message)}</div>`;
  });
}

async function renderDay() {
  const b = els.body;
  b.innerHTML = `<div class="llg-daybar">
      <button class="llg-prev" title="Previous day">◀</button>
      <input type="date" class="llg-date" value="${st.day}" min="${st.meta.range.from}" max="${st.meta.range.to}">
      <button class="llg-next" title="Next day">▶</button>
      <span class="aiu-hint llg-dayname"></span></div>
    <div class="llg-daybody"><div class="aiu-empty">Loading…</div></div>`;
  b.querySelector('.llg-prev').onclick = () => { st.day = shift(st.day, -1); renderDay(); };
  b.querySelector('.llg-next').onclick = () => { st.day = shift(st.day, 1); renderDay(); };
  b.querySelector('.llg-date').onchange = e => { if (e.target.value) { st.day = e.target.value; renderDay(); } };
  b.querySelector('.llg-dayname').textContent = new Date(st.day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const d = await get('day', { d: st.day });
  const body = b.querySelector('.llg-daybody');
  const fit = d.fit ? `<div class="aiu-kpis">
      <div class="aiu-kpi"><div class="aiu-kpi-v">${nf(d.fit.steps)}</div><div class="aiu-kpi-l">Steps</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${d.fit.distance_m == null ? '—' : (d.fit.distance_m / 1000).toFixed(1) + ' km'}</div><div class="aiu-kpi-l">Distance</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${nf(d.fit.move_minutes)}</div><div class="aiu-kpi-l">Move minutes</div></div>
      <div class="aiu-kpi"><div class="aiu-kpi-v">${nf(d.fit.calories)}</div><div class="aiu-kpi-l">Calories</div></div>
    </div>` : '';
  const ses = d.sessions.length ? `<div class="aiu-card"><div class="aiu-card-h">Workouts</div>${d.sessions.map(s =>
    `<div class="llg-row"><span class="llg-t">${time(s.start)}</span>🏃 ${esc(s.activity)} · ${Math.round(s.duration_s / 60)} min${s.distance_m ? ` · ${(s.distance_m / 1000).toFixed(1)} km` : ''}</div>`).join('')}</div>` : '';
  const notes = d.notes.length ? `<div class="aiu-card"><div class="aiu-card-h">Notes (Keep)</div>${d.notes.map(n =>
    `<details class="llg-note"><summary>📝 ${esc(n.title || '(untitled)')}${n.labels ? ` <small>· ${esc(n.labels)}</small>` : ''}</summary><pre>${esc(n.text || '')}</pre></details>`).join('')}</div>` : '';
  const ev = d.events.length ? `<div class="aiu-card"><div class="aiu-card-h">Activity <span class="aiu-hint">${d.events.length} events</span></div>${d.events.map(e =>
    `<div class="llg-row"><span class="llg-t">${time(e.ts)}</span><span title="${esc(label(e.source))}">${icon(e.source)}</span>
      ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a>` : esc(e.title)}
      ${e.detail ? `<small> · ${esc(e.detail)}</small>` : ''}<span class="llg-src">${esc(label(e.source))}</span></div>`).join('')}</div>`
    : '<div class="aiu-card aiu-empty">Nothing recorded on this day.</div>';
  body.innerHTML = fit + ses + notes + ev;
}

async function renderSearch() {
  const b = els.body;
  const opts = st.meta.sources.map(s => `<option value="${esc(s.source)}" ${s.source === st.source ? 'selected' : ''}>${esc(label(s.source))} (${nf(s.count)})</option>`).join('');
  b.innerHTML = `<div class="llg-daybar"><input class="aiu-search llg-q" placeholder="Search your history…" value="${esc(st.q)}">
      <select class="aiu-sort llg-src-sel"><option value="">All sources</option>${opts}</select></div><div class="llg-results"></div>`;
  const run = async () => {
    const out = b.querySelector('.llg-results');
    if (!st.q.trim()) { out.innerHTML = '<div class="aiu-empty">Type something to search.</div>'; return; }
    const r = await get('search', { q: st.q, source: st.source, limit: 300 });
    out.innerHTML = r.length ? `<div class="aiu-card">${r.map(e => `<div class="llg-row llg-click" data-d="${e.day}"><span class="llg-t">${e.day}</span>${icon(e.source)} ${esc(e.title)}<span class="llg-src">${esc(label(e.source))}</span></div>`).join('')}</div>`
      : '<div class="aiu-empty">No results.</div>';
  };
  let t;
  b.querySelector('.llg-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; run(); }, 300); });
  b.querySelector('.llg-src-sel').addEventListener('change', e => { st.source = e.target.value; run(); });
  b.querySelector('.llg-results').addEventListener('click', e => {
    const r = e.target.closest('[data-d]');
    if (r) { st.day = r.dataset.d; st.tab = 'day'; render(); }
  });
  run();
}

async function renderTrends() {
  const rows = await get('series', { bucket: 'year' });
  const years = [...new Set(rows.map(r => r.bucket))].sort();
  const top = st.meta.sources.slice(0, 8).map(s => s.source);
  const key = s => (top.includes(s) ? s : 'other');
  const series = [...top, 'other'];
  const val = {};
  rows.forEach(r => { const k = `${r.bucket}|${key(r.source)}`; val[k] = (val[k] || 0) + r.count; });
  const tot = years.map(y => series.reduce((a, s) => a + (val[`${y}|${s}`] || 0), 0));
  const W = Math.max(els.body.clientWidth - 40, 400), H = 260, pad = 30, bw = (W - pad) / years.length * 0.7;
  const max = Math.max(...tot, 1);
  let x = pad, svg = '';
  years.forEach((y, i) => {
    let yy = H - 20;
    series.forEach((s, j) => {
      const v = val[`${y}|${s}`] || 0; if (!v) return;
      const h = v / max * (H - 40); yy -= h;
      svg += `<rect class="aiu-bar" x="${x}" y="${yy}" width="${bw}" height="${h}" fill="${PALETTE[j % PALETTE.length]}"><title>${y} · ${esc(s === 'other' ? 'Other' : label(s))}: ${nf(v)}</title></rect>`;
    });
    svg += `<text class="aiu-axis" x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${y}</text>`;
    x += (W - pad) / years.length;
  });
  const legend = series.map((s, j) => `<span><span class="aiu-sw" style="background:${PALETTE[j % PALETTE.length]}"></span>${esc(s === 'other' ? 'Other' : label(s))}</span>`).join('');
  els.body.innerHTML = `<div class="aiu-card"><div class="aiu-card-h">Events per year</div>
    <svg class="aiu-svg" width="${W}" height="${H}">${svg}</svg><div class="aiu-legend">${legend}</div></div>
    <div class="aiu-card"><div class="aiu-card-h">Sources</div>${st.meta.sources.map(s => `<div class="llg-row">${icon(s.source)} ${esc(label(s.source))}<span class="llg-src">${nf(s.count)}</span></div>`).join('')}</div>`;
}

async function openPanel() {
  const panel = buildPanel();
  panel.classList.remove('hidden');
  try { panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important'); } catch (_) {}
  try {
    st.meta = await get('meta');
  } catch (e) {
    els.body.innerHTML = `<div class="aiu-card aiu-empty">No life log yet — run nas-lifelog-export on the NAS and lifelog-sync on the PC. (${esc(e.message)})</div>`;
    return;
  }
  if (!st.day) st.day = st.meta.range.to;
  els.status.textContent = `${st.meta.range.from} → ${st.meta.range.to}` + (st.meta.built_at ? ` · built ${new Date(st.meta.built_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : '');
  render();
}

function mountSidebar() {
  const list = document.getElementById('lifelog-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  const item = document.createElement('div');
  item.className = 'list-item aiu-side-item';
  item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="grow">Searches, YouTube, Fit, notes</span>`;
  item.addEventListener('click', openPanel);
  list.append(item);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebar);
else mountSidebar();

export { openPanel };
