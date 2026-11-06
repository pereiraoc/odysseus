// static/js/life/search.js — busca em tudo: resultados agrupados por dia (cabeçalho abre o dia), cada acerto com o
// trecho destacado e vizinhos de contexto; facetas por tipo e período. A busca é a ferramenta principal do Life.
import { icon } from './icons.js';
import { escapeHtml as esc, fmtDate, fmtMoney, highlight } from './format.js';
import { KIND_LABEL, emptyState, openLink } from './parts.js';

export async function renderSearch(body, ctx) {
  const { st } = ctx;
  if (!st.q || st.q.trim().length < 2) {
    body.innerHTML = emptyState('search', 'Search everything',
      'Searches, videos, pages, notes, purchases and AI sessions — results come grouped by day. Press <kbd>/</kbd> anywhere in Life to search.');
    return;
  }
  const data = await ctx.api('search', { q: st.q, kinds: st.kinds, from: st.from, to: st.to }, { key: 'view' });
  if (!ctx.isCurrent()) return;
  const facet = (k, label, n) => `<button type="button" class="life-chip${st.kinds === k ? ' is-on' : ''}" data-kind="${k}" aria-pressed="${st.kinds === k}">${k ? icon(k, 13) : ''}${esc(label)}${n != null ? `<span class="life-chip-n">${n}</span>` : ''}</button>`;
  const all = Object.values(data.kinds).reduce((a, n) => a + n, 0);
  body.innerHTML = `<article class="life-search-view">
    <header class="life-viewhead"><h2>${data.total}${data.truncated ? '+' : ''} result${data.total === 1 ? '' : 's'} for “${esc(st.q)}”</h2>
      <div class="life-range"><label>From <input type="date" name="from" value="${esc(st.from)}"></label><label>To <input type="date" name="to" value="${esc(st.to)}"></label></div></header>
    <div class="life-chips" role="toolbar" aria-label="Filter by kind">${facet('', 'All', all)}${Object.entries(data.kinds).map(([k, n]) => facet(k, KIND_LABEL[k] || k, n)).join('')}</div>
    ${data.days.length ? `<ol class="life-results">${data.days.map(d => dayGroup(d, st.q)).join('')}</ol>` : emptyState('search', 'No results', 'Try fewer words, another spelling, or clear the filters.')}
  </article>`;
  const root = body.querySelector('.life-search-view');
  root.addEventListener('click', e => {
    const k = e.target.closest('[data-kind]');
    if (k) { st.kinds = k.dataset.kind; ctx.go({}, { replace: true }); return; }
    const d = e.target.closest('[data-go-day]');
    if (d) ctx.go({ view: 'day', day: d.dataset.goDay });
  });
  root.querySelectorAll('.life-range input').forEach(inp => inp.addEventListener('change', () => {
    st[inp.name] = inp.value;
    ctx.go({}, { replace: true });
  }));
}

function dayGroup(d, q) {
  return `<li class="life-rday"><h3><button type="button" data-go-day="${esc(d.day)}">${esc(fmtDate(d.day))}<span>Open day ›</span></button></h3>
    <ul class="life-entries">${d.items.map(it => hit(it, q)).join('')}</ul></li>`;
}

function hit(it, q) {
  const m = it.meta || {};
  const ctxLines = (m.context || []).map(c => `<div class="life-ctx">${c.rel === 'before' ? '↑' : '↓'} ${esc(c.time || '')} · ${esc(c.title)}</div>`).join('');
  const amount = it.kind === 'money' ? `<span class="life-amount">${esc(fmtMoney(m.amount_cents, m.currency, { decimals: 2 }))}</span>` : '';
  return `<li class="life-entry k-${esc(it.kind)}"><time>${esc(it.time || '')}</time><span class="life-ic">${icon(m.group || it.kind, 15)}</span>
    <div class="life-entry-b"><div class="life-entry-t">${highlight(it.title, q)}</div>${it.subtitle ? `<div class="life-entry-s">${highlight(it.subtitle, q)}</div>` : ''}${ctxLines}</div>
    ${amount}${openLink(it.open_url)}</li>`;
}
