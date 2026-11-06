// static/js/life/parts.js — pedaços de UI compartilhados pelas visões do Life (estado vazio, esqueleto, fontes).
import { icon } from './icons.js';
import { escapeHtml } from './format.js';

export const KIND_LABEL = { place: 'Places', photo: 'Photos', event: 'Calendar', money: 'Money', work: 'Work',
  note: 'Notes', health: 'Health', home: 'Home', mail: 'Mail', digital: 'Digital' };
export const KIND_ORDER = ['place', 'photo', 'event', 'money', 'work', 'note', 'health', 'home', 'mail', 'digital'];

export function emptyState(iconName, title, bodyHtml = '', actionsHtml = '') {
  return `<div class="life-empty">${icon(iconName, 28)}<h3>${escapeHtml(title)}</h3>${bodyHtml ? `<p>${bodyHtml}</p>` : ''}${actionsHtml ? `<div class="life-empty-actions">${actionsHtml}</div>` : ''}</div>`;
}

export function skeleton(view) {
  if (view === 'month' || view === 'year') {
    return `<div class="life-skel-grid" aria-hidden="true">${'<div class="life-skel life-skel-cell"></div>'.repeat(35)}</div>`;
  }
  const line = w => `<div class="life-skel" style="width:${w}%"></div>`;
  return `<div class="life-skel-page" aria-hidden="true">${[40, 65, 90, 75, 85, 60, 80].map(line).join('')}</div>`;
}

export function openLink(url) {
  const u = String(url || '').trim();
  if (!/^(https?:|mailto:)/i.test(u)) return '';
  return `<a class="life-open" href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" title="Open original" aria-label="Open original">${icon('external', 14)}</a>`;
}

const when = iso => {
  try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; }
};

export function sourcesFooter(sources = []) {
  if (!sources.length) return '';
  const chip = s => {
    const span = s.from && s.to ? `${s.from.slice(0, 4)}–${s.to.slice(0, 4)}` : '';
    const note = s.state === 'ok'
      ? [span, s.built_at ? `updated ${when(s.built_at)}` : ''].filter(Boolean).join(' · ')
      : (s.state === 'missing' ? 'not available' : 'error');
    return `<span class="life-src is-${escapeHtml(s.state)}" title="${escapeHtml(s.detail || '')}">${escapeHtml(s.label)}${note ? ` · ${escapeHtml(note)}` : ''}</span>`;
  };
  return `<footer class="life-sources" aria-label="Sources">${sources.map(chip).join('')}</footer>`;
}
