// static/js/life/router.js — rotas do hub Life: #life/<app>/<caminho>?<params> (puro; tests/life_router.test.mjs).
// Hashes antigos do Diary (#life/AAAA-MM-DD, #life/AAAA-MM, #life/AAAA, #life/search?q=) continuam valendo.
export const APP_IDS = ['diary', 'finances', 'ai'];
const DIARY_LEGACY = /^(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4}|search)$/;

export function parseLifeHash(hash) {
  const s = String(hash || '').replace(/^#/, '');
  if (s !== 'life' && !s.startsWith('life/') && !s.startsWith('life?')) return null;
  const rest = s.slice(4).replace(/^\//, '');
  const qi = rest.indexOf('?');
  const pathStr = qi >= 0 ? rest.slice(0, qi) : rest;
  const params = Object.fromEntries(new URLSearchParams(qi >= 0 ? rest.slice(qi + 1) : ''));
  let parts;
  try {
    parts = pathStr.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // escape percent malformado: hash inválido, nunca lança
  }
  if (!parts.length) return { app: null, path: [], params };
  if (DIARY_LEGACY.test(parts[0])) return { app: 'diary', path: parts, params };
  if (!APP_IDS.includes(parts[0])) return { app: null, path: [], params: {} };
  return { app: parts[0], path: parts.slice(1), params };
}

export function lifeHref(app, path = [], params = {}) {
  const segs = [app, ...(Array.isArray(path) ? path : [path])].filter(x => x != null && x !== '').map(encodeURIComponent);
  const q = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => v != null && v !== '')).toString();
  return `#life/${segs.join('/')}${q ? `?${q}` : ''}`;
}
