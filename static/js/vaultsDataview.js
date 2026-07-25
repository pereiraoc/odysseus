// static/js/vaultsDataview.js — Engine DQL do Dataview (fork-local; ver LOCAL_CHANGES.md)
//
// Motor real de queries ```dataview``` pro painel de Vaults: tokenizer com
// identificadores unicode (nível, perícia, insight-type), parser Pratt de
// expressões, grafo de links (FROM [[]], outgoing()), contexto `this`,
// GROUP BY/FLATTEN/SORT multi-chave e biblioteca de funções.
//
// API: runQuery(src, ctx) → { html }  (lança Error com mensagem clara quando
// a construção não é suportada — TASK/CALENDAR/dataviewjs degradam no caller).
// ctx: { notes: [meta], current: relPath|null, linkHtml(path|null, label) }

const _esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Tipos ──
function Link(target, display) { return { __link: true, target: String(target || ''), display: display || null }; }
const isLink = v => v && typeof v === 'object' && v.__link === true;
const isDate = v => v instanceof Date;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// ── Índice de páginas ──
class Index {
  constructor(notes, currentPath) {
    this.notes = notes;
    this.byPath = new Map();
    this.byBase = new Map();
    for (const n of notes) {
      this.byPath.set(n.path, n);
      const base = n.name.toLowerCase();
      if (!this.byBase.has(base)) this.byBase.set(base, []);
      this.byBase.get(base).push(n.path);
      for (const a of (n.aliases || [])) {
        const ab = String(a).toLowerCase();
        if (!this.byBase.has(ab)) this.byBase.set(ab, []);
        this.byBase.get(ab).push(n.path);
      }
    }
    this.current = currentPath ? this.byPath.get(currentPath) || null : null;
    this._out = new Map();   // path -> Set(resolved outlink paths)
    this._in = null;         // path -> Set(paths que linkam pra ele)
    this._wrap = new Map();
  }

  resolve(raw) {
    let t = String(raw || '').trim();
    if (!t) return this.current?.path || null;
    t = t.split('#')[0].trim();
    if (!t) return this.current?.path || null;
    const asMd = t.toLowerCase().endsWith('.md') ? t : `${t}.md`;
    if (this.byPath.has(asMd)) return asMd;
    if (this.byPath.has(t)) return t;
    const cands = this.byBase.get(t.split('/').pop().replace(/\.md$/i, '').toLowerCase()) || [];
    if (!cands.length) return null;
    if (t.includes('/')) {
      const suffix = (t.replace(/\.md$/i, '') + '.md').toLowerCase();
      const hit = cands.find(p => p.toLowerCase().endsWith(suffix));
      if (hit) return hit;
    }
    return cands.slice().sort((a, b) => a.length - b.length)[0];
  }

  outlinksOf(path) {
    if (!this._out.has(path)) {
      const n = this.byPath.get(path);
      const set = new Set();
      for (const raw of (n?.outlinks || [])) {
        const r = this.resolve(raw);
        if (r) set.add(r);
      }
      this._out.set(path, set);
    }
    return this._out.get(path);
  }

  inlinksOf(path) {
    if (!this._in) {
      this._in = new Map();
      for (const n of this.notes) {
        for (const target of this.outlinksOf(n.path)) {
          if (!this._in.has(target)) this._in.set(target, new Set());
          this._in.get(target).add(n.path);
        }
      }
    }
    return this._in.get(path) || new Set();
  }

