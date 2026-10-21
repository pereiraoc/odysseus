// static/js/finance.js — painel "Finanças" (fork-local, ver LOCAL_CHANGES.md §7)
//
// Le /api/finance/* (routes/finance_routes.py): contas com saldo e conferencia,
// livro canonico com as fontes de cada transacao, auditoria (quebras de saldo,
// faturas, fila de revisao, erros de import) e os arquivos brutos (baixaveis
// exatamente como entraram). Graficos em SVG proprio (o CSP nao libera CDN).
import * as Modals from './modalManager.js';
import { makeWindowDraggable } from './windowDrag.js';
import { showError, esc } from './ui.js?v=20260916largetoolscroll1';
import { nextToolWindowZ } from './toolWindowZOrder.js';

const PANEL_ID = 'finance-panel';
const API = '/api/finance';
const PALETTE = ['#59c2ff', '#ffb454', '#7fd962', '#f07178', '#c792ea', '#2ec4b6', '#ff8f40', '#e6e16b', '#ff6ac1', '#8d9eff'];
const INST = { nubank: 'Nubank', santander: 'Santander', wise: 'Wise', caixa: 'Caixa' };
const KIND = { checking: 'conta', credit_card: 'cartão', wallet: 'carteira' };
const IMPORTER = {
  ofx: 'OFX', wise_csv: 'CSV Wise', santander_cc_pdf: 'PDF extrato', nubank_fatura_pdf: 'PDF fatura',
  santander_csv: 'planilha', santander_fatura_pdf: 'PDF fatura', santander_cc_ocr: 'OCR extrato', pluggy: 'Open Finance',
};

const st = { cur: 'BRL', category: '', catPeriod: '12', withTransfers: false, tab: 'overview', meta: null, account: '', q: '', from: '', to: '', offset: 0 };
let els = {};

