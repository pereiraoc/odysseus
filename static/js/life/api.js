// static/js/life/api.js — cliente das rotas /api/lifelog/* (cancela a requisição anterior com a mesma chave).
// `timeout` (ms, opcional) aborta pelo mesmo AbortController e vira um erro TimeoutError (não AbortError: quem chama
// mostra o estado vazio em vez de engolir como cancelamento).
const API = '/api/lifelog';
const inflight = new Map();

export async function api(path, params = {}, { key = path, timeout = 0 } = {}) {
  inflight.get(key)?.abort();
  const ctl = new AbortController();
  inflight.set(key, ctl);
  let timedOut = false;
  const timer = timeout > 0 ? setTimeout(() => { timedOut = true; ctl.abort(); }, timeout) : null;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  try {
    const r = await fetch(`${API}/${path}${qs.toString() ? `?${qs}` : ''}`, { credentials: 'same-origin', signal: ctl.signal });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.detail || `HTTP ${r.status}`);
    }
    return await r.json();
  } catch (e) {
    if (timedOut) {
      const err = new Error('The server did not answer in time');
      err.name = 'TimeoutError';
      throw err;
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    if (inflight.get(key) === ctl) inflight.delete(key);
  }
}

export const isAbort = e => e?.name === 'AbortError';
