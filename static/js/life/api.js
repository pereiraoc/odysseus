// static/js/life/api.js — cliente das rotas /api/lifelog/* (cancela a requisição anterior com a mesma chave).
const API = '/api/lifelog';
const inflight = new Map();

export async function api(path, params = {}, { key = path } = {}) {
  inflight.get(key)?.abort();
  const ctl = new AbortController();
  inflight.set(key, ctl);
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  try {
    const r = await fetch(`${API}/${path}${qs.toString() ? `?${qs}` : ''}`, { credentials: 'same-origin', signal: ctl.signal });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${r.status}`);
    }
    return await r.json();
  } finally {
    if (inflight.get(key) === ctl) inflight.delete(key);
  }
}

export const isAbort = e => e?.name === 'AbortError';
