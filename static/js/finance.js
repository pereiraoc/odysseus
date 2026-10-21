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

const st = { mPeriod: '24', mGroup: 'month', mPeople: true, cur: 'ALL', category: '', catPeriod: '12', withTransfers: false, tab: 'overview', meta: null, account: '', q: '', from: '', to: '', offset: 0 };
let els = {};

// ── util ────────────────────────────────────────────────────────────────
function money(cents, cur = 'BRL') {
  if (cents === null || cents === undefined) return '—';
  if (cur === 'ALL') cur = 'BRL';  // agregado: tudo convertido para reais
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


// ── custo mensal (visão geral) ──────────────────────────────────────────
const COST_LABEL = {
  'moradia:aluguel': 'Aluguel', 'moradia:condominio': 'Condomínio', 'moradia:energia': 'Luz', 'moradia:agua': 'Água', 'moradia:gas': 'Gás',
  'moradia:telefone-internet': 'Internet e telefone', 'moradia:contas': 'Outras contas da casa', 'financeiro:seguros': 'Seguros',
  'saude:plano': 'Plano de saúde', 'educacao:mensalidade': 'Mensalidade (educação)',
};
const COST_CLASS = [['essencial', 'Essencial fixo', SERIES_C(0)], ['assinaturas', 'Assinaturas', SERIES_C(1)], ['variavel', 'Variável', SERIES_C(2)]];
function SERIES_C(i) { return ['#3987e5', '#d95926', '#199e70'][i]; }
function monthShort(m) { return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`; }

async function renderCosts(host) {
  const c = await get(`/costs?currency=ALL`);
  const tot = c.total_avg || 1, cur = 'BRL';
  const months = c.months;
  const pct = v => `${Math.round((v / tot) * 100)}%`;
  const ofSal = c.salary_base_avg ? ` · ${Math.round((c.total_avg / c.salary_base_avg) * 100)}% do salário base médio (${money(c.salary_base_avg, cur)})` : '';
  const bar = COST_CLASS.map(([k, , color]) => `<i style="width:${((c.classes[k]?.avg || 0) / tot * 100).toFixed(1)}%;background:${color}" title="${k}"></i>`).join('');
  const table = (k, label) => {
    const items = (c.classes[k]?.items || []).filter(i => i.avg || i.payments);
    if (!items.length) return '';
    const rows = items.map(i => `<tr><td>${esc(COST_LABEL[i.key] || i.key)}${i.shifted?.length ? ` <span class="fin-chip" title="pagamento do mês seguinte atribuído ao mês anterior: ${esc(i.shifted.join(', '))}">ajustado</span>` : ''}</td>
      ${months.map(m => `<td class="num">${i.months[m] ? money(i.months[m], cur) : '<span class="fin-dim">—</span>'}</td>`).join('')}<td class="num"><b>${money(i.avg, cur)}</b></td></tr>`).join('');
    return `<details class="fin-costd" ${k === 'essencial' ? 'open' : ''}><summary>${esc(label)} · <b>${money(c.classes[k].avg, cur)}</b>/mês</summary>
      <table class="fin-table"><thead><tr><th></th>${months.map(m => `<th class="num">${monthShort(m)}</th>`).join('')}<th class="num">média</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  };
  const fut = c.future_installments || [];
  const ob = (c.open_bill || []).filter(o => o.count);
  const futHtml = `<div class="fin-costf"><div class="fin-card-h">Já contratado no cartão</div>
    ${ob.map(o => `<div>Fatura aberta ${esc(INST[o.account.split(':')[0]] || o.account)}: <b>${money(o.purchases, cur)}</b> em compras desde o último fechamento${o.as_of ? ` <span class="fin-dim">(dados do banco de ${day(o.as_of.slice(0, 10))})</span>` : ''}${o.credits ? `<div class="fin-dim">pagamentos e estornos lançados nela: ${money(o.credits, cur)} (não reduzem o gasto)</div>` : ''}</div>`).join('') || '<div class="fin-dim">sem fatura aberta no Open Finance</div>'}
    ${fut.length ? `<table class="fin-table"><thead><tr><th>Parcelas futuras</th><th class="num">total</th><th>o que</th></tr></thead><tbody>${fut.map(f => `<tr><td>${monthShort(f.month)}</td><td class="num">${money(f.total, cur)}</td><td class="fin-dim">${f.items.map(i => esc(`${i.description} ${i.installment}`)).join(' · ')}</td></tr>`).join('')}</tbody></table>` : '<div class="fin-dim">nenhuma parcela futura</div>'}</div>`;
  host.innerHTML = `<div class="fin-card">
    <div class="fin-card-h">Custo mensal <span class="fin-hint">média de ${monthShort(months[0])}–${monthShort(months[months.length - 1])} (últimos ${months.length} meses fechados) · todas as moedas em R$${c.incomplete_months?.length ? ` · ⚠ dados incompletos em ${c.incomplete_months.map(monthShort).join(', ')}` : ''}</span></div>
    <div class="fin-kpis">
      ${COST_CLASS.map(([k, label, color]) => `<div class="fin-kpi"><div class="fin-kpi-l"><i class="fin-sw" style="background:${color}"></i>${label}</div><div class="fin-kpi-v">${money(c.classes[k]?.avg || 0, cur)}</div><div class="fin-kpi-s">${pct(c.classes[k]?.avg || 0)} do total</div></div>`).join('')}
      <div class="fin-kpi"><div class="fin-kpi-l">Total por mês</div><div class="fin-kpi-v">${money(c.total_avg, cur)}</div><div class="fin-kpi-s">${ofSal.replace(/^ · /, '')}</div></div>
    </div>
    <div class="fin-costbar">${bar}</div>
    <div class="fin-costgrid"><div>${table('essencial', 'Essencial fixo')}${table('assinaturas', 'Assinaturas')}${table('variavel', 'Variável (por grupo)')}</div>${futHtml}</div>
    <div class="fin-dim fin-defs">Essencial fixo = moradia (aluguel, condomínio, luz, água, gás, internet/telefone), seguros e mensalidades; ajuste em <code>data/finance/ledger/cost_classes.json</code>. Pagamento feito no mês seguinte entra no mês a que pertence. Assinaturas = categorias assinaturas:*. Variável = todo o resto, sem transferências entre suas contas, câmbio e aplicações.</div>
  </div>`;
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
  const when = ts => ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const items = (m.pluggy_items || []).map(it => {
    const days = it.consent_expires ? Math.round((new Date(it.consent_expires) - Date.now()) / 864e5) : null;
    return `<span class="fin-chip ${it.status === 'UPDATED' ? 'ok' : 'warn'}" title="autorização vale até ${when(it.consent_expires)}${days !== null ? ` (${days} dias)` : ''}">${esc(INST[it.institution] || it.institution)}: banco atualizado ${when(it.last_updated)}</span>`;
  }).join('');
  const conn = `
    <div class="fin-conn">
      ${m.pluggy_configured ? `${items}<button class="fin-btn fin-sync-pluggy" title="o banco atualiza no Open Finance a cada 24h; isto busca o que já chegou">Atualizar bancos</button>` : '<span class="fin-chip">Open Finance (Meu Pluggy): não configurado</span>'}
      ${m.wise_configured ? '<button class="fin-btn fin-sync-wise">Atualizar Wise</button>' : ''}
      <span class="fin-chip">${(m.files.parsed || 0)} arquivos · ${(m.files.error || 0)} com erro</span>
      ${m.queue ? `<span class="fin-chip warn">${m.queue} na fila de revisão</span>` : ''}
    </div>`;
  const invCards = (m.investments_total || []).map(iv => `
    <div class="fin-acc" data-inv="1" title="ver investimentos">
      <div class="fin-acc-h">${esc(INST[iv.institution] || iv.institution)} · investimentos</div>
      <div class="fin-acc-v">${money(iv.total, iv.currency)}</div>
      <div class="fin-acc-s">${iv.n} posições · em ${day(iv.date)} (Open Finance)</div>
    </div>`).join('');
  pane.innerHTML = `${conn}<div class="fin-costs"><div class="fin-empty">Calculando custo mensal…</div></div><div class="fin-accs">${invCards}${cards}</div><div class="fin-invlist"></div>
    <div class="fin-card"><div class="fin-card-h">Saldo no fim de cada mês <select class="fin-cur"></select><span class="fin-hint">uma moeda por vez; lacunas conhecidas já ajustadas</span></div><div class="fin-chart"></div></div>`;
  pane.querySelector('.fin-sync-pluggy')?.addEventListener('click', async e => {
    e.target.disabled = true;
    e.target.textContent = 'Atualizando…';
    try {
      const r = await fetch(`${API}/sync/pluggy`, { method: 'POST', credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.text()).slice(0, 300));
      const res = await r.json();
      const skipped = res.items.filter(i => i.skipped).length;
      if (skipped === res.items.length) showError('Finanças: os bancos ainda não atualizaram desde a última busca (o Open Finance atualiza a cada 24h).');
      await refreshMeta();
      render();
    } catch (err) { showError(`Open Finance: ${err.message}`); e.target.disabled = false; e.target.textContent = 'Atualizar bancos'; }
  });
  pane.querySelectorAll('[data-inv]').forEach(c => c.addEventListener('click', async () => {
    const host = pane.querySelector('.fin-invlist');
    if (host.innerHTML) { host.innerHTML = ''; return; }
    const { investments } = await get('/investments');
    host.innerHTML = `<div class="fin-card"><div class="fin-card-h">Investimentos (${investments.length}) <span class="fin-hint">posição do último snapshot; o histórico de posição se forma a cada atualização</span></div>
      <table class="fin-table"><thead><tr><th>Instituição</th><th>Tipo</th><th>Nome</th><th>Data</th><th class="num">Saldo</th></tr></thead><tbody>
      ${investments.filter(i => i.balance_cents).map(i => `<tr><td>${esc(INST[i.institution] || i.institution)}</td><td>${esc((i.type || '') + (i.subtype ? ' / ' + i.subtype : ''))}</td><td class="desc">${esc(i.name || '')}</td><td>${day(i.date)}</td><td class="num">${money(i.balance_cents, i.currency)}</td></tr>`).join('')}</tbody></table>
      <div class="fin-dim">${investments.filter(i => !i.balance_cents).length} posições zeradas (resgatadas) ocultas</div></div>`;
  }));
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
  renderCosts(pane.querySelector('.fin-costs')).catch(e => { pane.querySelector('.fin-costs').innerHTML = `<div class="fin-empty">Custo mensal falhou: ${esc(e.message)}</div>`; });
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
      <select class="fin-cur2">${['ALL', 'BRL', 'USD', 'EUR', 'ILS', 'CHF', 'HUF', 'CZK', 'PLN', 'RON', 'GBP'].map(c => `<option value="${c}" ${c === st.cur ? 'selected' : ''}>${c === 'ALL' ? 'Todas (em R$)' : c}</option>`).join('')}</select>
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


// ── aba Mensal ───────────────────────────────────────────────────────────
// paleta categorica validada (dataviz/references/palette.md, passos do modo escuro), ordem fixa
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const OTHER = '#898781';
let tipEl = null;
function tip(e, html) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'fin-tip'; document.body.append(tipEl); }
  if (!html) { tipEl.style.display = 'none'; return; }
  tipEl.innerHTML = html;
  tipEl.style.display = 'block';
  const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${e.clientY + 14}px`;
}
function compact(cents) {
  const v = cents / 100, a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',') + ' mil';
  return v.toFixed(0);
}
function niceTicks(min, max, n = 4) {
  if (min === max) max = min + 1;
  const raw = (max - min) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw);
  const t = [];
  let v = Math.floor(min / step) * step;
  t.push(v);
  while (v < max - step * 0.001) { v += step; t.push(v); }  // ultimo tick sempre >= max (nada estoura o topo)
  return t;
}
function periodLabel(p, group) {
  if (group !== 'month') return p;
  const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(p.slice(5, 7)) - 1];
  return `${m}/${p.slice(2, 4)}`;
}
let ctxBands = [];
function periodMonth(p) {  // primeiro e ultimo AAAA-MM cobertos pelo periodo (mes, trimestre ou ano)
  if (/^\d{4}$/.test(p)) return [p + '-01', p + '-12'];
  const q = p.match(/^(\d{4})-T(\d)$/);
  if (q) { const a = (Number(q[2]) - 1) * 3 + 1; return [`${q[1]}-${String(a).padStart(2, '0')}`, `${q[1]}-${String(a + 2).padStart(2, '0')}`]; }
  return [p, p];
}
function axisFrame(host, periods, vmin, vmax, { H = 230, fmt = compact } = {}) {
  const W = Math.max(host.clientWidth || 900, 360), P = { l: 64, r: 12, t: 10, b: 26 };
  const ticks = niceTicks(Math.min(0, vmin), Math.max(0, vmax));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const y = v => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const band = (W - P.l - P.r) / Math.max(periods.length, 1);
  const xc = i => P.l + band * (i + 0.5);
  const svg = svgEl('svg', { width: W, height: H, class: 'fin-svg' });
  ctxBands.forEach(b => {  // faixa de contexto (ex.: expatriado) atras de tudo
    const idx = periods.map((p, i) => [i, periodMonth(p.period)]).filter(([, [a, z]]) => z >= b.from && a <= b.to).map(([i]) => i);
    if (!idx.length) return;
    const x0 = P.l + band * idx[0], x1 = P.l + band * (idx[idx.length - 1] + 1);
    svg.append(svgEl('rect', { x: x0, y: P.t, width: x1 - x0, height: H - P.t - P.b, class: 'fin-band' }));
    svg.append(svgEl('text', { x: x0 + 4, y: P.t + 11, class: 'fin-band-l' }, b.label));
  });
  let run = null;
  const endRun = i => { if (run !== null) { svg.append(svgEl('rect', { x: P.l + band * run, y: P.t, width: band * (i - run), height: H - P.t - P.b, class: 'fin-nodata' }));
    if (i - run >= 3) svg.append(svgEl('text', { x: P.l + band * (run + (i - run) / 2), y: P.t + 24, 'text-anchor': 'middle', class: 'fin-band-l' }, 'sem dados')); run = null; } };
  periods.forEach((p, i) => { if (p.no_data) { if (run === null) run = i; } else endRun(i); });
  endRun(periods.length);
  ticks.forEach(v => {
    svg.append(svgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: v === 0 ? 'fin-base' : 'fin-grid' }));
    svg.append(svgEl('text', { x: P.l - 6, y: y(v) + 3, 'text-anchor': 'end', class: 'fin-axis' }, fmt(v)));
  });
  const step = Math.max(1, Math.ceil(periods.length / Math.floor((W - P.l) / 52)));
  periods.forEach((p, i) => { if (i % step === 0) svg.append(svgEl('text', { x: xc(i), y: H - 8, 'text-anchor': 'middle', class: 'fin-axis' }, periodLabel(p.period, st.mGroup))); });
  return { svg, y, xc, band, W, H, P };
}
function roundedBar(x, w, y0, y1, color, cls) {
  // 4px arredondado na ponta do dado, reto na linha de base
  const top = Math.min(y0, y1), h = Math.abs(y1 - y0), r = Math.min(4, h, w / 2), up = y1 < y0;
  const d = up
    ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y0} Z`
    : `M${x},${y0} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + w - r} Q${x + w},${top + h} ${x + w},${top + h - r} V${y0} Z`;
  return svgEl('path', { d, fill: color, class: cls || 'fin-bar' });
}
function legend(items) {
  return `<div class="fin-legend">${items.map(([label, color, kind]) => `<span><i class="${kind === 'line' ? 'ln' : ''}" style="background:${color}"></i>${esc(label)}</span>`).join('')}</div>`;
}
function hitColumns(svg, f, periods, onTip) {
  periods.forEach((p, i) => {
    const r = svgEl('rect', { x: f.xc(i) - f.band / 2, y: f.P.t, width: f.band, height: f.H - f.P.t - f.P.b, fill: 'transparent', tabindex: 0 });
    r.addEventListener('pointermove', e => tip(e, onTip(p)));
    r.addEventListener('pointerleave', () => tip(null));
    r.addEventListener('focus', e => { const b = r.getBoundingClientRect(); tip({ clientX: b.x + b.width / 2, clientY: b.y + 20 }, onTip(p)); });
    r.addEventListener('blur', () => tip(null));
    svg.append(r);
  });
}
const tipRow = (label, value, color) => `<div class="fin-tip-r">${color ? `<i style="background:${color}"></i>` : ''}<b>${value}</b><span>${esc(label)}</span></div>`;
const tipHead = p => `<div class="fin-tip-h">${esc(periodLabel(p.period, st.mGroup))}${p.no_data ? ' · sem dados (falta extrato)' : ''}${p.partial ? ' · parcial (dados até ' + day(p.last_date) + ')' : ''}${p.incomplete ? ' · ⚠ dados incompletos' : ''}</div>`;

