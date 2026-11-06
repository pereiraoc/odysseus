// static/js/life/metrics.js — métricas do mês e do ano: nível pela faixa fixa, legenda e seletor "Color by".
import { compact, escapeHtml, fmtMoney } from './format.js';

export function levelOf(v, bands) {
  if (v == null) return 'none';
  let lvl = 0;
  bands.forEach((b, i) => { if (v >= b) lvl = i + 1; });
  return lvl;
}

export function fmtMetric(key, v, short = false) {
  if (v == null) return 'no data';
  if (key === 'spent') return fmtMoney(v, 'BRL', { decimals: 0 });
  if (short) return compact(v);
  return Number(v).toLocaleString('en-US');
}

export function metricBar(metrics, current) {
  return `<div class="life-seg" role="radiogroup" aria-label="Color by">${metrics.map(m => `<button type="button" role="radio" aria-checked="${m.key === current}" class="${m.key === current ? 'is-on' : ''}" data-metric="${m.key}">${escapeHtml(m.label)}</button>`).join('')}</div>`;
}

export function legend(metric) {
  const b = metric.bands;
  const f = x => fmtMetric(metric.key, x, true);
  const labels = b.map((x, i) => (i === 0 ? `< ${f(b[1])}` : i === b.length - 1 ? `${f(x)}+` : `${f(x)}–${f(b[i + 1])}`));
  return `<div class="life-legend" aria-label="Legend"><span class="life-lg lv-none"></span>No data<span class="life-lg lv-0"></span>None${labels.map((l, i) => `<span class="life-lg lv-${i + 1}"></span>${escapeHtml(l)}`).join('')}</div>`;
}

export function wireMetric(root, ctx) {
  root.querySelector('.life-seg')?.addEventListener('click', e => {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    ctx.st.metric = b.dataset.metric;
    ctx.go({}, { replace: true });
  });
}
