// static/js/life/month.js — calendário do mês: cada dia tingido pela métrica escolhida (faixas fixas; "sem dado"
// hachurado ≠ zero), com o valor e marcadores das outras fontes. Clique no dia → dia.
import { icon } from './icons.js';
import { escapeHtml as esc } from './format.js';
import { fmtMetric, legend, levelOf, metricBar, wireMetric } from './metrics.js';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MARK_ICON = { spent: 'money', work: 'work', notes: 'note', steps: 'health', digital: 'digital' };

export async function renderMonth(body, ctx) {
  const { st } = ctx;
  const data = await ctx.api('month', { m: st.day.slice(0, 7) }, { key: 'view' });
  if (!ctx.isCurrent()) return;
  const metric = data.metrics.find(m => m.key === st.metric) || data.metrics[0];
  const today = st.meta?.today;
  const pads = Array.from({ length: data.first_weekday - 1 }, () => '<div class="life-mcell is-pad" aria-hidden="true"></div>');
  const cells = data.days.map(d => {
    const v = d.values[metric.key];
    const marks = Object.keys(MARK_ICON).filter(k => k !== metric.key && d.values[k])
      .map(k => `<span class="life-mark k-${k}" title="${esc(fmtMetric(k, d.values[k]))}">${icon(MARK_ICON[k], 11)}</span>`).join('');
    const cls = `life-mcell lv-${levelOf(v, metric.bands)}${d.day === today ? ' is-today' : ''}${d.day === st.day ? ' is-selected' : ''}`;
    return `<button type="button" class="${cls}" data-go-day="${d.day}" aria-label="${esc(d.day)}: ${esc(fmtMetric(metric.key, v))}">
      <span class="life-mdate">${d.dom}</span><span class="life-mval">${v ? esc(fmtMetric(metric.key, v, true)) : ''}</span><span class="life-marks">${marks}</span></button>`;
  });
  body.innerHTML = `<article class="life-month">
    <header class="life-viewhead"><h2>${esc(data.label)}</h2>${metricBar(data.metrics, metric.key)}</header>
    <dl class="life-totals">${data.metrics.map(m => `<div class="life-kpi"><dt>${esc(m.label)}</dt><dd>${esc(fmtMetric(m.key, data.totals[m.key], true))}</dd></div>`).join('')}</dl>
    <div class="life-mgrid">${WEEK.map(w => `<div class="life-mhead">${w}</div>`).join('')}${pads.join('')}${cells.join('')}</div>
    ${legend(metric)}
  </article>`;
  const root = body.querySelector('.life-month');
  wireMetric(root, ctx);
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-go-day]');
    if (c) ctx.go({ view: 'day', day: c.dataset.goDay });
  });
}