  // wrapper de página: props com chaves case-insensitive + objeto file.*
  page(note) {
    if (this._wrap.has(note.path)) return this._wrap.get(note.path);
    const props = new Map();
    for (const [k, v] of Object.entries(note.props || {})) {
      props.set(String(k).toLowerCase(), coerceValue(v));
    }
    const idx = this;
    const file = {
      name: note.name,
      path: note.path,
      folder: note.folder,
      link: Link(note.path, note.name),
      size: note.size,
      ext: 'md',
      tags: (note.tags || []).map(t => '#' + t),
      etags: (note.tags || []).map(t => '#' + t),
      aliases: note.aliases || [],
      mtime: new Date(note.mtime * 1000),
      ctime: new Date((note.ctime || note.mtime) * 1000),
      get mday() { return stripTime(this.mtime); },
      get cday() { return stripTime(this.ctime); },
      get inlinks() { return [...idx.inlinksOf(note.path)].map(p => Link(p, idx.byPath.get(p)?.name)); },
      get outlinks() { return [...idx.outlinksOf(note.path)].map(p => Link(p, idx.byPath.get(p)?.name)); },
      get day() {
        const m = /(\d{4}-\d{2}-\d{2})/.exec(note.name);
        return m ? new Date(m[1] + 'T00:00:00') : null;
      },
    };
    const w = { note, props, file };
    this._wrap.set(note.path, w);
    return w;
  }
}

function stripTime(d) { return isDate(d) ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : d; }

function coerceValue(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(coerceValue);
  if (typeof v === 'string') {
    if (ISO_DATE.test(v.trim())) {
      const d = new Date(v.trim().length === 10 ? v.trim() + 'T00:00:00' : v.trim());
      if (!Number.isNaN(d.getTime())) return d;
    }
    const lm = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/.exec(v.trim());
    if (lm) return Link(lm[1].trim(), lm[2]?.trim() || null);
    return v;
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = coerceValue(x);
    return out;
  }
  return v;
}

// ── Tokenizer ──
const OPS2 = ['!=', '>=', '<='];
const OPS1 = ['=', '>', '<', '(', ')', ',', '+', '-', '*', '/', '%', '!', '.'];
const ID_RE = /^[\p{L}_][\p{L}\p{N}_-]*/u;

function lex(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('[[', i)) {
      const end = src.indexOf(']]', i + 2);
      if (end === -1) throw new Error('[[ sem fechamento');
      const inner = src.slice(i + 2, end);
      const [target, display] = inner.split('|');
      toks.push({ t: 'link', v: Link(target.trim(), display?.trim() || null) });
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { out += src[j + 1]; j += 2; }
        else { out += src[j]; j++; }
      }
      if (j >= src.length) throw new Error('string sem fechamento');
      toks.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    if (c === '#') {
      const m = /^#([\p{L}\p{N}_\/-]+)/u.exec(src.slice(i));
      if (m) { toks.push({ t: 'tag', v: m[1] }); i += m[0].length; continue; }
    }
    if (/\d/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      toks.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    const idm = ID_RE.exec(src.slice(i));
    if (idm) { toks.push({ t: 'id', v: idm[0] }); i += idm[0].length; continue; }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`caractere inesperado: ${c}`);
  }
  toks.push({ t: 'eof' });
  return toks;
}

// ── Parser (Pratt) ──
class P {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  isKw(kw) { const t = this.peek(); return t.t === 'id' && t.v.toLowerCase() === kw; }
  eatOp(op) { const t = this.peek(); if (t.t === 'op' && t.v === op) { this.i++; return true; } return false; }
  expectOp(op) { if (!this.eatOp(op)) throw new Error(`esperado '${op}'`); }

