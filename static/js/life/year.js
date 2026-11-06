// static/js/life/year.js — ano: mapa de calor por dia (semanas em colunas, linhas seg..dom), legenda com faixas fixas
// e barras por mês. Clique no dia → dia; no mês → mês. Substitui o antigo "Trends".
import { escapeHtml as esc, monthName } from './format.js';
import { fmtMetric, legend, levelOf, metricBar, wireMetric } from './metrics.js';

export async function renderYear(body, ctx) {
  const { st } = ctx;
  const y = st.day.slice(0, 4);
  const data = await ctx.api('year', { y }, { key: 'view' });
  if (!ctx.isCurrent()) return;
  const metric = data.metrics.find(m => m.key === st.metric) || data.metrics[0];
  const days = Object.keys(data.days).sort();
  const lead = data.first_weekday - 1;
  const today = st.meta?.today;
  const pads = Array.from({ length: lead }, () => '<span class="life-hcell is-pad" aria-hidden="true"></span>');
  const cells = days.map(d => {
    const v = data.days[d][metric.key];
    const label = `${d} · ${fmtMetric(metric.key, v)}`;
    return `<button type="button" class="life-hcell lv-${levelOf(v, metric.bands)}${d === today ? ' is-today' : ''}" data-go-day="${d}" title="${esc(label)}" aria-label="${esc(label)}"></button>`;
  });
  const monthLabels = data.months.map(m => {
    const col = Math.floor((lead + days.indexOf(`${m.month}-01`)) / 7) + 1;
    return `<button type="button" class="life-hmonth" style="grid-column:${col}" data-go-month="${m.month}">${esc(m.label)}</button>`;
  }).join('');
  const max = Math.max(1, ...data.months.map(m => m[metric.key] || 0));
  const bars = data.months.map(m => {
    const v = m[metric.key];
    const h = v ? Math.max(4, Math.round((v / max) * 100)) : 0;
    return `<button type="button" class="life-bar" data-go-month="${m.month}" title="${esc(monthName(Number(m.month.slice(5))))}: ${esc(fmtMetric(metric.key, v))}">
      <span class="life-bar-v${v == null ? ' is-none' : ''}" style="height:${h}%"></span><span class="life-bar-l">${esc(m.label)}</span></button>`;
  }).join('');
  body.innerHTML = `<article class="life-year">
    <header class="life-viewhead"><h2>${esc(y)}</h2>${metricBar(data.metrics, metric.key)}</header>
    <div class="life-heat" aria-label="${esc(metric.label)} per day">
      <div class="life-hmonths">${monthLabels}</div>
      <div class="life-hgrid">${pads.join('')}${cells.join('')}</div>
    </div>
    ${legend(metric)}
    <section class="life-card"><h3>${esc(metric.label)} per month</h3><div class="life-bars">${bars}</div></section>
  </article>`;
  const root = body.querySelector('.life-year');
  wireMetric(root, ctx);
  root.addEventListener('click', e => {
    const d = e.target.closest('[data-go-day]');
    if (d) { ctx.go({ view: 'day', day: d.dataset.goDay }); return; }
    const m = e.target.closest('[data-go-month]');
    if (m) ctx.go({ view: 'month', day: `${m.dataset.goMonth}-01` });
  });
}
