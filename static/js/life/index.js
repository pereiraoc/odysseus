// static/js/life/index.js — painel "Life" (fork-local, LOCAL_CHANGES.md §11).
// Spec: docs/superpowers/specs/2026-11-06-life-timeline-design.md. Moldura (migalha de zoom, ‹ Today ›, busca),
// rota por hash (#life/AAAA-MM-DD | AAAA-MM | AAAA | search?q=), teclado e itens da barra lateral.
// Cada visão desenha em ./day.js, ./month.js, ./year.js e ./search.js; o servidor monta os dados (src/life).
import * as Modals from '../modalManager.js';
import { makeWindowDraggable } from '../windowDrag.js';
import { nextToolWindowZ } from '../toolWindowZOrder.js';
import { api, isAbort } from './api.js';
import { buildHash, escapeHtml, fmtDate, monthName, parseHash, shiftDay, shiftMonth } from './format.js';
import { icon } from './icons.js';
import { emptyState, skeleton } from './parts.js';
import { renderDay } from './day.js';
import { renderMonth } from './month.js';
import { renderYear } from './year.js';
import { renderSearch } from './search.js';

const PANEL_ID = 'life-panel';
const LS_KEY = 'odysseus.life.v1';
const VIEWS = { day: renderDay, month: renderMonth, year: renderYear, search: renderSearch };
const st = { view: 'day', day: '', q: '', metric: 'digital', filter: 'all', kinds: '', from: '', to: '', focus: '', meta: null };
let els = null;
let seq = 0;
let lastHash = '';
let returnHash = null;  // hash do chat aberto antes do Life mexer na URL; volta ao fechar

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (['day', 'month', 'year'].includes(s.view)) st.view = s.view;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s.day || '')) st.day = s.day;
    if (typeof s.metric === 'string') st.metric = s.metric;
  } catch (_) { /* armazenamento indisponível: começa do padrão */ }
}
function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ view: st.view, day: st.day, metric: st.metric })); } catch (_) {}
}
const isOpen = () => !!els && !els.panel.classList.contains('hidden');
const todayIso = () => st.meta?.today || st.day || new Date().toISOString().slice(0, 10);

function raise() {
  try {
    els.panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: els.panel, current: getComputedStyle(els.panel).zIndex, floor: 300 })), 'important');
  } catch (_) {}
}

function buildPanel() {
  if (els) return;
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'modal hidden';
  panel.innerHTML = `
    <div class="modal-content life-content" role="dialog" aria-label="Life">
      <div class="modal-header life-header">
        <span class="life-title">${icon('life', 16)}Life</span>
        <nav class="life-crumbs" aria-label="Zoom level"></nav>
        <div class="life-nav">
          <button type="button" class="life-icon-btn" data-act="prev" aria-label="Previous" title="Previous (←)">${icon('chevron-left')}</button>
          <button type="button" class="life-btn" data-act="today" title="Today (t)">Today</button>
          <button type="button" class="life-icon-btn" data-act="next" aria-label="Next" title="Next (→)">${icon('chevron-right')}</button>
        </div>
        <form class="life-search" role="search">
          ${icon('search', 14)}
          <input type="search" name="q" placeholder="Search everything" aria-label="Search everything" autocomplete="off">
          <kbd aria-hidden="true">/</kbd>
        </form>
        <button type="button" class="close-btn" aria-label="Close">✖</button>
      </div>
      <div class="life-body" tabindex="-1"></div>
    </div>`;
  document.body.appendChild(panel);
  els = {
    panel, content: panel.querySelector('.life-content'), header: panel.querySelector('.life-header'),
    crumbs: panel.querySelector('.life-crumbs'), nav: panel.querySelector('.life-nav'),
    body: panel.querySelector('.life-body'), form: panel.querySelector('.life-search'),
    input: panel.querySelector('.life-search input'),
  };
  panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', raise, true);
  els.nav.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'today') goToday();
    else step(b.dataset.act === 'next' ? 1 : -1);
  });
  els.crumbs.addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) go({ view: b.dataset.view });
  });
  els.form.addEventListener('submit', e => {
    e.preventDefault();
    const q = els.input.value.trim();
    if (q.length >= 2) go({ view: 'search', q });
  });
  els.input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); els.input.blur(); els.body.focus(); } });
  panel.addEventListener('keydown', onKey);
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, { label: 'Life', restoreFn: () => {}, closeFn: onClose });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
}

function onClose() {
  els?.panel.classList.add('hidden');
  if (parseHash(location.hash)) {
    try { history.replaceState(null, '', location.pathname + location.search + (returnHash || '')); } catch (_) {}
  }
  returnHash = null;
  lastHash = '';
}