  expr(minBp = 0) {
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      let op = null, bp = 0;
      if (t.t === 'op' && ['=', '!=', '>', '<', '>=', '<='].includes(t.v)) { op = t.v; bp = 30; }
      else if (t.t === 'op' && ['+', '-'].includes(t.v)) { op = t.v; bp = 40; }
      else if (t.t === 'op' && ['*', '/', '%'].includes(t.v)) { op = t.v; bp = 50; }
      else if (t.t === 'id' && t.v.toLowerCase() === 'and') { op = 'and'; bp = 20; }
      else if (t.t === 'id' && t.v.toLowerCase() === 'or') { op = 'or'; bp = 10; }
      if (!op || bp < minBp) break;
      this.next();
      const right = this.expr(bp + 1);
      left = { k: 'bin', op, l: left, r: right };
    }
    return left;
  }

  prefix() {
    const t = this.next();
    if (t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'link') return { k: 'lit', v: t.v };
    if (t.t === 'tag') return { k: 'lit', v: '#' + t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = this.expr(0);
      this.expectOp(')');
      return this.postfix(e);
    }
    if (t.t === 'op' && (t.v === '!' || t.v === '-')) {
      return { k: 'un', op: t.v, e: this.expr(45) };
    }
    if (t.t === 'id') {
      const low = t.v.toLowerCase();
      if (low === 'not') return { k: 'un', op: '!', e: this.expr(45) };
      if (low === 'true') return { k: 'lit', v: true };
      if (low === 'false') return { k: 'lit', v: false };
      if (low === 'null') return { k: 'lit', v: null };
      let node = { k: 'id', v: t.v };
      return this.postfix(node);
    }
    throw new Error(`token inesperado: ${t.v ?? t.t}`);
  }

  postfix(node) {
    for (;;) {
      if (this.eatOp('.')) {
        const f = this.next();
        if (f.t !== 'id') throw new Error("esperado campo após '.'");
        node = { k: 'member', obj: node, f: f.v };
      } else if (this.peek().t === 'op' && this.peek().v === '(' && node.k === 'id') {
        this.next();
        const args = [];
        if (!(this.peek().t === 'op' && this.peek().v === ')')) {
          do { args.push(this.expr(0)); } while (this.eatOp(','));
        }
        this.expectOp(')');
        node = this.postfix({ k: 'call', fn: node.v.toLowerCase(), args });
      } else {
        return node;
      }
    }
  }
}

function parseExpr(src) {
  const p = new P(lex(src));
  const e = p.expr(0);
  if (p.peek().t !== 'eof') throw new Error(`sobra na expressão: '${src}'`);
  return e;
}

// ── Comparação / igualdade ──
function rank(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return 1;
  if (isDate(v)) return 2;
  if (typeof v === 'string') return 3;
  if (isLink(v)) return 4;
  if (typeof v === 'boolean') return 5;
  if (Array.isArray(v)) return 6;
  return 7;
}

function cmp(a, b, idx) {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 0: return 0;
    case 1: return a - b;
    case 2: return a.getTime() - b.getTime();
    case 3: return a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' });
    case 4: {
      const la = (a.display || a.target.split('/').pop());
      const lb = (b.display || b.target.split('/').pop());
      return String(la).localeCompare(String(lb), 'pt', { numeric: true, sensitivity: 'base' });
    }
    case 5: return (a === b) ? 0 : (a ? 1 : -1);
    case 6: {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = cmp(a[i], b[i], idx);
        if (c) return c;
      }
      return a.length - b.length;
    }
    default: return 0;
  }
}

function eq(a, b, idx) {
  if (a == null || b == null) return a == null && b == null;
  if (isLink(a) && isLink(b)) {
    const pa = idx.resolve(a.target), pb = idx.resolve(b.target);
    if (pa && pb) return pa === pb;
    return a.target.split('/').pop().replace(/\.md$/i, '').toLowerCase()
      === b.target.split('/').pop().replace(/\.md$/i, '').toLowerCase();
  }
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => eq(x, b[i], idx));
  }
  if (typeof a === 'number' && typeof b === 'string' && ISO_DATE.test(b)) return false;
  return a === b;
}

function truthy(v) {
  if (v == null || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v === '' || v === 0) return false;
  return true;
}