// ── util ────────────────────────────────────────────────────────────────
function money(cents, cur = 'BRL') {
  if (cents === null || cents === undefined) return '—';
  const v = cents / 100;
  try { return v.toLocaleString('pt-BR', { style: 'currency', currency: cur }); } catch (_) { return `${v.toFixed(2)} ${cur}`; }
}
function day(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''; }
function accLabel(a) { return `${INST[a.institution] || a.institution} · ${KIND[a.kind] || a.kind}${a.kind === 'wallet' ? ' ' + a.currency : ''}`; }
function accByKey(k) { return (st.meta?.accounts || []).find(a => a.key === k); }
async function get(path) {
  const r = await fetch(`${API}${path}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function statusChip(a) {
  if (a.status === 'ok') return '<span class="fin-chip ok" title="todos os saldos impressos pela fonte batem">confere</span>';
  if (a.status === 'sem_checkpoint') return '<span class="fin-chip" title="a fonte não imprime saldo para conferir">sem saldo p/ conferir</span>';
  return `<span class="fin-chip warn" title="ver aba Auditoria">${a.problems} ponto(s) a revisar</span>`;
}

// ── gráfico de linhas (saldo de fim de mês por conta) ────────────────────
function lineChart(host, series) {
  const keys = Object.keys(series);
  if (!keys.length) { host.innerHTML = '<div class="fin-empty">Sem série de saldo.</div>'; return; }
  const W = Math.max(host.clientWidth || 800, 320), H = 240, P = { l: 70, r: 10, t: 10, b: 24 };
  const all = keys.flatMap(k => series[k]);
  const dates = [...new Set(all.map(p => p.date))].sort();
  const min = Math.min(0, ...all.map(p => p.balance)), max = Math.max(...all.map(p => p.balance), 1);
  const x = d => P.l + (dates.indexOf(d) / Math.max(dates.length - 1, 1)) * (W - P.l - P.r);
  const y = v => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  const svg = svgEl('svg', { width: W, height: H, class: 'fin-svg' });
  for (let i = 0; i <= 4; i++) {
    const v = min + (i / 4) * (max - min);
    svg.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'fin-grid' }));
    svg.append(svgEl('text', { x: P.l - 6, y: y(v) + 3, 'text-anchor': 'end', class: 'fin-axis' }, (v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })));
  }
  const step = Math.max(1, Math.ceil(dates.length / 10));
  dates.forEach((d, i) => { if (i % step === 0) svg.append(svgEl('text', { x: x(d), y: H - 6, 'text-anchor': 'middle', class: 'fin-axis' }, d.slice(0, 7))); });
  keys.forEach((k, i) => {
    const pts = series[k].map(p => `${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    const line = svgEl('polyline', { points: pts, fill: 'none', stroke: PALETTE[i % PALETTE.length], 'stroke-width': 1.8 });
    line.append(svgEl('title', {}, accLabel(accByKey(k) || { institution: k, kind: '' })));
    svg.append(line);
  });
  host.innerHTML = '';
  host.append(svg);
  const leg = document.createElement('div');
  leg.className = 'fin-legend';
  leg.innerHTML = keys.map((k, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(accLabel(accByKey(k) || { institution: k, kind: '' }))}</span>`).join('');
  host.append(leg);
}

// ── abas ────────────────────────────────────────────────────────────────
async function renderOverview(pane) {
  const m = st.meta;
  const card = a => `
    <div class="fin-acc" data-acc="${esc(a.key)}" title="ver transações">
      <div class="fin-acc-h">${esc(accLabel(a))} ${statusChip(a)}</div>
      <div class="fin-acc-v ${a.balance < 0 ? 'neg' : ''}">${money(a.balance, a.currency)}</div>
      <div class="fin-acc-s">${a.kind === 'credit_card' ? 'última fatura fechada' : 'saldo'} em ${day(a.balance_date)} · ${a.transactions} transações · ${day(a.first)} → ${day(a.last)}</div>
    </div>`;
  // carteiras zeradas (moedas de viagem do Wise) ficam recolhidas para nao poluir
  const idle = m.accounts.filter(a => a.kind === 'wallet' && !a.balance && a.status === 'ok');
  const main = m.accounts.filter(a => !idle.includes(a));
  const cards = main.map(card).join('') + (idle.length
    ? `<details class="fin-idle"><summary>${idle.length} carteiras zeradas (${idle.map(a => a.currency).join(', ')})</summary><div class="fin-accs">${idle.map(card).join('')}</div></details>` : '');
  const conn = `
    <div class="fin-conn">
      <span class="fin-chip ${m.pluggy_configured ? 'ok' : ''}">Open Finance (Meu Pluggy): ${m.pluggy_configured ? 'configurado' : 'não configurado'}</span>
      <span class="fin-chip ${m.wise_configured ? 'ok' : ''}">Wise API: ${m.wise_configured ? 'configurado' : 'não configurado'}</span>
      ${m.wise_configured ? '<button class="fin-btn fin-sync-wise">Atualizar Wise</button>' : ''}
      <span class="fin-chip">${(m.files.parsed || 0)} arquivos lidos · ${(m.files.error || 0)} com erro</span>
      ${m.queue ? `<span class="fin-chip warn">${m.queue} na fila de revisão</span>` : ''}
    </div>`;
  pane.innerHTML = `${conn}<div class="fin-accs">${cards}</div>
    <div class="fin-card"><div class="fin-card-h">Saldo no fim de cada mês <select class="fin-cur"></select><span class="fin-hint">uma moeda por vez; lacunas conhecidas já ajustadas</span></div><div class="fin-chart"></div></div>`;
  pane.querySelector('.fin-sync-wise')?.addEventListener('click', async e => {
    e.target.disabled = true;
    e.target.textContent = 'Atualizando…';
    try {
      const r = await fetch(`${API}/sync/wise`, { method: 'POST', credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.text()).slice(0, 300));
      await refreshMeta();
      render();
    } catch (err) { showError(`Wise: ${err.message}`); e.target.disabled = false; e.target.textContent = 'Atualizar Wise'; }
  });
  pane.querySelectorAll('[data-acc]').forEach(c => c.addEventListener('click', () => { st.account = c.dataset.acc; st.offset = 0; switchTab('transactions'); }));
  const { series } = await get('/balances');
  const curs = [...new Set(Object.keys(series).map(k => accByKey(k)?.currency || 'BRL'))].sort((a, b) => (a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b)));
  const sel = pane.querySelector('.fin-cur');
  sel.innerHTML = curs.map(c => `<option ${c === st.cur ? 'selected' : ''}>${c}</option>`).join('');
  const draw = () => {
    st.cur = sel.value;
    lineChart(pane.querySelector('.fin-chart'), Object.fromEntries(Object.entries(series).filter(([k]) => (accByKey(k)?.currency || 'BRL') === st.cur)));
  };
  sel.addEventListener('change', draw);
  draw();
}

async function renderTransactions(pane) {
  const opts = st.meta.accounts.map(a => `<option value="${esc(a.key)}" ${a.key === st.account ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('');
  pane.innerHTML = `
    <div class="fin-filters">
      <select class="fin-f-acc"><option value="">todas as contas</option>${opts}</select>
      <input class="fin-f-q" placeholder="buscar descrição" value="${esc(st.q)}">
      <input class="fin-f-cat" placeholder="categoria (ou (sem))" value="${esc(st.category)}" list="fin-cat-list">
      <input type="date" class="fin-f-from" value="${st.from}"><span>→</span><input type="date" class="fin-f-to" value="${st.to}">
      <span class="fin-f-sum"></span>
    </div>
    <div class="fin-tx"></div>`;
  const reload = () => { st.offset = 0; fill(); };
  pane.querySelector('.fin-f-acc').addEventListener('change', e => { st.account = e.target.value; reload(); });
  let t;
  pane.querySelector('.fin-f-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; reload(); }, 250); });
  pane.querySelector('.fin-f-cat').addEventListener('change', e => { st.category = e.target.value.trim(); reload(); });
  pane.querySelector('.fin-f-from').addEventListener('change', e => { st.from = e.target.value; reload(); });
  pane.querySelector('.fin-f-to').addEventListener('change', e => { st.to = e.target.value; reload(); });
  async function fill() {
    const p = new URLSearchParams({ account: st.account, q: st.q, category: st.category, from: st.from, to: st.to, limit: '200', offset: String(st.offset) });
    const d = await get(`/transactions?${p}`);
    const cur = st.account ? accByKey(st.account)?.currency || 'BRL' : 'BRL';
    pane.querySelector('.fin-f-sum').textContent = `${d.total} transações` + (st.account ? ` · soma ${money(d.sum, cur)}` : '');
    const rows = d.rows.map(r => {
      const a = accByKey(r.account_key);
      const src = r.sources.map(s => `<span class="fin-chip src" title="${esc(s.description)} (${day(s.date)})">${esc(IMPORTER[s.importer] || s.importer)}</span>`).join('');
      return `<tr><td class="nowrap">${day(r.date)}</td><td>${esc(a ? accLabel(a) : r.account_key)}</td><td class="desc">${esc(r.description)}</td>
        <td class="fin-catcell" data-tx="${r.id}" title="${r.manual ? 'categoria manual' : r.rule ? esc(r.rule) : 'sem categoria'} — clique para mudar">${r.category ? esc(r.category) + (r.manual ? ' ✎' : '') : '<span class="fin-dim">—</span>'}</td><td>${src}</td>
        <td class="num ${r.amount_cents < 0 ? 'neg' : 'pos'}">${money(r.amount_cents, a?.currency || 'BRL')}</td></tr>`;
    }).join('');
    const more = d.total > st.offset + d.rows.length;
    pane.querySelector('.fin-tx').innerHTML = `<table class="fin-table"><thead><tr><th>Data</th><th>Conta</th><th>Descrição</th><th>Categoria</th><th>Fontes</th><th class="num">Valor</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="fin-empty">Nada encontrado.</td></tr>'}</tbody></table>
      <div class="fin-pager">${st.offset ? '<button data-p="-1">← anteriores</button>' : ''}${more ? '<button data-p="1">próximas →</button>' : ''}</div>`;
    pane.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { st.offset = Math.max(0, st.offset + Number(b.dataset.p) * 200); fill(); }));
    pane.querySelectorAll('.fin-catcell').forEach(td => td.addEventListener('click', () => editCategory(td, fill)));
  }
  await fill();
}

let catNames = [];
async function loadCatNames() {
  const d = await get('/categories?currency=');
  catNames = d.categories.map(c => c.category).filter(c => c !== '(sem)').sort();
  let dl = document.getElementById('fin-cat-list');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'fin-cat-list'; document.body.append(dl); }
  dl.innerHTML = catNames.map(c => `<option value="${esc(c)}">`).join('');
}