function crumbs() {
  const y = st.day.slice(0, 4);
  const m = Number(st.day.slice(5, 7));
  const d = Number(st.day.slice(8, 10));
  const b = (view, label) => `<button type="button" data-view="${view}"${st.view === view ? ' class="is-current" aria-current="page"' : ''}>${label}</button>`;
  const sep = '<span class="life-crumb-sep" aria-hidden="true">›</span>';
  els.crumbs.innerHTML = st.view === 'search'
    ? `${b('day', `${icon('chevron-left', 13)}${escapeHtml(fmtDate(st.day))}`)}${sep}<span class="is-current">Search</span>`
    : [b('year', y), st.view !== 'year' ? b('month', monthName(m)) : '', st.view === 'day' ? b('day', String(d)) : '']
      .filter(Boolean).join(sep);
}

function go(patch = {}, { replace = false } = {}) {
  Object.assign(st, patch);
  if (!st.day) st.day = todayIso();
  const h = buildHash(st);
  if (!parseHash(location.hash)) returnHash = location.hash;
  if (location.hash !== h) {
    try { history[replace ? 'replaceState' : 'pushState'](null, '', h); } catch (_) { location.hash = h; }
  }
  persist();
  render();
}

function step(n) {
  if (st.view === 'day') go({ day: shiftDay(st.day, n) });
  else if (st.view === 'month') go({ day: `${shiftMonth(st.day.slice(0, 7), n)}-01` });
  else if (st.view === 'year') go({ day: `${Number(st.day.slice(0, 4)) + n}-01-01` });
}
function zoomOut() {
  if (st.view === 'day') go({ view: 'month' });
  else if (st.view === 'month') go({ view: 'year' });
}
function goToday() { go({ view: st.view === 'search' ? 'day' : st.view, day: todayIso() }); }

function onKey(e) {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (e.key === '/' && !typing) { e.preventDefault(); els.input.focus(); els.input.select(); return; }
  if (typing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key === 'ArrowLeft' && st.view !== 'search') { e.preventDefault(); step(-1); }
  else if (e.key === 'ArrowRight' && st.view !== 'search') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowUp' && els.body.scrollTop === 0 && (st.view === 'day' || st.view === 'month')) { e.preventDefault(); zoomOut(); }
  else if (e.key === 't') goToday();
}

async function render() {
  const mine = ++seq;
  lastHash = buildHash(st);
  crumbs();
  els.panel.dataset.view = st.view;
  els.nav.hidden = st.view === 'search';
  els.input.value = st.view === 'search' ? st.q : '';
  els.body.setAttribute('aria-busy', 'true');
  els.body.innerHTML = skeleton(st.view);
  els.body.scrollTop = 0;
  const ctx = { st, go, api, isCurrent: () => mine === seq };
  try {
    await VIEWS[st.view](els.body, ctx);
  } catch (e) {
    if (isAbort(e) || mine !== seq) return;
    els.body.innerHTML = emptyState('other', 'Could not load this view', escapeHtml(e.message));
  } finally {
    if (mine === seq) els.body.removeAttribute('aria-busy');
  }
}

async function openPanel({ view, day, today = false, replace = false } = {}) {
  buildPanel();
  els.panel.classList.remove('hidden');
  raise();
  if (!st.meta) {
    try {
      st.meta = await api('meta');
    } catch (e) {
      if (isAbort(e)) return;
      els.body.innerHTML = emptyState('life', 'Life is not available', escapeHtml(e.message));
      return;
    }
  }
  if (view) st.view = view;
  if (day) st.day = day;
  if (today || !st.day) st.day = st.meta.today;
  go({}, { replace });
  els.body.focus({ preventScroll: true });
}

function fromHash() {
  const h = parseHash(location.hash);
  if (!h) return;
  if (location.hash === lastHash && isOpen()) return;
  if (h.view === 'day') Object.assign(st, { view: 'day', day: h.day });
  else if (h.view === 'month') Object.assign(st, { view: 'month', day: st.day.startsWith(h.month) ? st.day : `${h.month}-01` });
  else if (h.view === 'year') Object.assign(st, { view: 'year', day: st.day.startsWith(h.year) ? st.day : `${h.year}-01-01` });
  else if (h.view === 'search') Object.assign(st, { view: 'search', q: h.q });
  if (isOpen() && st.meta) { persist(); render(); } else openPanel({ replace: true });
}

function mountSidebar() {
  const list = document.getElementById('lifelog-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  const add = (name, text, fn) => {
    const item = document.createElement('div');
    item.className = 'list-item life-side-item';
    item.innerHTML = `${icon(name, 14)}<span class="grow">${text}</span>`;
    item.addEventListener('click', fn);
    list.append(item);
  };
  add('calendar', 'Today', () => openPanel({ view: 'day', today: true }));
  add('search', 'Search everything', async () => { await openPanel({ view: 'search' }); els?.input.focus(); });
}

restore();
window.addEventListener('hashchange', fromHash);
window.addEventListener('popstate', fromHash);
function boot() {
  mountSidebar();
  if (parseHash(location.hash)) fromHash();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { openPanel };