// ── Funções ──
function makeFns(idx) {
  const F = {
    link: (t, d) => isLink(t) ? Link(t.target, d != null ? String(d) : t.display) : Link(String(t ?? ''), d != null ? String(d) : null),
    contains: (a, b) => {
      if (a == null) return false;
      if (Array.isArray(a)) return a.some(x => eq(x, b, idx));
      if (typeof a === 'string') return a.includes(String(b ?? ''));
      if (typeof a === 'object' && !isLink(a) && !isDate(a)) return Object.prototype.hasOwnProperty.call(a, String(b));
      return eq(a, b, idx);
    },
    icontains: (a, b) => {
      if (a == null) return false;
      if (typeof a === 'string') return a.toLowerCase().includes(String(b ?? '').toLowerCase());
      return F.contains(a, b);
    },
    econtains: (a, b) => Array.isArray(a) ? a.some(x => eq(x, b, idx)) : eq(a, b, idx),
    length: v => v == null ? 0 : (Array.isArray(v) || typeof v === 'string' ? v.length : Object.keys(v).length),
    lower: v => String(v ?? '').toLowerCase(),
    upper: v => String(v ?? '').toUpperCase(),
    trim: v => String(v ?? '').trim(),
    default: (v, d) => v == null ? d : v,
    choice: (c, a, b) => truthy(c) ? a : b,
    join: (arr, sep = ', ') => (Array.isArray(arr) ? arr : [arr]).map(x => display(x, idx)).join(sep),
    split: (s, sep) => String(s ?? '').split(sep),
    replace: (s, a, b) => String(s ?? '').split(a).join(b),
    startswith: (s, p) => String(s ?? '').startsWith(String(p ?? '')),
    endswith: (s, p) => String(s ?? '').endsWith(String(p ?? '')),
    regexmatch: (pat, s) => new RegExp(String(pat)).test(String(s ?? '')),
    regexreplace: (s, pat, rep) => String(s ?? '').replace(new RegExp(String(pat), 'g'), String(rep)),
    number: v => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; },
    string: v => display(v, idx),
    round: (n, d = 0) => { const m = 10 ** d; return Math.round(Number(n) * m) / m; },
    min: (...a) => flatArgs(a).reduce((x, y) => cmp(y, x, idx) < 0 ? y : x),
    max: (...a) => flatArgs(a).reduce((x, y) => cmp(y, x, idx) > 0 ? y : x),
    sum: (...a) => flatArgs(a).reduce((x, y) => x + (Number(y) || 0), 0),
    reverse: a => Array.isArray(a) ? a.slice().reverse() : a,
    sort: a => Array.isArray(a) ? a.slice().sort((x, y) => cmp(x, y, idx)) : a,
    flat: a => Array.isArray(a) ? a.flat() : a,
    any: a => Array.isArray(a) ? a.some(truthy) : truthy(a),
    all: a => Array.isArray(a) ? a.every(truthy) : truthy(a),
    none: a => Array.isArray(a) ? !a.some(truthy) : !truthy(a),
    typeof: v => v == null ? 'null' : isLink(v) ? 'link' : isDate(v) ? 'date' : Array.isArray(v) ? 'array' : typeof v,
    date: v => {
      if (isDate(v)) return v;
      const s = String(v ?? '').trim().toLowerCase();
      const today = new Date();
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (s === 'today') return day;
      if (s === 'now') return today;
      if (s === 'yesterday') return new Date(day.getTime() - 86400000);
      if (s === 'tomorrow') return new Date(day.getTime() + 86400000);
      if (isLink(v)) return F.date(v.target.split('/').pop());
      const m = /(\d{4}-\d{2}-\d{2})/.exec(String(v));
      if (m) return new Date(m[1] + 'T00:00:00');
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d;
    },
    striptime: v => stripTime(F.date(v)),
    dateformat: (v, fmt) => {
      const d = F.date(v);
      if (!d) return '';
      const p2 = n => String(n).padStart(2, '0');
      return String(fmt || 'yyyy-MM-dd')
        .replace(/yyyy/g, String(d.getFullYear()))
        .replace(/MM/g, p2(d.getMonth() + 1))
        .replace(/dd/g, p2(d.getDate()))
        .replace(/HH/g, p2(d.getHours()))
        .replace(/mm/g, p2(d.getMinutes()))
        .replace(/ss/g, p2(d.getSeconds()));
    },
    dur: v => String(v ?? ''),  // exibição apenas
  };
  return F;
}
const flatArgs = a => (a.length === 1 && Array.isArray(a[0])) ? a[0] : a;