function editCategory(td, after) {
  if (td.querySelector('input')) return;
  const old = td.textContent.replace(' ✎', '').trim();
  td.innerHTML = `<input class="fin-catedit" list="fin-cat-list" value="${esc(old === '—' ? '' : old)}" placeholder="grupo:sub (vazio = volta à regra)">`;
  const inp = td.querySelector('input');
  inp.focus();
  let done = false;
  const save = async () => {
    if (done) return; done = true;
    const r = await fetch(`${API}/tx/${td.dataset.tx}/category`, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: inp.value }) });
    if (!r.ok) showError(`Finanças: ${(await r.text()).slice(0, 200)}`);
    await loadCatNames();
    after();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { done = true; after(); } });
  inp.addEventListener('blur', save);
}

async function renderCategories(pane) {
  const periods = [['1', 'mês atual'], ['3', '3 meses'], ['12', '12 meses'], ['all', 'tudo']];
  const end = new Date();
  // dados param em 2024: "12 meses" a partir do ultimo dado, nao de hoje
  const last = (st.meta.accounts.map(a => a.last).sort().pop() || '').slice(0, 10);
  const anchor = last ? new Date(last + 'T12:00:00') : end;
  const fromA = st.catPeriod === 'all' ? '' : new Date(anchor.getFullYear(), anchor.getMonth() - Number(st.catPeriod) + 1, 1).toISOString().slice(0, 10);
  const [d, rl, un] = await Promise.all([get(`/categories?currency=${st.cur}&from=${fromA || ''}`), get('/rules'), get('/uncategorized?limit=40')]);
  const isTransfer = c => c.startsWith('transferencias:') || c === 'financeiro:rotativo' || c === 'ajustes:pre-autorizacao';
  const cats = d.categories.filter(c => st.withTransfers || !isTransfer(c.category));
  const out = cats.filter(c => c.total < 0), inc = cats.filter(c => c.total > 0);
  const maxOut = Math.max(1, ...out.map(c => -c.total)), maxIn = Math.max(1, ...inc.map(c => c.total));
  const bar = (c, max, cls) => `<div class="fin-hbar" data-cat="${esc(c.category)}"><span class="fin-hbar-l">${esc(c.category)}</span>
    <span class="fin-hbar-t"><i class="${cls}" style="width:${(Math.abs(c.total) / max * 100).toFixed(1)}%"></i></span>
    <span class="fin-hbar-v">${money(c.total, st.cur)} <small>${c.count}</small></span></div>`;
  const sumOut = out.reduce((a, c) => a + c.total, 0), sumIn = inc.reduce((a, c) => a + c.total, 0);
  pane.innerHTML = `
    <div class="fin-filters">${periods.map(([v, l]) => `<button class="fin-btn ${st.catPeriod === v ? 'active' : ''}" data-cp="${v}">${l}</button>`).join('')}
      <select class="fin-cur2">${['BRL', 'USD', 'EUR', 'ILS', 'CHF', 'HUF', 'CZK', 'PLN', 'RON', 'GBP'].map(c => `<option ${c === st.cur ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label><input type="checkbox" class="fin-wt" ${st.withTransfers ? 'checked' : ''}> incluir transferências</label>
      <span class="fin-f-sum">${fromA ? 'desde ' + day(fromA) + ' (até o último dado)' : 'todo o histórico'} · entradas ${money(sumIn, st.cur)} · saídas ${money(sumOut, st.cur)}</span></div>
    <div class="fin-grid2">
      <div class="fin-card"><div class="fin-card-h">Saídas por categoria <span class="fin-hint">clique para ver as transações</span></div>${out.map(c => bar(c, maxOut, 'neg')).join('') || '<div class="fin-dim">nada</div>'}</div>
      <div class="fin-card"><div class="fin-card-h">Entradas por categoria</div>${inc.map(c => bar(c, maxIn, 'pos')).join('') || '<div class="fin-dim">nada</div>'}</div>
    </div>
    <div class="fin-card"><div class="fin-card-h">Regras <span class="fin-hint">${esc(rl.path || '')}</span></div>
      ${rl.error ? `<div class="fin-chip warn">${esc(rl.error)}</div>` : `<div>${rl.rules.length} regras · ${(rl.coverage * 100).toFixed(1)}% das ${rl.transactions} transações categorizadas · ${rl.manual} manuais</div>
      <details><summary class="fin-dim">ver regras</summary><table class="fin-table"><thead><tr><th>Regra</th><th>Prioridade</th><th>Categoria</th><th class="num">Transações</th></tr></thead><tbody>
      ${rl.rules.map(r => `<tr><td title="${esc(JSON.stringify(r.when))}">${esc(r.id)}</td><td>${r.priority}</td><td>${esc(r.category)}</td><td class="num">${r.hits}</td></tr>`).join('')}</tbody></table></details>`}</div>
    <div class="fin-card"><div class="fin-card-h">Ainda sem categoria (por estabelecimento) <span class="fin-hint">vira regra na próxima rodada; ou clique na categoria de uma transação para definir à mão</span></div>
      <table class="fin-table"><thead><tr><th>Estabelecimento</th><th>Conta</th><th class="num">Vezes</th><th class="num">Total</th><th>Exemplo</th></tr></thead><tbody>
      ${un.groups.map(g => `<tr><td>${esc(g.merchant)}</td><td>${esc((INST[g.institution] || g.institution) + ' · ' + (KIND[g.kind] || g.kind))}</td><td class="num">${g.count}</td><td class="num">${money(g.sum_cents, g.currency)}</td><td class="desc fin-dim">${esc(g.examples[0])}</td></tr>`).join('')}</tbody></table></div>`;
  pane.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', () => { st.catPeriod = b.dataset.cp; render(); }));
  pane.querySelector('.fin-cur2').addEventListener('change', e => { st.cur = e.target.value; render(); });
  pane.querySelector('.fin-wt').addEventListener('change', e => { st.withTransfers = e.target.checked; render(); });
  pane.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    st.category = b.dataset.cat; st.account = ''; st.q = ''; st.from = fromA; st.to = ''; st.offset = 0; switchTab('transactions');
  }));
}

async function renderAudit(pane) {
  const [d, tr] = await Promise.all([get('/audit'), get('/transfers')]);
  const accs = d.accounts.filter(a => a.transactions).map(a => {
    const acc = accByKey(a.account) || { institution: a.account, kind: '' };
    const cur = acc.currency || 'BRL';
    let body = '';
    if (a.breaks) {
      body = a.breaks.length
        ? a.breaks.map(b => `<li>entre <b>${day(b.after)}</b> e <b>${day(b.until)}</b>: diferença ${money(b.delta, cur)} — ${esc(b.hint)}</li>`).join('')
        : `<li class="fin-dim">${a.checked} saldos impressos pela fonte conferidos, todos batem.</li>`;
    } else {
      body = (a.unbalanced || []).map(b => `<li>${esc(b.file.split('/').pop())}: fatura não fecha por ${money(b.diff, cur)}</li>`).join('')
        + (a.chain_breaks || []).map(c => `<li>entre ${day(c.between[0])} e ${day(c.between[1])}: fatura anterior fechou ${money(c.prev_closing, cur)} e a seguinte abriu ${money(c.next_opening, cur)} — ${esc(c.hint)}</li>`).join('')
        || `<li class="fin-dim">${a.bills} faturas, todas fecham e encadeiam.</li>`;
    }
    const miss = a.coverage.missing_months.length ? `<div class="fin-dim">meses sem nenhuma transação: ${a.coverage.missing_months.join(', ')}</div>` : '';
    return `<div class="fin-card"><div class="fin-card-h">${esc(accLabel(acc))} ${statusChip({ status: a.status, problems: (a.breaks || []).length + (a.unbalanced || []).length + (a.chain_breaks || []).length })}
      <span class="fin-hint">${day(a.coverage.first + '-01')} → ${a.coverage.last}</span></div><ul class="fin-list">${body}</ul>${miss}</div>`;
  }).join('');
  const queue = d.queue.map(q => {
    const acc = accByKey(q.account_key);
    const cands = q.candidates.map(c => `<button data-merge="${q.record_id}" data-tx="${c.id}">mesclar com ${day(c.date)} ${esc(c.description.slice(0, 40))}</button>`).join('');
    return `<tr><td class="nowrap">${day(q.date)}</td><td>${esc(IMPORTER[q.importer] || q.importer)}</td><td class="desc">${esc(q.description)}</td>
      <td class="num">${money(q.amount_cents, acc?.currency || 'BRL')}</td><td>${q.reason === 'secundaria_sem_par' ? 'planilha sem par no extrato' : 'par incerto'}</td>
      <td class="fin-actions">${cands}<button data-keep="${q.record_id}" title="entra no livro como transação própria">manter separada</button></td></tr>`;
  }).join('');
  const errs = d.errors.map(e => `<li><b>${esc(e.source_name)}</b>: ${esc(e.error)}</li>`).join('');
  const warns = d.warnings.map(w => `<li><b>${esc(w.source_name)}</b>: ${esc(w.message)}</li>`).join('');
  pane.innerHTML = `${accs}
    <div class="fin-card"><div class="fin-card-h">Fila de revisão <span class="fin-hint">registros que não casaram com segurança — nada aqui entra no saldo até decidir</span></div>
      ${queue ? `<table class="fin-table"><thead><tr><th>Data</th><th>Fonte</th><th>Descrição</th><th class="num">Valor</th><th>Motivo</th><th></th></tr></thead><tbody>${queue}</tbody></table>` : '<div class="fin-dim">vazia</div>'}</div>
    <div class="fin-card"><div class="fin-card-h">Transferências entre suas contas sem a outra ponta (${tr.unpaired.length})
      <span class="fin-hint">${tr.pairs} pares casados · sem par = falta o extrato/fatura do outro lado nesse mês</span></div>
      ${tr.unpaired.length ? `<details><summary class="fin-dim">ver lista</summary><table class="fin-table"><tbody>${tr.unpaired.map(t => `<tr><td class="nowrap">${day(t.date)}</td><td>${esc(accLabel(accByKey(t.account_key) || { institution: t.account_key, kind: '' }))}</td><td class="desc">${esc(t.description)}</td><td class="num">${money(t.amount_cents, accByKey(t.account_key)?.currency || 'BRL')}</td></tr>`).join('')}</tbody></table></details>` : '<div class="fin-dim">todas casadas</div>'}</div>
    <div class="fin-card"><div class="fin-card-h">Avisos de importação</div>${warns ? `<ul class="fin-list">${warns}</ul>` : '<div class="fin-dim">nenhum</div>'}</div>
    <div class="fin-card"><div class="fin-card-h">Arquivos que não entraram <span class="fin-hint">o original fica guardado; reprocessa quando o leitor existir</span></div>${errs ? `<ul class="fin-list">${errs}</ul>` : '<div class="fin-dim">nenhum</div>'}</div>`;
  const decide = async (id, body) => {
    const r = await fetch(`${API}/queue/${id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { showError(`Finanças: ${(await r.text()).slice(0, 200)}`); return; }
    await refreshMeta();
    render();
  };
  pane.querySelectorAll('[data-merge]').forEach(b => b.addEventListener('click', () => decide(b.dataset.merge, { target_tx_id: Number(b.dataset.tx) })));
  pane.querySelectorAll('[data-keep]').forEach(b => b.addEventListener('click', () => decide(b.dataset.keep, { target_tx_id: null })));
}

async function renderFiles(pane) {
  const d = await get('/files');
  const rows = d.files.map(f => `<tr class="${f.status === 'error' ? 'err' : ''}"><td class="desc">${esc(f.source_name)}</td>
    <td>${esc(IMPORTER[f.importer] || f.importer || '—')}</td><td class="nowrap">${f.period_start ? day(f.period_start) + ' → ' + day(f.period_end) : ''}</td>
    <td class="num">${f.n_records || ''}</td><td>${f.status === 'error' ? `<span class="fin-chip warn" title="${esc(f.error)}">erro</span>` : 'ok'}</td>
    <td><a href="${API}/raw/${f.sha256}" title="sha256 ${f.sha256}">original</a></td></tr>`).join('');
  pane.innerHTML = `
    <div class="fin-card"><div class="fin-card-h">Importar arquivos <span class="fin-hint">OFX, CSV do Wise, PDF de extrato/fatura. Reimportar o mesmo arquivo não duplica nada.</span></div>
      <label class="fin-drop"><input type="file" multiple class="fin-upload"><span>Escolher arquivos…</span></label><div class="fin-upres"></div></div>
    <div class="fin-card"><div class="fin-card-h">Arquivos guardados (${d.files.length}) <span class="fin-hint">bruto imutável em data/finance/raw, por sha256</span></div>
      <table class="fin-table"><thead><tr><th>Arquivo</th><th>Leitor</th><th>Período</th><th class="num">Registros</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  pane.querySelector('.fin-upload').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    const out = pane.querySelector('.fin-upres');
    out.textContent = `Importando ${files.length} arquivo(s)…`;
    const fd = new FormData();
    files.forEach(f => fd.append('files', f, f.name));
    try {
      const r = await fetch(`${API}/import`, { method: 'POST', credentials: 'same-origin', body: fd });
      if (!r.ok) throw new Error((await r.text()).slice(0, 300));
      const res = await r.json();
      out.innerHTML = res.results.map(x => `<div>${x.status === 'parsed' ? '✓' : '✗'} ${esc(x.name)}: ${x.status === 'parsed' ? `${x.records} registros, ${x.new_records} novos` : esc(x.error)}${(x.warnings || []).map(w => `<div class="fin-dim">aviso: ${esc(w)}</div>`).join('')}</div>`).join('');
      await refreshMeta();
    } catch (err) { out.textContent = `Falhou: ${err.message}`; }
  });
}

const TABS = { overview: ['Visão geral', renderOverview], categories: ['Categorias', renderCategories], transactions: ['Transações', renderTransactions], audit: ['Auditoria', renderAudit], files: ['Arquivos', renderFiles] };

function switchTab(tab) { st.tab = tab; try { localStorage.setItem('odysseus-fin-tab', tab); } catch (_) {} render(); }

async function render() {
  if (!els.body) return;
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = els.body;
  pane.innerHTML = '<div class="fin-empty">Carregando…</div>';
  try {
    if (!st.meta?.available && st.tab !== 'files') {
      pane.innerHTML = '<div class="fin-empty">Nenhum dado ainda. Importe arquivos na aba Arquivos.</div>';
      return;
    }
    await TABS[st.tab][1](pane);
  } catch (e) {
    pane.innerHTML = `<div class="fin-empty">Falhou: ${esc(e.message)}</div>`;
  }
}

async function refreshMeta() {
  st.meta = await get('/meta');
  const li = st.meta.last_import;
  els.status.textContent = st.meta.available
    ? `${st.meta.accounts.length} contas` + (li ? ` · último import ${new Date(li).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : '')
    : 'sem dados';
}

function buildPanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'modal hidden';
  panel.innerHTML = `
    <div class="modal-content fin-content">
      <div class="modal-header fin-header">
        <span class="fin-titlebar">Finanças</span>
        <span class="fin-status"></span>
        <button class="close-btn" aria-label="Fechar">✖</button>
      </div>
      <div class="fin-tabs">${Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="fin-body"></div>
    </div>`;
  document.body.appendChild(panel);
  els = { panel, content: panel.querySelector('.modal-content'), header: panel.querySelector('.modal-header'),
    tabs: panel.querySelector('.fin-tabs'), body: panel.querySelector('.fin-body'), status: panel.querySelector('.fin-status') };
  panel.querySelector('.close-btn').addEventListener('click', () => Modals.close(PANEL_ID));
  makeWindowDraggable(panel, { content: els.content, header: els.header });
  panel.addEventListener('pointerdown', () => {
    try {
      panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
    } catch (_) {}
  }, true);
  els.tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  try { st.tab = localStorage.getItem('odysseus-fin-tab') || 'overview'; } catch (_) {}
  if (!TABS[st.tab]) st.tab = 'overview';
  if (!Modals.isRegistered(PANEL_ID)) {
    Modals.register(PANEL_ID, { label: 'Finanças', restoreFn: () => {}, closeFn: () => document.getElementById(PANEL_ID)?.classList.add('hidden') });
    Modals.injectMinimizeButton(panel, PANEL_ID);
  }
  return panel;
}

async function openPanel() {
  const panel = buildPanel();
  panel.classList.remove('hidden');
  try {
    panel.style.setProperty('z-index', String(nextToolWindowZ({ exclude: panel, current: getComputedStyle(panel).zIndex, floor: 300 })), 'important');
  } catch (_) {}
  try { await refreshMeta(); loadCatNames().catch(() => {}); } catch (e) { showError(`Finanças: ${e.message}`); return; }
  render();
}

function mountSidebar() {
  const list = document.getElementById('finance-list');
  if (!list || list.dataset.ready) return;
  list.dataset.ready = '1';
  const item = document.createElement('div');
  item.className = 'list-item fin-side-item';
  item.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.6"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg><span class="grow">Contas, cartões e auditoria</span>`;
  item.addEventListener('click', openPanel);
  list.append(item);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSidebar);
else mountSidebar();

export { openPanel };
