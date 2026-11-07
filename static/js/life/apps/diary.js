// static/js/life/apps/diary.js — app Diary do hub Life: dia, mês, ano e busca (visões em ../day.js, ../month.js,
// ../year.js, ../search.js, que recebem o mesmo ctx de antes: {st, go(patch, opts), api, isCurrent}).
import { api, isAbort } from '../api.js';
import { escapeHtml, fmtDate, monthName, shiftDay, shiftMonth } from '../format.js';
import { icon } from '../icons.js';
import { emptyState, skeleton } from '../parts.js';
import { renderDay } from '../day.js';
import { renderMonth } from '../month.js';
import { renderYear } from '../year.js';
import { renderSearch } from '../search.js';

const VIEWS = { day: renderDay, month: renderMonth, year: renderYear, search: renderSearch };
const LS_KEY = 'odysseus.life.v1';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

export async function mountDiary(host, hub) {
  const st = { view: 'day', day: '', q: '', metric: 'digital', filter: 'all', kinds: '', from: '', to: '', focus: '', meta: null };
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (DAY_RE.test(s.day || '')) st.day = s.day;
    if (typeof s.metric === 'string') st.metric = s.metric;
  } catch (_) { /* armazenamento indisponível */ }
  let seq = 0;
  host.classList.add('life-body');
  host.tabIndex = -1;
  const bar = hub.setToolbar(`
    <nav class="life-crumbs" aria-label="Zoom level"></nav>
    <div class="life-nav">
      <button type="button" class="life-icon-btn" data-act="prev" aria-label="Previous" title="Previous (←)">${icon('chevron-left')}</button>
      <button type="button" class="life-btn" data-act="today" title="Today (t)">Today</button>
      <button type="button" class="life-icon-btn" data-act="next" aria-label="Next" title="Next (→)">${icon('chevron-right')}</button>
    </div>`);
  const crumbsEl = bar.querySelector('.life-crumbs');
  const navEl = bar.querySelector('.life-nav');

  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ day: st.day, metric: st.metric })); } catch (_) {} };
  const todayIso = () => st.meta?.today || new Date().toISOString().slice(0, 10);
  const pathOf = () => (st.view === 'search' ? ['search'] : st.view === 'month' ? [st.day.slice(0, 7)]
    : st.view === 'year' ? [st.day.slice(0, 4)] : [st.day]);
  const paramsOf = () => (st.view === 'search' ? { q: st.q } : {});
  function go(patch = {}, opts = {}) {
    Object.assign(st, patch);
    if (!st.day) st.day = todayIso();
    hub.navigate(pathOf(), paramsOf(), opts);
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
  const goToday = () => go({ view: st.view === 'search' ? 'day' : st.view, day: todayIso() });

  function crumbs() {
    const y = st.day.slice(0, 4);
    const m = Number(st.day.slice(5, 7));
    const d = Number(st.day.slice(8, 10));
    const b = (view, label) => `<button type="button" data-view="${view}"${st.view === view ? ' class="is-current" aria-current="page"' : ''}>${label}</button>`;
    const sep = '<span class="life-crumb-sep" aria-hidden="true">›</span>';
    crumbsEl.innerHTML = st.view === 'search'
      ? `${b('day', `${icon('chevron-left', 13)}${escapeHtml(fmtDate(st.day))}`)}${sep}<span class="is-current">Search</span>`
      : [b('year', y), st.view !== 'year' ? b('month', monthName(m)) : '', st.view === 'day' ? b('day', String(d)) : '']
        .filter(Boolean).join(sep);
    navEl.hidden = st.view === 'search';
  }

  async function render() {
    const mine = ++seq;
    crumbs();
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = skeleton(st.view);
    host.scrollTop = 0;
    const ctx = { st, go, api, isCurrent: () => mine === seq && hub.isCurrent() };
    try {
      await VIEWS[st.view](host, ctx);
    } catch (e) {
      if (isAbort(e) || mine !== seq) return;
      host.innerHTML = emptyState('other', 'Could not load this view', escapeHtml(e.message));
    } finally {
      if (mine === seq) host.removeAttribute('aria-busy');
    }
  }

  navEl.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'today') goToday();
    else step(b.dataset.act === 'next' ? 1 : -1);
  });
  crumbsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) go({ view: b.dataset.view });
  });

  let metaErr = null;
  const showMetaErr = () => { host.innerHTML = emptyState('life', 'Diary is not available', escapeHtml(metaErr.message)); };
  try {
    st.meta = await api('meta', {}, { key: 'diary-meta', timeout: 15000 });  // servidor travado não segura a fila do hub
  } catch (e) {
    if (!isAbort(e)) { metaErr = e; showMetaErr(); }
  }

  return {
    route(path, params) {
      if (metaErr) { showMetaErr(); return undefined; }
      const p = path[0] || '';
      if (!p) {
        // sem dia na URL: escreve o dia (replace), só se a URL ainda for a que o hub está aplicando; se o usuário já
        // foi para outra, a rota nova vem na fila
        if (!st.day) st.day = todayIso();
        if (location.hash === hub.currentHash()) hub.navigate(pathOf(), paramsOf(), { replace: true });
        return undefined;
      }
      if (p === 'search') Object.assign(st, { view: 'search', q: params.q || '' });
      else if (DAY_RE.test(p)) Object.assign(st, { view: 'day', day: p });
      else if (MONTH_RE.test(p)) Object.assign(st, { view: 'month', day: st.day.startsWith(p) ? st.day : `${p}-01` });
      else if (YEAR_RE.test(p)) Object.assign(st, { view: 'year', day: st.day.startsWith(p) ? st.day : `${p}-01-01` });
      else Object.assign(st, { view: 'day', day: st.day || todayIso() });
      if (!st.day) st.day = todayIso();
      persist();
      hub.setSearch(st.view === 'search' ? st.q : '');
      render();
      return undefined;
    },
    onKey(e) {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft' && st.view !== 'search') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight' && st.view !== 'search') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp' && host.scrollTop === 0 && (st.view === 'day' || st.view === 'month')) { e.preventDefault(); zoomOut(); }
      else if (e.key === 't') goToday();
    },
    unmount() { seq += 1; },
  };
}