function chartIncomeExpense(host, periods, cur) {
  const vals = periods.flatMap(p => [p.income, p.expenses, p.net]);
  const f = axisFrame(host, periods, Math.min(...vals), Math.max(...vals));
  const bw = Math.min(24, (f.band - 8) / 2 - 1);
  periods.forEach((p, i) => {
    const op = p.incomplete || p.partial ? 0.45 : 1;
    [[p.income, SERIES[0], -1], [p.expenses, SERIES[1], 1]].forEach(([v, c, side]) => {
      if (!v) return;
      const x = side < 0 ? f.xc(i) - bw - 1 : f.xc(i) + 1;
      const b = roundedBar(x, bw, f.y(0), f.y(v), c); b.setAttribute('opacity', op); f.svg.append(b);
    });
  });
  let seg = [];
  const flush = () => { if (seg.length > 1) f.svg.append(svgEl('polyline', { points: seg.join(' '), fill: 'none', stroke: 'var(--fin-ink2)', 'stroke-width': 2, 'stroke-linejoin': 'round' })); seg = []; };
  periods.forEach((p, i) => { if (p.no_data) flush(); else seg.push(`${f.xc(i).toFixed(1)},${f.y(p.net).toFixed(1)}`); });
  flush();
  hitColumns(f.svg, f, periods, p => tipHead(p) + tipRow('ganhos', money(p.income, cur), SERIES[0]) + tipRow('gastos', money(p.expenses, cur), SERIES[1])
    + tipRow('saldo do período', money(p.net, cur)) + (p.savings_rate !== null ? tipRow('taxa de poupança', (p.savings_rate * 100).toFixed(0) + '%') : ''));
  host.innerHTML = '';
  host.append(f.svg);
  host.insertAdjacentHTML('beforeend', legend([['Ganhos', SERIES[0]], ['Gastos', SERIES[1]], ['Saldo (ganhos − gastos)', 'var(--fin-ink2)', 'line']]));
}