// ── Avaliador ──
function evalNode(node, env) {
  const { idx, fns } = env;
  switch (node.k) {
    case 'lit': return node.v;
    case 'id': {
      const low = node.v.toLowerCase();
      if (low === 'this') return { __this: true };
      if (low === 'file') return env.page?.file ?? null;
      if (low === 'row') return { __row: true };
      if (env.extra && low in env.extra) return env.extra[low];
      return env.page ? (env.page.props.get(low) ?? null) : null;
    }
    case 'member': {
      const obj = evalNode(node.obj, env);
      return member(obj, node.f, env);
    }
    case 'call': {
      const fn = fns[node.fn];
      if (!fn) throw new Error(`função não suportada: ${node.fn}()`);
      return fn(...node.args.map(a => evalNode(a, env)));
    }
    case 'un': {
      const v = evalNode(node.e, env);
      return node.op === '!' ? !truthy(v) : -Number(v);
    }
    case 'bin': {
      const { op } = node;
      if (op === 'and') return truthy(evalNode(node.l, env)) ? evalNode(node.r, env) : false;
      if (op === 'or') { const l = evalNode(node.l, env); return truthy(l) ? l : evalNode(node.r, env); }
      const a = evalNode(node.l, env), b = evalNode(node.r, env);
      switch (op) {
        case '=': return eq(a, b, idx);
        case '!=': return !eq(a, b, idx);
        case '>': return a != null && b != null && cmp(a, b, idx) > 0;
        case '<': return a != null && b != null && cmp(a, b, idx) < 0;
        case '>=': return a != null && b != null && cmp(a, b, idx) >= 0;
        case '<=': return a != null && b != null && cmp(a, b, idx) <= 0;
        case '+': return (typeof a === 'string' || typeof b === 'string') ? display(a, idx) + display(b, idx) : Number(a) + Number(b);
        case '-': return Number(a) - Number(b);
        case '*': return Number(a) * Number(b);
        case '/': return Number(a) / Number(b);
        case '%': return Number(a) % Number(b);
        default: throw new Error(`operador ${op}`);
      }
    }
    default: throw new Error('nó desconhecido');
  }
}

function member(obj, field, env) {
  const { idx } = env;
  const f = field.toLowerCase();
  if (obj && obj.__this) {
    if (!idx.current) return null;
    if (f === 'file') return idx.page(idx.current).file;
    return idx.page(idx.current).props.get(f) ?? null;
  }
  if (obj && obj.__row) return env.page ? (env.page.props.get(f) ?? null) : null;
  if (obj == null) return null;
  if (isLink(obj)) {
    // acesso a campos da página apontada pelo link
    const p = idx.resolve(obj.target);
    if (!p) return null;
    const w = idx.page(idx.byPath.get(p));
    if (f === 'file') return w.file;
    return w.props.get(f) ?? null;
  }
  if (isDate(obj)) {
    if (f === 'year') return obj.getFullYear();
    if (f === 'month') return obj.getMonth() + 1;
    if (f === 'day') return obj.getDate();
    return null;
  }
  if (typeof obj === 'object') {
    if (obj[field] !== undefined) return coerceValue(obj[field]);
    if (obj[f] !== undefined) return coerceValue(obj[f]);
    const lk = Object.keys(obj).find(k => k.toLowerCase() === f);
    return lk !== undefined ? coerceValue(obj[lk]) : null;
  }
  return null;
}

// ── FROM (fontes) ──
function parseSource(p) {
  // or / and sobre termos
  let left = sourceTerm(p);
  for (;;) {
    if (p.isKw('and')) { p.next(); left = { k: 'sand', l: left, r: sourceTerm(p) }; }
    else if (p.isKw('or')) { p.next(); left = { k: 'sor', l: left, r: sourceTerm(p) }; }
    else break;
  }
  return left;
}

