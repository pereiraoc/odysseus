// static/js/life/day.js — visão do dia do Life: cabeçalho com resumo, chips de filtro, faixa All day, espinha de
// blocos (períodos na fase 1) com grupos "Digital" recolhidos, e coluna com números, On this day e fontes.
// O servidor monta tudo (src/life/assemble.py); aqui só se desenha e se liga o filtro/expansões.
import { icon } from './icons.js';
import { escapeHtml as esc, fmtDate, fmtDateLong, fmtMoney, yearsAgo } from './format.js';
import { KIND_LABEL, KIND_ORDER, emptyState, openLink, sourcesFooter } from './parts.js';

const PERIOD_ICON = { night: 'night', morning: 'morning', afternoon: 'afternoon', evening: 'evening' };
const CAP = 5;

export async function renderDay(body, ctx) {
  const { st } = ctx;
  const data = await ctx.api('day', { d: st.day }, { key: 'view' });
  if (!ctx.isCurrent()) return;
  if (st.filter !== 'all' && !data.counts_by_kind[st.filter]) st.filter = 'all';
  const empty = !data.blocks.length && !data.all_day.length;
  body.innerHTML = `
    <article class="life-day">
      <header class="life-dayhead">
        <h2>${esc(fmtDateLong(data.day))}</h2>
        ${data.summary.parts.length ? `<p class="life-summary">${data.summary.parts.map(p => `<span class="life-sumpart k-${esc(p.kind)}">${icon(p.kind, 13)}${esc(p.text)}</span>`).join('')}</p>` : ''}
      </header>
      <div class="life-cols">
        <section class="life-main" aria-label="Timeline">
          ${empty ? emptyDay(data) : `${chips(data.counts_by_kind, st.filter)}${allDay(data.all_day)}<ol class="life-spine">${data.blocks.map(block).join('')}</ol>`}
        </section>
        <aside class="life-side" aria-label="Day details">
          ${numbers(data.stats)}
          <section class="life-card life-otd" aria-label="On this day"><h3>${icon('calendar', 14)}On this day</h3><div class="life-otd-body"><div class="life-skel" style="width:70%"></div><div class="life-skel" style="width:50%"></div></div></section>
          ${sourcesFooter(data.sources)}
        </aside>
      </div>
    </article>`;
  const root = body.querySelector('.life-day');
  root.addEventListener('click', e => {
    const chip = e.target.closest('.life-chip[data-filter]');
    if (chip) { st.filter = chip.dataset.filter; applyFilter(root, st.filter); return; }
    const more = e.target.closest('[data-more]');
    if (more) { more.closest('.life-dsrc').classList.add('is-expanded'); more.remove(); return; }
    const goDay = e.target.closest('[data-go-day]');
    if (goDay) ctx.go({ view: 'day', day: goDay.dataset.goDay });
  });
  applyFilter(root, st.filter);
  loadOnThisDay(root, ctx, data.day);
}

function chips(counts, filter) {
  const kinds = KIND_ORDER.filter(k => counts[k]);
  if (kinds.length < 2) return '';
  const total = kinds.reduce((a, k) => a + counts[k], 0);
  const btn = (k, label, n) => `<button type="button" class="life-chip" data-filter="${k}" aria-pressed="${filter === k}">${k === 'all' ? '' : icon(k, 13)}${esc(label)}<span class="life-chip-n">${n}</span></button>`;
  return `<div class="life-chips" role="toolbar" aria-label="Filter by kind">${btn('all', 'All', total)}${kinds.map(k => btn(k, KIND_LABEL[k], counts[k])).join('')}</div>`;
}

function allDay(items) {
  if (!items.length) return '';
  return `<section class="life-allday" aria-label="All day"><h3 class="life-eyebrow">All day</h3><ul class="life-entries">${items.map(entry).join('')}</ul></section>`;
}

function block(b) {
  return `<li class="life-block" data-key="${esc(b.key || b.kind)}">
    <div class="life-block-h">${icon(PERIOD_ICON[b.key] || 'place', 15)}<span class="life-block-t">${esc(b.label)}</span><span class="life-block-r">${esc(b.start)}–${esc(b.end)}</span></div>
    <ul class="life-entries">${b.entries.map(e => (e.kind === 'digital_group' ? digital(e) : entry(e))).join('')}</ul>
    <p class="life-block-none">Nothing of this kind here.</p>
  </li>`;
}

function timeCell(start, end) {
  if (!start) return '<time></time>';
  return `<time>${esc(start)}${end && end !== start ? `<span class="life-time-end">–${esc(end)}</span>` : ''}</time>`;
}