function chartLine(host, periods, key, color, cur, { label, fmt = compact, tipFmt, extra, area = true } = {}) {
  // formato do tooltip e explicito por grafico (nada de adivinhar pelo nome do campo)
  const tf = tipFmt || (v => money(v, cur));
  const pts = periods.map((p, i) => [i, p[key]]).filter(([, v]) => v !== null && v !== undefined);
  if (!pts.length) { host.innerHTML = '<div class="fin-empty">Sem dados no período.</div>'; return; }
  const vals = pts.map(([, v]) => v).concat(extra ? periods.map(p => p[extra.key]).filter(v => v !== null && v !== undefined) : []);
  const f = axisFrame(host, periods, Math.min(...vals), Math.max(...vals), { fmt });
  // linha interrompida onde nao ha dado (nunca liga os dois lados de um buraco)
  const segments = k => {
    const out = []; let cur = [];
    periods.forEach((p, i) => {
      const v = p[k];
      if (v === null || v === undefined) { if (cur.length) out.push(cur); cur = []; } else cur.push([i, v]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const toPts = seg => seg.map(([i, v]) => `${f.xc(i).toFixed(1)},${f.y(v).toFixed(1)}`).join(' ');
  segments(key).forEach(seg => {
    if (area && seg.length > 1) f.svg.append(svgEl('polygon', { points: `${f.xc(seg[0][0])},${f.y(0)} ${toPts(seg)} ${f.xc(seg[seg.length - 1][0])},${f.y(0)}`, fill: color, opacity: 0.1 }));
  });
  if (extra) segments(extra.key).forEach(seg => f.svg.append(svgEl('polyline', { points: toPts(seg), fill: 'none', stroke: extra.color, 'stroke-width': 2, 'stroke-linejoin': 'round' })));
  segments(key).forEach(seg => {
    if (seg.length === 1) f.svg.append(svgEl('circle', { cx: f.xc(seg[0][0]), cy: f.y(seg[0][1]), r: 3, fill: color }));
    else f.svg.append(svgEl('polyline', { points: toPts(seg), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  });
  const [li, lv] = pts[pts.length - 1];
  f.svg.append(svgEl('circle', { cx: f.xc(li), cy: f.y(lv), r: 4, fill: color, stroke: 'var(--fin-surface)', 'stroke-width': 2 }));
  f.svg.append(svgEl('text', { x: Math.min(f.xc(li) + 7, f.W - 4), y: f.y(lv) - 7, 'text-anchor': f.xc(li) > f.W - 80 ? 'end' : 'start', class: 'fin-endlabel' }, fmt(lv)));
  hitColumns(f.svg, f, periods, p => tipHead(p) + tipRow(label, p[key] === null || p[key] === undefined ? '—' : tf(p[key]), color)
    + (extra && p[extra.key] !== null ? tipRow(extra.label, extra.fmtTip(p[extra.key]), extra.color) : ''));
  host.innerHTML = '';
  host.append(f.svg);
  if (extra) host.insertAdjacentHTML('beforeend', legend([[label, color, 'line'], [extra.label, extra.color, 'line']]));
}

function chartStacked(host, periods, groups, cur) {
  const top = groups.slice(0, 7), colorOf = g => top.includes(g) ? SERIES[top.indexOf(g)] : OTHER;
  const segs = periods.map(p => {
    const rows = top.map(g => [g, Math.max(0, p.by_group[g] || 0)]);
    const other = Object.entries(p.by_group).filter(([g]) => !top.includes(g)).reduce((a, [, v]) => a + Math.max(0, v), 0);
    return other ? rows.concat([['outros', other]]) : rows;
  });
  const f = axisFrame(host, periods, 0, Math.max(1, ...segs.map(r => r.reduce((a, [, v]) => a + v, 0))));
  const bw = Math.min(24, f.band - 6);
  segs.forEach((rows, i) => {
    let acc = 0;
    const live = rows.filter(([, v]) => v > 0);
    live.forEach(([g, v], k) => {
      const y0 = f.y(acc), y1 = f.y(acc + v);
      const isTop = k === live.length - 1;
      const el = isTop ? roundedBar(f.xc(i) - bw / 2, bw, y0, y1 + 0, colorOf(g)) : svgEl('rect', { x: f.xc(i) - bw / 2, y: y1, width: bw, height: Math.max(0, y0 - y1 - 2), fill: colorOf(g) });
      if (periods[i].incomplete || periods[i].partial) el.setAttribute('opacity', 0.45);
      f.svg.append(el);
      acc += v;
    });
  });
  hitColumns(f.svg, f, periods, p => {
    const i = periods.indexOf(p);
    return tipHead(p) + segs[i].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([g, v]) => tipRow(g, money(v, cur), colorOf(g))).join('');
  });
  host.innerHTML = '';
  host.append(f.svg);
  host.insertAdjacentHTML('beforeend', legend(top.map(g => [g, colorOf(g)]).concat(groups.length > 7 ? [['outros', OTHER]] : [])));
}

const SAL_PARTS = [  // ordem fixa = cores fixas (slots 1-4 da paleta validada)
  ['salary_base', 'salário base', SERIES[0]],
  ['salary_13', '13º (estimado)', SERIES[1]],
  ['salary_other', 'férias/outros (estimado)', SERIES[2]],
  ['salary_extra', 'adicional de expatriação', SERIES[3]],
];
function chartSalary(host, periods, cur) {
  const total = p => SAL_PARTS.reduce((a, [k]) => a + (p[k] || 0), 0);
  const f = axisFrame(host, periods, 0, Math.max(1, ...periods.map(total)));
  const bw = Math.min(24, f.band - 6);
  periods.forEach((p, i) => {
    const parts = SAL_PARTS.filter(([k]) => (p[k] || 0) > 0);
    let acc = 0;
    parts.forEach(([k, , color], j) => {
      const v = p[k], y0 = f.y(acc) - (j ? 2 : 0), y1 = f.y(acc + v);
      const el = j === parts.length - 1 ? roundedBar(f.xc(i) - bw / 2, bw, y0, y1, color)
        : svgEl('rect', { x: f.xc(i) - bw / 2, y: y1, width: bw, height: Math.max(0, y0 - y1), fill: color });
      if (p.partial) el.setAttribute('opacity', 0.45);
      f.svg.append(el);
      acc += v;
    });
  });
  hitColumns(f.svg, f, periods, p => tipHead(p) + SAL_PARTS.filter(([k]) => p[k]).map(([k, l, c]) => tipRow(l, money(p[k], cur), c)).join('')
    + (total(p) ? tipRow('total', money(total(p), cur)) : ''));
  host.innerHTML = '';
  host.append(f.svg);
  const used = SAL_PARTS.filter(([k]) => periods.some(p => p[k]));
  if (used.length > 1) host.insertAdjacentHTML('beforeend', legend(used.map(([, l, c]) => [l, c])));
}

function kpi(label, value, sub) {
  return `<div class="fin-kpi"><div class="fin-kpi-l">${esc(label)}</div><div class="fin-kpi-v">${value}</div><div class="fin-kpi-s">${sub || ''}</div></div>`;
}

async function renderMonthly(pane) {
  const last = (st.meta.accounts.filter(a => st.cur === 'ALL' || a.currency === st.cur).map(a => a.last).sort().pop() || new Date().toISOString()).slice(0, 10);
  const an = new Date(last + 'T12:00:00');
  const from = st.mPeriod === 'all' ? '' : new Date(an.getFullYear(), an.getMonth() - Number(st.mPeriod) + 1, 1).toISOString().slice(0, 10);
  const q = new URLSearchParams({ currency: st.cur, from, group: st.mGroup, people: st.mPeople ? 'true' : 'false' });
  const d = await get(`/monthly?${q}`);
  const P = d.periods, cur = st.cur;
  ctxBands = d.context || [];
  const periods = [['12', '12 meses'], ['24', '24 meses'], ['36', '3 anos'], ['60', '5 anos'], ['all', 'tudo']];
  const curs = ['ALL', ...[...new Set(st.meta.accounts.map(a => a.currency))].sort((a, b) => (a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b)))];
  const filters = `<div class="fin-filters">${periods.map(([v, l]) => `<button class="fin-btn ${st.mPeriod === v ? 'active' : ''}" data-mp="${v}">${l}</button>`).join('')}
      <select class="fin-mg"><option value="month" ${st.mGroup === 'month' ? 'selected' : ''}>por mês</option><option value="quarter" ${st.mGroup === 'quarter' ? 'selected' : ''}>por trimestre</option><option value="year" ${st.mGroup === 'year' ? 'selected' : ''}>por ano</option></select>
      <select class="fin-mc" title="Todas = cada lançamento convertido para R$ pela cotação do BCE do dia; saldos pela do fim do mês">${curs.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c === 'ALL' ? 'Todas (em R$)' : c}</option>`).join('')}</select>
      <label title="Pix/TED/DOC com pessoas (transferencias:pessoas): enviados contam como gasto, recebidos como ganho"><input type="checkbox" class="fin-mpp" ${st.mPeople ? 'checked' : ''}> contar Pix/TED com pessoas</label>
      <span class="fin-f-sum">${from ? 'desde ' + day(from) : 'todo o histórico'} até o último dado (${day(last)})</span></div>`;
  if (!P.length) { pane.innerHTML = filters + '<div class="fin-empty">Sem dados nessa moeda/período.</div>'; bindM(); return; }
  // KPIs usam so periodos completos (o ultimo mes costuma ter poucos dias de dado)
  const full = P.filter(p => !p.partial && !p.no_data).length ? P.filter(p => !p.partial && !p.no_data) : P;
  const lastP = full[full.length - 1], window12 = full.slice(-Math.min(full.length, st.mGroup === 'month' ? 12 : st.mGroup === 'quarter' ? 4 : 1));
  const sum = k => window12.reduce((a, p) => a + (p[k] || 0), 0);
  const months12 = window12.reduce((a, p) => a + (p.data_months ?? p.months), 0) || 1;  // media so sobre meses com dado
  const nwStart = P.find(p => p.net_worth !== null);
  const incomeAvg = sum('income') / months12, expAvg = sum('expenses') / months12, sr = sum('income') > 0 ? (sum('income') - sum('expenses')) / sum('income') : null;
  const nwLast = lastP.net_worth, nwDelta = nwStart && nwLast !== null ? nwLast - nwStart.net_worth : null;
  const incompleteN = P.filter(p => p.incomplete).length;
  const kpis = `<div class="fin-kpis">
    ${kpi('Patrimônio', money(lastP.nw_plus, cur), `contas − cartão ${money(nwLast, cur)} + investimentos ${money(lastP.investments ?? lastP.invested, cur)}${lastP.investments_source === 'estimado' ? '*' : ''}${nwDelta !== null ? ` · contas ${nwDelta >= 0 ? '▲' : '▼'} ${money(Math.abs(nwDelta), cur)} no período` : ''}`)}
    ${kpi('Ganhos / mês', money(Math.round(incomeAvg), cur), `média dos últimos ${months12} meses`)}
    ${kpi('Gastos / mês', money(Math.round(expAvg), cur), `média dos últimos ${months12} meses`)}
    ${kpi('Taxa de poupança', sr === null ? '—' : (sr * 100).toFixed(0) + '%', 'referência comum: 15–20%')}
    ${kpi('Salário (base)', money(lastP.salary_base, cur), `${esc(periodLabel(lastP.period, st.mGroup))} · base média ${money(Math.round(sum('salary_base') / months12), cur)}/mês · 13º+extras+adicional ${money(sum('salary_13') + sum('salary_other') + sum('salary_extra'), cur)} em ${months12} meses`)}
    ${kpi('Reserva', lastP.reserve_months === null ? '—' : lastP.reserve_months.toFixed(1).replace('.', ',') + ' meses', 'patrimônio / gasto médio de 6 meses · ref. 3–6')}
  </div>`;
  const warn = incompleteN ? `<div class="fin-note">⚠ ${incompleteN} período(s) com dados incompletos (barras apagadas): houve transferência entre suas contas sem o extrato/fatura do outro lado — o gasto de cartão desses meses pode estar faltando. Ver Auditoria.</div>` : '';
  const table = `<details class="fin-card"><summary class="fin-card-h">Tabela (${P.length} períodos) <button class="fin-btn fin-csv">baixar CSV</button></summary>
    <table class="fin-table"><thead><tr><th>Período</th><th class="num">Ganhos</th><th class="num">Salário base</th><th class="num">13º*</th><th class="num">Férias/outros*</th><th class="num">Adicional</th><th class="num">Gastos</th><th class="num">fixos</th><th class="num">variáveis</th><th class="num">Saldo</th><th class="num">Poupança</th><th class="num">Patrimônio</th><th class="num">Investido</th><th class="num">Reserva</th><th></th></tr></thead><tbody>
    ${P.slice().reverse().filter(p => !p.no_data).map(p => `<tr><td>${esc(periodLabel(p.period, st.mGroup))}</td><td class="num">${money(p.income, cur)}</td><td class="num">${money(p.salary_base, cur)}</td><td class="num">${p.salary_13 ? money(p.salary_13, cur) : ''}</td><td class="num">${p.salary_other ? money(p.salary_other, cur) : ''}</td><td class="num">${p.salary_extra ? money(p.salary_extra, cur) : ''}</td><td class="num">${money(p.expenses, cur)}</td><td class="num">${money(p.fixed, cur)}</td><td class="num">${money(p.variable, cur)}</td><td class="num ${p.net < 0 ? 'neg' : ''}">${money(p.net, cur)}</td><td class="num">${p.savings_rate === null ? '—' : (p.savings_rate * 100).toFixed(0) + '%'}</td><td class="num">${money(p.net_worth, cur)}</td><td class="num">${money(p.investments ?? p.invested, cur)}${p.investments_source === 'estimado' ? '*' : ''}</td><td class="num">${p.reserve_months === null ? '—' : p.reserve_months.toFixed(1)}</td><td>${p.partial ? '<span title="período parcial">½</span> ' : ''}${p.incomplete ? '⚠' : ''}${p.card_known ? '' : ' <span title="sem fatura de cartão recente: dívida do cartão desconhecida">💳?</span>'}</td></tr>`).join('')}</tbody></table></details>`;
  pane.innerHTML = `${filters}${kpis}${warn}
    <div class="fin-card"><div class="fin-card-h">Ganhos × gastos <span class="fin-hint">transferências entre suas contas, câmbio e aplicações não contam</span></div><div class="fin-ch-ie"></div></div>
    <div class="fin-grid2">
      <div class="fin-card"><div class="fin-card-h">Patrimônio <span class="fin-hint">saldo das contas − cartão, fim do período</span></div><div class="fin-ch-nw"></div></div>
      <div class="fin-card"><div class="fin-card-h">Salário <span class="fin-hint">13º e extras estimados pelo padrão de depósitos (o holerite daria o exato)</span></div><div class="fin-ch-sal"></div></div>
    </div>
    <div class="fin-grid2">
      <div class="fin-card"><div class="fin-card-h">Gastos por grupo</div><div class="fin-ch-st"></div></div>
      <div class="fin-card"><div class="fin-card-h">Taxa de poupança <span class="fin-hint">(ganhos − gastos) ÷ ganhos</span></div><div class="fin-ch-sr"></div></div>
    </div>
    ${table}
    <div class="fin-dim fin-defs">* <b>Investido estimado</b>: antes do primeiro snapshot do Open Finance, soma do que foi para caixinhas/RDB/IPO, sem rendimento. A partir dele, saldo real dos investimentos. Patrimônio soma só contas na moeda escolhida: dinheiro convertido para o Wise sai do total em BRL e aparece na moeda dele.</div>`;
  chartIncomeExpense(pane.querySelector('.fin-ch-ie'), P, cur);
  chartLine(pane.querySelector('.fin-ch-nw'), P, 'net_worth', SERIES[0], cur, { label: 'patrimônio',
    extra: { key: 'nw_plus', label: 'com investimentos (* estimado antes do Open Finance)', color: SERIES[2], fmtTip: v => money(v, cur) } });
  chartSalary(pane.querySelector('.fin-ch-sal'), P, cur);
  chartStacked(pane.querySelector('.fin-ch-st'), P, d.groups, cur);
  chartLine(pane.querySelector('.fin-ch-sr'), P.map(p => ({ ...p, sr100: p.savings_rate === null ? null : Math.round(p.savings_rate * 10000) })), 'sr100', SERIES[0], cur,
    { label: 'taxa de poupança', fmt: v => (v / 100).toFixed(0) + '%', tipFmt: v => (v / 100).toFixed(0) + '%', area: false });
  pane.querySelector('.fin-csv').addEventListener('click', e => {
    e.preventDefault();
    const head = ['periodo', 'ganhos', 'salario_base', 'decimo_terceiro_est', 'ferias_outros_est', 'adicional', 'gastos', 'fixos', 'variaveis', 'saldo', 'taxa_poupanca_pct', 'patrimonio', 'aplicado', 'reserva_meses', 'incompleto'];
    const csv = [head.join(';')].concat(P.map(p => [p.period, p.income, p.salary_base, p.salary_13, p.salary_other, p.salary_extra, p.expenses, p.fixed, p.variable, p.net, p.savings_rate === null ? '' : Math.round(p.savings_rate * 1000) / 10, p.net_worth ?? '', p.investments ?? p.invested, p.reserve_months ?? '', p.incomplete ? 1 : 0]
      .map((v, i) => (i >= 1 && i <= 9) || i === 11 || i === 12 ? (v === '' ? '' : (v / 100).toFixed(2).replace('.', ',')) : String(v).replace('.', ',')).join(';'))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `financas-${cur}-${st.mGroup}.csv`;
    a.click();
  });
  bindM();
  function bindM() {
    pane.querySelectorAll('[data-mp]').forEach(b => b.addEventListener('click', () => { st.mPeriod = b.dataset.mp; render(); }));
    pane.querySelector('.fin-mg')?.addEventListener('change', e => { st.mGroup = e.target.value; render(); });
    pane.querySelector('.fin-mc')?.addEventListener('change', e => { st.cur = e.target.value; render(); });
    pane.querySelector('.fin-mpp')?.addEventListener('change', e => { st.mPeople = e.target.checked; render(); });
  }
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

const TABS = { overview: ['Visão geral', renderOverview], monthly: ['Mensal', renderMonthly], categories: ['Categorias', renderCategories], transactions: ['Transações', renderTransactions], audit: ['Auditoria', renderAudit], files: ['Arquivos', renderFiles] };

function switchTab(tab) { st.tab = tab; try { localStorage.setItem('odysseus-fin-tab', tab); } catch (_) {} render(); }

async function render() {
  if (!els.body) return;
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = els.body;
  if (!pane.children.length) pane.innerHTML = '<div class="fin-empty">Carregando…</div>';
  pane.style.opacity = '0.55';  // segura o desenho anterior enquanto carrega (sem piscar)
  try {
    if (!st.meta?.available && st.tab !== 'files') {
      pane.innerHTML = '<div class="fin-empty">Nenhum dado ainda. Importe arquivos na aba Arquivos.</div>';
      return;
    }
    await TABS[st.tab][1](pane);
  } catch (e) {
    pane.innerHTML = `<div class="fin-empty">Falhou: ${esc(e.message)}</div>`;
  } finally {
    pane.style.opacity = '';
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