function sourceTerm(p) {
  if (p.eatOp('!')) return { k: 'snot', e: sourceTerm(p) };
  if (p.eatOp('(')) {
    const s = parseSource(p);
    p.expectOp(')');
    return s;
  }
  const t = p.next();
  if (t.t === 'tag') return { k: 'stag', tag: t.v };
  if (t.t === 'str') return { k: 'sfolder', folder: t.v };
  if (t.t === 'link') return { k: 'slink', link: t.v };
  if (t.t === 'id' && t.v.toLowerCase() === 'outgoing') {
    p.expectOp('(');
    const l = p.next();
    if (l.t !== 'link') throw new Error('outgoing() espera um [[link]]');
    p.expectOp(')');
    return { k: 'sout', link: l.v };
  }
  throw new Error(`fonte FROM não suportada: ${t.v ?? t.t}`);
}

function evalSource(node, idx) {
  const all = () => new Set(idx.notes.map(n => n.path));
  switch (node.k) {
    case 'stag': {
      const set = new Set();
      for (const n of idx.notes) {
        if ((n.tags || []).some(t => t === node.tag || t.startsWith(node.tag + '/'))) set.add(n.path);
      }
      return set;
    }
    case 'sfolder': {
      const folder = node.folder.replace(/\/$/, '');
      const set = new Set();
      for (const n of idx.notes) {
        if (n.path === folder || n.path.startsWith(folder + '/') || n.folder === folder) set.add(n.path);
      }
      return set;
    }
    case 'slink': {
      const target = idx.resolve(node.link.target);
      return target ? new Set(idx.inlinksOf(target)) : new Set();
    }
    case 'sout': {
      const target = idx.resolve(node.link.target);
      return target ? new Set(idx.outlinksOf(target)) : new Set();
    }
    case 'snot': {
      const inner = evalSource(node.e, idx);
      const out = all();
      for (const path of inner) out.delete(path);
      return out;
    }
    case 'sand': {
      const a = evalSource(node.l, idx), b = evalSource(node.r, idx);
      return new Set([...a].filter(x => b.has(x)));
    }
    case 'sor': {
      const a = evalSource(node.l, idx), b = evalSource(node.r, idx);
      return new Set([...a, ...b]);
    }
    default: throw new Error('fonte desconhecida');
  }
}

// ── Query: divisão em cláusulas ──
const CLAUSE_RE = /^(from|where|sort|group\s+by|flatten|limit)\b/i;

function splitClauses(src) {
  const lines = src.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() && !l.trim().startsWith('//'));
  if (!lines.length) throw new Error('query vazia');
  const clauses = [];
  let cur = { kw: 'header', text: lines[0].trim() };
  for (const line of lines.slice(1)) {
    const m = CLAUSE_RE.exec(line.trim());
    if (m) {
      clauses.push(cur);
      const kw = m[1].toLowerCase().replace(/\s+/g, ' ');
      cur = { kw, text: line.trim().slice(m[0].length).trim() };
    } else {
      cur.text += ' ' + line.trim();
    }
  }
  clauses.push(cur);
  // header pode conter cláusulas inline (ex.: "LIST FROM #x WHERE y")
  const head = clauses[0];
  const inline = /\b(from|where|sort|group by|flatten|limit)\b/i.exec(head.text.slice(5));
  if (inline && head.kw === 'header') {
    const pos = head.text.toLowerCase().indexOf(inline[1].toLowerCase(), 5);
    const rest = head.text.slice(pos);
    head.text = head.text.slice(0, pos).trim();
    // reprocessa o resto em cláusulas
    const sub = [];
    let s = rest;
    const kwRe = /\b(from|where|sort|group by|flatten|limit)\b/ig;
    const marks = [...s.matchAll(kwRe)];
    for (let k = 0; k < marks.length; k++) {
      const start = marks[k].index;
      const end = k + 1 < marks.length ? marks[k + 1].index : s.length;
      sub.push({ kw: marks[k][1].toLowerCase().replace(/\s+/g, ' '), text: s.slice(start + marks[k][1].length, end).trim() });
    }
    clauses.splice(1, 0, ...sub);
  }
  return clauses;
}