function entry(it) {
  const m = it.meta || {};
  let amount = '';
  if (it.kind === 'money') {
    const cls = `life-amount${m.amount_cents > 0 ? ' is-in' : ''}${m.neutral ? ' is-neutral' : ''}`;
    const tip = m.neutral ? ' title="Between your own accounts — not counted as spending or income"' : '';
    amount = `<span class="${cls}"${tip}>${esc(fmtMoney(m.amount_cents, m.currency, { decimals: 2 }))}</span>`;
  }
  return `<li class="life-entry k-${esc(it.kind)}" data-kind="${esc(it.kind)}">
    ${timeCell(it.time, it.end_time)}<span class="life-ic">${icon(it.kind, 15)}</span>
    <div class="life-entry-b"><div class="life-entry-t">${esc(it.title)}</div>${it.subtitle ? `<div class="life-entry-s">${esc(it.subtitle)}</div>` : ''}</div>
    ${amount}${openLink(it.open_url)}
  </li>`;
}

function digital(g) {
  const sources = g.sources.map(s => {
    const rows = s.items.map((r, i) => `<li class="life-drow${i >= CAP ? ' is-more' : ''}${r.unavailable ? ' is-unavailable' : ''}">
        <time>${esc(r.times[0])}</time>
        <div class="life-entry-b"><div class="life-entry-t">${esc(r.title)}${r.count > 1 ? `<span class="life-times" title="${esc(r.times.join(', '))}">×${r.count}</span>` : ''}</div>${r.subtitle ? `<div class="life-entry-s">${esc(r.subtitle)}</div>` : ''}</div>
        ${openLink(r.open_url)}</li>`).join('');
    const more = s.items.length > CAP ? `<button type="button" class="life-more" data-more>Show ${s.items.length - CAP} more</button>` : '';
    const views = s.views !== s.count ? ` · ${s.views} views` : '';
    return `<section class="life-dsrc"><h4>${icon(s.group, 13)}${esc(s.label)}<span>${s.count}${views}</span></h4><ul>${rows}</ul>${more}</section>`;
  }).join('');
  return `<li class="life-entry life-entry-group k-digital" data-kind="digital">
    <details class="life-dg">
      <summary>${timeCell(g.time, g.end_time)}<span class="life-ic">${icon('digital', 15)}</span>
        <div class="life-entry-b"><div class="life-entry-t"><b>Digital</b> · ${esc(g.summary)}</div></div>${icon('chevron-down', 14)}</summary>
      <div class="life-dg-body">${sources}</div>
    </details></li>`;
}

function numbers(stats) {
  if (!stats.length) return '';
  return `<section class="life-card" aria-label="Day in numbers"><h3>${icon('health', 14)}Day in numbers</h3>
    <dl class="life-kpis">${stats.map(s => `<div class="life-kpi"><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl></section>`;
}

function emptyDay(data) {
  const n = data.nearest || {};
  const btn = (d, before) => (d
    ? `<button type="button" class="life-btn" data-go-day="${esc(d)}">${before ? '← ' : ''}${esc(fmtDate(d))}${before ? '' : ' →'}</button>`
    : '');
  return emptyState('calendar', 'Nothing recorded on this day', 'None of the connected sources has anything for this date.',
    btn(n.prev, true) + btn(n.next, false));
}

function applyFilter(root, filter) {
  root.querySelectorAll('.life-chip[data-filter]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
  root.querySelectorAll('.life-chip[data-filter]').forEach(c => c.classList.toggle('is-on', c.dataset.filter === filter));
  root.querySelectorAll('.life-entry').forEach(en => { en.hidden = filter !== 'all' && en.dataset.kind !== filter; });
  root.querySelectorAll('.life-block, .life-allday').forEach(b => {
    b.classList.toggle('is-filtered-empty', filter !== 'all' && !b.querySelector(`.life-entry[data-kind="${filter}"]`));
  });
}

async function loadOnThisDay(root, ctx, day) {
  const box = root.querySelector('.life-otd-body');
  try {
    const rows = await ctx.api('onthisday', { d: day }, { key: 'otd' });
    if (!ctx.isCurrent()) return;
    box.innerHTML = rows.length
      ? `<ul class="life-otd-list">${rows.map(r => `<li><button type="button" data-go-day="${esc(r.day)}">
          <span class="life-otd-when">${esc(yearsAgo(r.years_ago))}${r.offset ? ` <em>(${r.offset > 0 ? '+' : '−'}${Math.abs(r.offset)} day${Math.abs(r.offset) === 1 ? '' : 's'})</em>` : ''}</span>
          <span class="life-otd-date">${esc(fmtDate(r.day))}</span><span class="life-otd-sum">${esc(r.summary)}</span></button></li>`).join('')}</ul>`
      : '<p class="life-muted">Nothing from this date in earlier years.</p>';
  } catch (e) {
    if (ctx.isCurrent()) box.innerHTML = '<p class="life-muted">Could not load earlier years.</p>';
  }
}
