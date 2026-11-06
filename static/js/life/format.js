// static/js/life/format.js — formatação pura e roteamento por hash do painel Life (fork-local, LOCAL_CHANGES §11).
// Sem DOM: testado por tests/life_format.test.mjs. Datas são strings ISO (AAAA-MM-DD) tratadas em UTC.
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const SYMBOLS = { BRL: 'R$', USD: 'US$', EUR: '€', GBP: '£' };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

export function parseIso(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
const iso = dt => dt.toISOString().slice(0, 10);

export function shiftDay(d, n) {
  const x = parseIso(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}
export function shiftMonth(m, n) {
  const [y, mm] = m.split('-').map(Number);
  const t = y * 12 + (mm - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function fmtDate(d) {
  const x = parseIso(d);
  return `${WD[x.getUTCDay()]}, ${x.getUTCDate()} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
export function fmtDateLong(d) {
  const x = parseIso(d);
  return `${WD_LONG[x.getUTCDay()]}, ${x.getUTCDate()} ${MON_LONG[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
export function fmtMonth(m) {
  const [y, mm] = m.split('-').map(Number);
  return `${MON_LONG[mm - 1]} ${y}`;
}
export const monthName = mm => MON_LONG[mm - 1];
export const yearsAgo = n => (n === 1 ? '1 year ago' : `${n} years ago`);

export function fmtMoney(cents, cur = 'BRL', { decimals } = {}) {
  const v = Math.abs(cents) / 100;
  const d = decimals ?? (v >= 100 ? 0 : 2);
  const sym = SYMBOLS[cur] || cur;
  return `${cents < 0 ? '−' : ''}${sym} ${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
export function compact(n) {
  if (n == null) return '—';
  const a = Math.abs(n);
  for (const [div, suf] of [[1e6, 'M'], [1e3, 'k']]) {
    if (a >= div) return `${(n / div).toFixed(1).replace(/\.0$/, '')}${suf}`;
  }
  return String(Math.round(n));
}
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function highlight(text, q) {
  const t = String(text ?? '');
  const needle = String(q ?? '').trim().toLowerCase();
  if (!needle) return escapeHtml(t);
  const lower = t.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const j = lower.indexOf(needle, i);
    if (j < 0) { out += escapeHtml(t.slice(i)); break; }
    out += `${escapeHtml(t.slice(i, j))}<mark>${escapeHtml(t.slice(j, j + needle.length))}</mark>`;
    i = j + needle.length;
  }
  return out;
}
export function parseHash(h) {
  const s = String(h || '').replace(/^#/, '');
  if (s !== 'life' && !s.startsWith('life/')) return null;
  const rest = s.slice(5);
  if (!rest) return { view: null };
  if (rest === 'search' || rest.startsWith('search?')) {
    return { view: 'search', q: new URLSearchParams(rest.split('?')[1] || '').get('q') || '' };
  }
  if (DAY_RE.test(rest)) return { view: 'day', day: rest };
  if (MONTH_RE.test(rest)) return { view: 'month', month: rest };
  if (YEAR_RE.test(rest)) return { view: 'year', year: rest };
  return { view: null };
}
export function buildHash(st) {
  if (st.view === 'search') return `#life/search?q=${encodeURIComponent(st.q || '')}`;
  if (st.view === 'month') return `#life/${st.day.slice(0, 7)}`;
  if (st.view === 'year') return `#life/${st.day.slice(0, 4)}`;
  return `#life/${st.day}`;
}