function splitTop(text) {
  // divide por vírgulas fora de () e strings
  const parts = [];
  let depth = 0, cur = '', inStr = null;
  for (const ch of text) {
    if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseColumns(text) {
  // cada coluna: expr [AS "Label"]
  return splitTop(text).map(pt => {
    const m = /^(.*?)\s+as\s+("([^"]*)"|'([^']*)'|(\S+))\s*$/i.exec(pt.trim());
    if (m) return { src: m[1].trim(), label: m[3] ?? m[4] ?? m[5], ast: parseExpr(m[1].trim()) };
    return { src: pt.trim(), label: pt.trim(), ast: parseExpr(pt.trim()) };
  });
}

// ── Exibição ──
function display(v, idx) {
  if (v == null) return '';
  if (isLink(v)) return v.display || v.target.split('/').pop().replace(/\.md$/i, '');
  if (isDate(v)) {
    const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    const p2 = n => String(n).padStart(2, '0');
    const d = `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
    return hasTime ? `${d} ${p2(v.getHours())}:${p2(v.getMinutes())}` : d;
  }
  if (Array.isArray(v)) return v.map(x => display(x, idx)).join(', ');
  return String(v);
}

function valueHtml(v, idx, ctx) {
  if (v == null) return '<span class="vaults-dv-null">—</span>';
  if (isLink(v)) {
    const path = idx.resolve(v.target);
    return ctx.linkHtml(path, display(v, idx));
  }
  if (Array.isArray(v)) return v.map(x => valueHtml(x, idx, ctx)).join(', ');
  return _esc(display(v, idx));
}

// ── Executor ──
export function runQuery(src, ctx) {
  const clauses = splitClauses(src);
  const head = clauses[0];
  const hm = /^(table|list|task|calendar)\b\s*(without\s+id\b)?\s*(.*)$/is.exec(head.text);
  if (!hm) throw new Error(`tipo de query não reconhecido: "${head.text.split(/\s/)[0]}"`);
  const type = hm[1].toLowerCase();
  if (type === 'task') throw new Error('TASK não suportado (nenhuma vault usa; abra uma issue se precisar)');
  if (type === 'calendar') throw new Error('CALENDAR não suportado');
  const withoutId = !!hm[2];
  const colText = (hm[3] || '').trim();

  const idx = new Index(ctx.notes, ctx.current);
  const fns = makeFns(idx);

  // FROM
  let paths;
  const fromCl = clauses.find(c => c.kw === 'from');
  if (fromCl && fromCl.text.trim()) {
    const p = new P(lex(fromCl.text));
    const srcNode = parseSource(p);
    if (p.peek().t !== 'eof') throw new Error(`sobra no FROM: ${fromCl.text}`);
    paths = evalSource(srcNode, idx);
  } else {
    paths = new Set(idx.notes.map(n => n.path));
  }
  let rows = [...paths].map(path => idx.page(idx.byPath.get(path))).filter(Boolean);

  const envFor = (page, extra) => ({ idx, fns, page, extra });

  // WHERE (múltiplos permitidos)
  for (const c of clauses.filter(x => x.kw === 'where')) {
    const ast = parseExpr(c.text);
    rows = rows.filter(pg => truthy(evalNode(ast, envFor(pg))));
  }

  // FLATTEN expr [AS alias]
  for (const c of clauses.filter(x => x.kw === 'flatten')) {
    const m = /^(.*?)(?:\s+as\s+(\S+))?$/i.exec(c.text.trim());
    const ast = parseExpr(m[1].trim());
    const alias = (m[2] || m[1].trim().split('.').pop()).toLowerCase();
    const out = [];
    for (const pg of rows) {
      const v = evalNode(ast, envFor(pg));
      const arr = Array.isArray(v) ? v : [v];
      for (const item of arr) out.push({ ...pg, __extra: { ...(pg.__extra || {}), [alias]: item } });
    }
    rows = out;
  }

  // GROUP BY expr [AS alias]
  let grouped = false;
  const gb = clauses.find(x => x.kw === 'group by');
  if (gb) {
    grouped = true;
    const m = /^(.*?)(?:\s+as\s+(\S+))?$/i.exec(gb.text.trim());
    const ast = parseExpr(m[1].trim());
    const alias = (m[2] || 'key').toLowerCase();
    const buckets = new Map();
    for (const pg of rows) {
      const key = evalNode(ast, envFor(pg, pg.__extra));
      const kd = display(key, idx);
      if (!buckets.has(kd)) buckets.set(kd, { key, pages: [] });
      buckets.get(kd).pages.push(pg);
    }
    rows = [...buckets.values()].map(b => ({
      props: new Map(),
      file: null,
      __extra: { [alias]: b.key, key: b.key, rows: b.pages.map(x => ({ file: x.file, ...Object.fromEntries(x.props) })) },
    }));
  }

  // SORT expr [asc|desc], ...
  const sortCl = clauses.find(x => x.kw === 'sort');
  if (sortCl && sortCl.text.trim()) {
    const keys = splitTop(sortCl.text).map(part => {
      const m = /^(.*?)\s+(asc|desc)\s*$/i.exec(part.trim());
      return m
        ? { ast: parseExpr(m[1].trim()), dir: m[2].toLowerCase() === 'desc' ? -1 : 1 }
        : { ast: parseExpr(part.trim()), dir: 1 };
    });
    rows = rows.slice().sort((x, y) => {
      for (const kSpec of keys) {
        const a = evalNode(kSpec.ast, envFor(x, x.__extra));
        const b = evalNode(kSpec.ast, envFor(y, y.__extra));
        const c = cmp(a, b, idx) * kSpec.dir;
        if (c) return c;
      }
      return 0;
    });
  }

  // LIMIT
  const lim = clauses.find(x => x.kw === 'limit');
  if (lim) {
    const n = parseInt(lim.text.trim(), 10);
    if (!Number.isNaN(n)) rows = rows.slice(0, n);
  }

  // ── Render ──
  const fileCell = pg => pg.file
    ? valueHtml(pg.file.link, idx, ctx)
    : valueHtml(pg.__extra?.key ?? null, idx, ctx);

  if (type === 'list') {
    const ast = colText ? parseExpr(colText) : null;
    const items = rows.map(pg => {
      const extra = ast ? valueHtml(evalNode(ast, envFor(pg, pg.__extra)), idx, ctx) : '';
      if (withoutId) return `<li>${extra}</li>`;
      return `<li>${fileCell(pg)}${extra ? ` <span class="vaults-dv-sep">·</span> ${extra}` : ''}</li>`;
    });
    return { html: `<ul class="vaults-dv-list">${items.join('')}</ul><div class="vaults-dv-count">${rows.length} resultado(s)</div>` };
  }

  // TABLE
  const cols = colText ? parseColumns(colText) : [];
  const ths = [];
  if (!withoutId) ths.push(grouped ? 'Group' : 'File');
  for (const cSpec of cols) ths.push(cSpec.label);
  const headHtml = `<tr>${ths.map(t => `<th>${_esc(t)}</th>`).join('')}</tr>`;
  const bodyHtml = rows.map(pg => {
    const tds = [];
    if (!withoutId) tds.push(fileCell(pg));
    for (const cSpec of cols) {
      tds.push(valueHtml(evalNode(cSpec.ast, envFor(pg, pg.__extra)), idx, ctx));
    }
    return `<tr>${tds.map(td => `<td>${td}</td>`).join('')}</tr>`;
  }).join('');
  return { html: `<table class="vaults-dv-table">${headHtml}${bodyHtml}</table><div class="vaults-dv-count">${rows.length} resultado(s)</div>` };
}
