// static/js/life/index.js — hub "Life" (fork-local, LOCAL_CHANGES.md §11).
// Spec: docs/superpowers/specs/2026-11-07-life-hub-design.md. Uma janela com trilho de apps (./apps.js), rota por
// hash #life/<app>/… (./router.js), busca global (abre o Diary), teclado, barra lateral do Odysseus com um item por
// app e, no celular, a lista de apps como tela raiz. Fechar devolve o hash da conversa que estava aberta.
import * as Modals from '../modalManager.js';
import { makeWindowDraggable } from '../windowDrag.js';
import { nextToolWindowZ } from '../toolWindowZOrder.js';
import { escapeHtml } from './format.js';
import { icon } from './icons.js';
import { emptyState } from './parts.js';
import { APPS, appById } from './apps.js';
import { lifeHref, parseLifeHash } from './router.js';

const PANEL_ID = 'life-panel';
const LS_KEY = 'odysseus.life.hub.v1';
const NARROW = '(max-width: 640px)';
const memory = { app: 'diary', routes: {} };
let els = null;
let current = null;
let queue = Promise.resolve();
let lastHash = '';
let returnHash = null;

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (appById(s.app)) memory.app = s.app;
    if (s.routes && typeof s.routes === 'object') {
      for (const [k, v] of Object.entries(s.routes)) if (appById(k) && parseLifeHash(v)?.app === k) memory.routes[k] = v;
    }
  } catch (_) { /* armazenamento indisponível */ }
}
function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(memory)); } catch (_) {}
}
const isOpen = () => !!els && !els.panel.classList.contains('hidden');
function focusHost() {
  if (!els || els.panel.contains(document.activeElement)) return;
  try { els.host.querySelector('.life-app')?.focus({ preventScroll: true }); } catch (_) {}
}
const narrow = () => !!window.matchMedia?.(NARROW).matches;

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
        <button type="button" class="life-icon-btn life-back" aria-label="All apps" title="All apps">${icon('chevron-left')}</button>
        <span class="life-title">${icon('life', 16)}<span>Life</span><span class="life-title-sep" aria-hidden="true">·</span><span class="life-title-app"></span></span>
        <div class="life-toolbar"></div>
        <form class="life-search" role="search">
          ${icon('search', 14)}
          <input type="search" name="q" placeholder="Search everything" aria-label="Search everything" autocomplete="off">
          <kbd aria-hidden="true">/</kbd>
        </form>
        <button type="button" class="close-btn" aria-label="Close">✖</button>
      </div>
      <div class="life-frame">
        <nav class="life-rail" aria-label="Life apps">
          ${APPS.map(a => `<a class="life-rail-item" href="${lifeHref(a.id)}" data-app="${a.id}">${icon(a.icon, 18)}<span>${escapeHtml(a.label)}</span></a>`).join('')}
        </nav>
        <div class="life-host"></div>
      </div>
    </div>`;
  document.body.appendChild(panel);
  els = {
    panel, content: panel.querySelector('.life-content'), header: panel.querySelector('.life-header'),
    title: panel.querySelector('.life-title-app'), toolbar: panel.querySelector('.life-toolbar'),
    rail: panel.querySelector('.life-rail'), host: panel.querySelector('.life-host'),
    form: panel.querySelector('.life-search'), input: panel.querySelector('.life-search input'),
  };
  panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
  panel.querySelector('.life-back').addEventListener('click', () => go('#life'));
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', raise, true);
  els.rail.addEventListener('click', e => {
    const a = e.target.closest('[data-app]');
    if (!a) return;
    e.preventDefault();
    openApp(a.dataset.app);
  });
  els.form.addEventListener('submit', e => {
    e.preventDefault();
    const q = els.input.value.trim();
    if (q.length >= 2) go(lifeHref('diary', ['search'], { q }));
  });
  els.input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); els.input.blur(); els.host.querySelector('.life-app')?.focus({ preventScroll: true }); } });
  panel.addEventListener('keydown', onKey);
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, { label: 'Life', restoreFn: () => {}, closeFn: onClose });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
}

function onClose() {
  els?.panel.classList.add('hidden');
  if (parseLifeHash(location.hash)) {
    try { history.replaceState(null, '', location.pathname + location.search + (returnHash || '')); } catch (_) {}
  }
  returnHash = null;
  lastHash = '';
}

function showIndex(on) {
  els.panel.classList.toggle('is-index', !!on);
  if (on) markRail(null);
}

function markRail(id) {
  els.rail.querySelectorAll('[data-app]').forEach(a => {
    const on = a.dataset.app === id;
    a.classList.toggle('is-current', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function hubFor(id) {
  return {
    lifeHref,
    navigate: (path = [], params = {}, opts = {}) => go(lifeHref(id, path, params), opts),
    open: (href, opts = {}) => go(href, opts),
    setSearch(q) { els.input.value = q || ''; },
    setToolbar(html) { els.toolbar.innerHTML = html; return els.toolbar; },
    isCurrent: () => current?.id === id,
  };
}

function go(href, { replace = false } = {}) {
  if (!parseLifeHash(location.hash)) returnHash = location.hash;
  if (location.hash !== href) {
    try { history[replace ? 'replaceState' : 'pushState'](null, '', href); } catch (_) { location.hash = href; }
  }
  lastHash = href;
  return apply(parseLifeHash(href));
}

function apply(r) {
  queue = queue.then(() => doApply(r)).catch(e => console.error('life:', e));
  return queue;
}

async function doApply(route) {
  let r = route || { app: null, path: [], params: {} };
  if (!r.app) {
    if (narrow()) { showIndex(true); return; }
    const href = memory.routes[memory.app] || lifeHref(memory.app);
    try { history.replaceState(null, '', href); } catch (_) {}
    lastHash = href;
    r = parseLifeHash(href);
  }
  const app = appById(r.app) || APPS[0];
  showIndex(false);
  if (!current || current.id !== app.id) {
    try { current?.inst?.unmount?.(); } catch (_) {}
    els.host.innerHTML = '';
    els.toolbar.innerHTML = '';
    const host = document.createElement('div');
    host.className = `life-app life-app-${app.id}`;
    host.tabIndex = -1;
    els.input.value = '';
    els.host.append(host);
    current = { id: app.id, inst: null };
    els.title.textContent = app.label;
    els.panel.dataset.app = app.id;
    markRail(app.id);
    try {
      current.inst = await app.mount(host, hubFor(app.id));
    } catch (e) {
      host.innerHTML = emptyState('other', `Could not open ${app.label}`, escapeHtml(e.message));
      current.inst = { route() {}, unmount() {} };
    }
  }
  memory.app = app.id;
  memory.routes[app.id] = parseLifeHash(location.hash)?.app === app.id ? location.hash : lifeHref(app.id, r.path, r.params);
  persist();
  try { await current.inst.route(r.path, r.params); } catch (e) { console.error('life route:', e); }
  focusHost();
}

function onKey(e) {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    els.input.focus();
    els.input.select();
    return;
  }
  current?.inst?.onKey?.(e);
}

function openApp(id) {
  return go(memory.routes[id] || lifeHref(id));
}

function openPanel({ app = null } = {}) {
  buildPanel();
  els.panel.classList.remove('hidden');
  raise();
  if (app) return openApp(app);
  const r = parseLifeHash(location.hash);
  const done = r ? (lastHash = location.hash, apply(r)) : go(memory.routes[memory.app] || lifeHref(memory.app));
  focusHost();
  return done;
}

function fromHash() {
  const r = parseLifeHash(location.hash);
  if (!r) return;
  if (location.hash === lastHash && isOpen()) return;
  lastHash = location.hash;
  buildPanel();
  if (!isOpen()) { els.panel.classList.remove('hidden'); raise(); }
  apply(r);
}

function mountSidebar() {
  const list = document.getElementById('lifelog-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  for (const a of APPS) {
    const item = document.createElement('div');
    item.className = 'list-item life-side-item';
    item.dataset.app = a.id;
    item.innerHTML = `${icon(a.icon, 14)}<span class="grow">${escapeHtml(a.label)}</span>`;
    item.addEventListener('click', () => openPanel({ app: a.id }));
    list.append(item);
  }
}

restore();
window.addEventListener('hashchange', fromHash);
window.addEventListener('popstate', fromHash);
function boot() {
  mountSidebar();
  if (parseLifeHash(location.hash)) fromHash();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { openPanel };
