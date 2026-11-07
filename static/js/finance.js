// static/js/finance.js — app "Finances" do hub Life (fork-local, ver LOCAL_CHANGES.md §7); sem janela própria:
// `mountFinances(host, hub)` desenha dentro do host do hub, com UI em inglês.
//
// Le /api/finance/* (routes/finance_routes.py): contas com saldo e conferencia,
// livro canonico com as fontes de cada transacao, auditoria (quebras de saldo,
// faturas, fila de revisao, erros de import) e os arquivos brutos (baixaveis
// exatamente como entraram). Graficos em SVG proprio (o CSP nao libera CDN).
import { showError, esc } from './ui.js?v=20260916largetoolscroll1';
import { topPortalZ } from './toolWindowZOrder.js';
import { isIsoDate, lifeHref } from './life/router.js';

const API = '/api/finance';
const PALETTE = ['#59c2ff', '#ffb454', '#7fd962', '#f07178', '#c792ea', '#2ec4b6', '#ff8f40', '#e6e16b', '#ff6ac1', '#8d9eff'];
const INST = { nubank: 'Nubank', santander: 'Santander', wise: 'Wise', caixa: 'Caixa' };
const KIND = { checking: 'account', credit_card: 'card', wallet: 'wallet' };
const IMPORTER = {
  ofx: 'OFX', wise_csv: 'Wise CSV', santander_cc_pdf: 'PDF statement', nubank_fatura_pdf: 'PDF invoice',
  santander_csv: 'spreadsheet', santander_fatura_pdf: 'PDF invoice', santander_cc_ocr: 'OCR statement', pluggy: 'Open Finance',
};

const st = { mPeriod: '24', mGroup: 'month', mPeople: true, cur: 'ALL', balCur: 'BRL', category: '', catPeriod: '12', withTransfers: false, tab: 'overview', meta: null, account: '', q: '', from: '', to: '', offset: 0 };
let els = {};
let hubRef = null;  // hub do Life (navegação entre abas); definido em mountFinances

// ── util ────────────────────────────────────────────────────────────────
function money(cents, cur = 'BRL') {
  if (cents === null || cents === undefined) return '—';
  if (cur === 'ALL') cur = 'BRL';  // agregado: tudo convertido para reais
  const v = cents / 100;
  try {
    // "R$ 1,234.56" / "−R$ 12.00": símbolo + espaço, milhar em vírgula (en-US); dólar como US$
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).formatToParts(Math.abs(v));
    const sym = cur === 'USD' ? 'US$' : parts.find(x => x.type === 'currency')?.value || cur;
    const num = parts.filter(x => ['integer', 'group', 'decimal', 'fraction'].includes(x.type)).map(x => x.value).join('');
    return `${v < 0 ? '−' : ''}${sym} ${num}`;
  } catch (_) { return `${v.toFixed(2)} ${cur}`; }
}
function day(d) { return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''; }
// data de uma transação: link que abre o dia no Diary
function dayLink(d) {
  if (!d) return '';
  const iso = String(d).slice(0, 10);
  return `<a class="fin-daylink" href="${esc(lifeHref('diary', [iso]))}" title="Open this day in Diary">${esc(day(iso))}</a>`;
}
// dd/mm/yyyy hh:mm
function stamp(ts) {
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(', ', ' ');
}
function accLabel(a) { return `${INST[a.institution] || a.institution} · ${KIND[a.kind] || a.kind}${a.kind === 'wallet' ? ' ' + a.currency : ''}`; }
function accByKey(k) { return (st.meta?.accounts || []).find(a => a.key === k); }
// `timeout` (ms) só no /meta: a montagem espera por ele e, com o servidor travado, seguraria a fila do hub
async function get(path, { timeout = 0 } = {}) {
  try {
    const r = await fetch(`${API}${path}`, { credentials: 'same-origin', ...(timeout ? { signal: AbortSignal.timeout(timeout) } : {}) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error('the server did not answer in time');
    throw e;
  }
}
function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
function statusChip(a) {
  if (a.status === 'ok') return '<span class="fin-chip ok" title="every balance printed by the source matches">matches</span>';
  if (a.status === 'sem_checkpoint') return '<span class="fin-chip" title="the source prints no balance to check against">no balance to check</span>';
  return `<span class="fin-chip warn" title="see the Audit tab">${a.problems} item(s) to review</span>`;
}

// ── gráfico de linhas (saldo de fim de mês por conta) ────────────────────
function lineChart(host, series) {
  const keys = Object.keys(series);
  if (!keys.length) { host.innerHTML = '<div class="fin-empty">No balance series.</div>'; return; }
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
    svg.append(svgEl('text', { x: P.l - 6, y: y(v) + 3, 'text-anchor': 'end', class: 'fin-axis' }, (v / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })));
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


// ── custo mensal (aba Overview) ──────────────────────────────────────────
const COST_LABEL = {
  'moradia:aluguel': 'Aluguel', 'moradia:condominio': 'Condomínio', 'moradia:energia': 'Luz', 'moradia:agua': 'Água', 'moradia:gas': 'Gás',
  'moradia:telefone-internet': 'Internet e telefone', 'moradia:contas': 'Outras contas da casa', 'financeiro:seguros': 'Seguros',
  'saude:plano': 'Plano de saúde', 'educacao:mensalidade': 'Mensalidade (educação)',
  'moradia:rateio': 'Rateio (parte que outra pessoa paga)',
};
const SUB_GROUP = { 'assinaturas:ia': 'IA', 'assinaturas:streaming': 'Streaming', 'assinaturas:rpg': 'RPG', 'assinaturas:armazenamento': 'Armazenamento',
  'assinaturas:workout': 'Workout', 'assinaturas:outros': 'Outros' };
const SUB_LABEL = {
  'anthropic claude sub': 'Claude (Anthropic)', 'openai chatgpt subscr': 'ChatGPT', 'github inc': 'GitHub', 'cursor ai powered ide': 'Cursor',
  'google globoplay': 'Globoplay', 'amazon prime canais': 'Prime Video Canais', 'amazonprimebr': 'Amazon Prime', 'spotify': 'Spotify',
  'google youtubepremium': 'YouTube Premium', 'supabase': 'Supabase', 'patreon membership': 'Patreon', 'google pocket bard': 'Pocket Bard',
  'herofrg subscription': 'Hero Forge', 'dropbox': 'Dropbox', 'google one': 'Google One', 'google workout traine': 'Workout Trainer',
  'google linkedin commu': 'LinkedIn', 'discord nitromonthly': 'Discord Nitro', 'paddle net nexusmods': 'Nexus Mods',
  'paddle net adblckplus': 'Adblock Plus', 'obsidian': 'Obsidian',
};
const COST_CLASS = [['essencial', 'Fixed essentials', SERIES_C(0)], ['assinaturas', 'Subscriptions', SERIES_C(1)], ['variavel', 'Variable', SERIES_C(2)]];
function SERIES_C(i) { return ['#3987e5', '#d95926', '#199e70'][i]; }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthShort(m) { return `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`; }

async function renderCosts(host) {
  const c = await get(`/costs?currency=ALL`);
  const tot = c.total_avg || 1, cur = 'BRL';
  const months = c.months;
  const pct = v => `${Math.round((v / tot) * 100)}%`;
  const ofSal = c.salary_base_avg ? ` · ${Math.round((c.total_avg / c.salary_base_avg) * 100)}% of average base salary (${money(c.salary_base_avg, cur)})` : '';
  const bar = COST_CLASS.map(([k, , color]) => `<i style="width:${((c.classes[k]?.avg || 0) / tot * 100).toFixed(1)}%;background:${color}" title="${k}"></i>`).join('');
  const row = i => `<tr><td>${esc(COST_LABEL[i.key] || SUB_LABEL[i.key] || i.key)}${i.shifted?.length ? ` <span class="fin-chip" title="next month's payment assigned to the previous month: ${esc(i.shifted.join(', '))}">adjusted</span>` : ''}${i.annual ? ` <span class="fin-chip" title="annual charge of ${money(i.annual.last_amount, cur)} on ${day(i.annual.last_charge)}, divided by 12">annual</span>` : ''}</td>
      ${months.map(m => `<td class="num">${i.months[m] ? money(i.months[m], cur) : '<span class="fin-dim">—</span>'}</td>`).join('')}<td class="num"><b>${money(i.avg, cur)}</b></td></tr>`;
  const table = (k, label) => {
    const items = (c.classes[k]?.items || []).filter(i => i.avg || i.payments);
    if (!items.length) return '';
    let rows;
    if (k === 'assinaturas') {  // agrupado: IA, Streaming, RPG, Armazenamento, Workout, Outros (rótulos de SUB_GROUP = dados)
      const by = {};
      items.forEach(i => { (by[i.category || 'assinaturas:outros'] ||= []).push(i); });
      rows = Object.entries(c.classes[k].groups || {}).filter(([g]) => by[g]).map(([g, v]) =>
        `<tr class="fin-subh"><td colspan="${months.length + 1}">${esc(SUB_GROUP[g] || g.split(':').pop())}</td><td class="num"><b>${money(v, cur)}</b></td></tr>${by[g].map(row).join('')}`).join('');
    } else rows = items.map(row).join('');
    return `<details class="fin-costd" ${k === 'essencial' ? 'open' : ''}><summary>${esc(label)} · <b>${money(c.classes[k].avg, cur)}</b>/mo</summary>
      <table class="fin-table"><thead><tr><th></th>${months.map(m => `<th class="num">${monthShort(m)}</th>`).join('')}<th class="num">avg</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  };
  const fut = c.future_installments || [];
  const ob = (c.open_bill || []).filter(o => o.count);
  const futHtml = `<div class="fin-costf"><div class="fin-card-h">Already committed on the card</div>
    ${ob.map(o => `<div>Open bill ${esc(INST[o.account.split(':')[0]] || o.account)}: <b>${money(o.purchases, cur)}</b> in purchases since the last closing${o.as_of ? ` <span class="fin-dim">(bank data from ${day(o.as_of.slice(0, 10))})</span>` : ''}${o.credits ? `<div class="fin-dim">payments and refunds posted to it: ${money(o.credits, cur)} (they do not reduce spending)</div>` : ''}</div>`).join('') || '<div class="fin-dim">no open bill in Open Finance</div>'}
    ${fut.length ? `<table class="fin-table"><thead><tr><th>Future instalments</th><th class="num">total</th><th>what</th></tr></thead><tbody>${fut.map(f => `<tr><td>${monthShort(f.month)}</td><td class="num">${money(f.total, cur)}</td><td class="fin-dim">${f.items.map(i => esc(`${i.description} ${i.installment}`)).join(' · ')}</td></tr>`).join('')}</tbody></table>` : '<div class="fin-dim">no future instalments</div>'}</div>`;
  host.innerHTML = `<div class="fin-card">
    <div class="fin-card-h">Monthly cost <span class="fin-hint">average of ${monthShort(months[0])}–${monthShort(months[months.length - 1])} (last ${months.length} closed months) · all currencies in R$${c.incomplete_months?.length ? ` · ⚠ incomplete data in ${c.incomplete_months.map(monthShort).join(', ')}` : ''}</span></div>
    <div class="fin-kpis">
      ${COST_CLASS.map(([k, label, color]) => `<div class="fin-kpi"><div class="fin-kpi-l"><i class="fin-sw" style="background:${color}"></i>${label}</div><div class="fin-kpi-v">${money(c.classes[k]?.avg || 0, cur)}</div><div class="fin-kpi-s">${pct(c.classes[k]?.avg || 0)} of total</div></div>`).join('')}
      <div class="fin-kpi"><div class="fin-kpi-l">Total cost per month</div><div class="fin-kpi-v">${money(c.total_avg, cur)}</div><div class="fin-kpi-s">${ofSal.replace(/^ · /, '')}</div></div>
      <div class="fin-kpi"><div class="fin-kpi-l"><i class="fin-sw" style="background:#c98500"></i>Saved per month</div><div class="fin-kpi-v">${money(c.savings?.avg || 0, cur)}</div><div class="fin-kpi-s">savings pots/CDB/investments: invested − redeemed</div></div>
    </div>
    ${c.income_avg ? (() => {
      const parts = [['essentials', c.classes.essencial?.avg || 0, SERIES_C(0)], ['subscriptions', c.classes.assinaturas?.avg || 0, SERIES_C(1)],
        ['variable', c.classes.variavel?.avg || 0, SERIES_C(2)], ['saved', Math.max(0, c.savings?.avg || 0), '#c98500'],
        ['left over', Math.max(0, c.leftover_avg || 0), '#898781']];
      const base = Math.max(c.income_avg, parts.reduce((a, [, v]) => a + v, 0)) || 1;
      return `<div class="fin-alloc"><b>Where the income goes</b> (average earnings ${money(c.income_avg, cur)}/month):
        ${parts.filter(([, v]) => v).map(([l, v]) => `${l} ${money(v, cur)}`).join(' · ')}${c.leftover_avg < 0 ? ` · <span class="neg">short by ${money(-c.leftover_avg, cur)}/month (more went out than came in)</span>` : ''}</div>
        <div class="fin-costbar">${parts.filter(([, v]) => v).map(([l, v, col]) => `<i style="width:${(v / base * 100).toFixed(1)}%;background:${col}" title="${l}: ${money(v, cur)}"></i>`).join('')}</div>`;
    })() : `<div class="fin-costbar">${bar}</div>`}
    <div class="fin-costgrid"><div>${table('essencial', 'Fixed essentials')}${table('assinaturas', 'Subscriptions')}${table('variavel', 'Variable (by group)')}</div>${futHtml}</div>
    <div class="fin-dim fin-defs">Saved = investments minus redemptions in savings pots/CDB/RDB over the period (not a cost). Fixed essentials = housing (rent, building fees, electricity, water, gas, internet/phone), insurance and tuition; adjust in <code>data/finance/ledger/cost_classes.json</code>. A payment made the following month counts in the month it belongs to. Subscriptions = categories assinaturas:*. Variable = everything else, excluding transfers between your accounts, currency exchange and investments.</div>
  </div>`;
}

// ── abas ────────────────────────────────────────────────────────────────
async function renderOverview(pane) {
  const m = st.meta;
  const card = a => `
    <div class="fin-acc" data-acc="${esc(a.key)}" title="see transactions">
      <div class="fin-acc-h">${esc(accLabel(a))} ${statusChip(a)}</div>
      <div class="fin-acc-v ${a.balance < 0 ? 'neg' : ''}">${money(a.balance, a.currency)}</div>
      <div class="fin-acc-s">${a.kind === 'credit_card' ? 'last closed bill' : 'balance'} on ${day(a.balance_date)} · ${a.transactions} transactions · ${day(a.first)} → ${day(a.last)}</div>
    </div>`;
  // carteiras zeradas (moedas de viagem do Wise) ficam recolhidas para nao poluir
  const idle = m.accounts.filter(a => a.kind === 'wallet' && !a.balance && a.status === 'ok');
  const main = m.accounts.filter(a => !idle.includes(a));
  const cards = main.map(card).join('') + (idle.length
    ? `<details class="fin-idle"><summary>${idle.length} empty wallets (${idle.map(a => a.currency).join(', ')})</summary><div class="fin-accs">${idle.map(card).join('')}</div></details>` : '');
  const when = ts => ts ? stamp(ts) : '—';
  const items = (m.pluggy_items || []).map(it => {
    const days = it.consent_expires ? Math.round((new Date(it.consent_expires) - Date.now()) / 864e5) : null;
    return `<span class="fin-chip ${it.status === 'UPDATED' ? 'ok' : 'warn'}" title="authorisation valid until ${when(it.consent_expires)}${days !== null ? ` (${days} days)` : ''}">${esc(INST[it.institution] || it.institution)}: bank updated ${when(it.last_updated)}</span>`;
  }).join('');
  const conn = `
    <div class="fin-conn">
      ${m.pluggy_configured ? `${items}<button class="fin-btn fin-sync-pluggy" title="the bank refreshes in Open Finance every 24h; this fetches what has already arrived">Refresh banks</button>` : '<span class="fin-chip">Open Finance (Meu Pluggy): not configured</span>'}
      ${m.wise_configured ? '<button class="fin-btn fin-sync-wise">Refresh Wise</button>' : ''}
      <span class="fin-chip">${(m.files.parsed || 0)} files · ${(m.files.error || 0)} with errors</span>
      ${m.queue ? `<span class="fin-chip warn">${m.queue} in the review queue</span>` : ''}
    </div>`;
  const invCards = (m.investments_total || []).map(iv => `
    <div class="fin-acc" data-inv="1" title="see investments">
      <div class="fin-acc-h">${esc(INST[iv.institution] || iv.institution)} · investments</div>
      <div class="fin-acc-v">${money(iv.total, iv.currency)}</div>
      <div class="fin-acc-s">${iv.n} positions · on ${day(iv.date)} (Open Finance)</div>
    </div>`).join('');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const loanCards = (m.loans || []).filter(l => l.outstanding).map(l => `
    <div class="fin-acc" title="lent ${money(l.lent, 'BRL')} − repaid ${money(l.repaid, 'BRL')} (category ${esc(l.category)}; split in data/finance/ledger/splits.json)">
      <div class="fin-acc-h">To receive · ${esc(cap(l.who))}</div>
      <div class="fin-acc-v ${l.outstanding < 0 ? 'neg' : ''}">${money(l.outstanding, 'BRL')}</div>
      <div class="fin-acc-s">lent ${money(l.lent, 'BRL')} · repaid ${money(l.repaid, 'BRL')} · ${day(l.first)} → ${day(l.last)}</div>
    </div>`).join('') + (m.assets || []).filter(a => a.paid).map(a => `
    <div class="fin-acc" title="category ${esc(a.category)}: excluded from spending and income (it is net worth)">
      <div class="fin-acc-h">Asset · ${esc(cap(a.what))}</div>
      <div class="fin-acc-v">${money(a.paid, 'BRL')}</div>
      <div class="fin-acc-s">amount paid, no depreciation · ${a.n} payment(s) · ${day(a.first)}${a.last !== a.first ? ` → ${day(a.last)}` : ''}</div>
    </div>`).join('');
  pane.innerHTML = `${conn}<div class="fin-costs"><div class="fin-empty">Calculating monthly cost…</div></div><div class="fin-accs">${invCards}${loanCards}${cards}</div><div class="fin-invlist"></div>
    <div class="fin-card"><div class="fin-card-h">End-of-month balance <select class="fin-cur"></select><span class="fin-hint">one currency at a time; known gaps already adjusted</span></div><div class="fin-chart"></div></div>`;
  pane.querySelector('.fin-sync-pluggy')?.addEventListener('click', async e => {
    e.target.disabled = true;
    e.target.textContent = 'Refreshing…';
    try {
      const r = await fetch(`${API}/sync/pluggy`, { method: 'POST', credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.text()).slice(0, 300));
      const res = await r.json();
      const skipped = res.items.filter(i => i.skipped).length;
      if (skipped === res.items.length) showError('Finances: the banks have not refreshed since the last fetch (Open Finance refreshes every 24h).');
      await refreshMeta();
      render();
    } catch (err) { showError(`Open Finance: ${err.message}`); e.target.disabled = false; e.target.textContent = 'Refresh banks'; }
  });
  pane.querySelectorAll('[data-inv]').forEach(c => c.addEventListener('click', async () => {
    const host = pane.querySelector('.fin-invlist');
    if (host.innerHTML) { host.innerHTML = ''; return; }
    const { investments } = await get('/investments');
    host.innerHTML = `<div class="fin-card"><div class="fin-card-h">Investments (${investments.length}) <span class="fin-hint">position from the latest snapshot; position history builds up with each refresh</span></div>
      <table class="fin-table"><thead><tr><th>Institution</th><th>Type</th><th>Name</th><th>Date</th><th class="num">Balance</th></tr></thead><tbody>
      ${investments.filter(i => i.balance_cents).map(i => `<tr><td>${esc(INST[i.institution] || i.institution)}</td><td>${esc((i.type || '') + (i.subtype ? ' / ' + i.subtype : ''))}</td><td class="desc">${esc(i.name || '')}</td><td>${day(i.date)}</td><td class="num">${money(i.balance_cents, i.currency)}</td></tr>`).join('')}</tbody></table>
      <div class="fin-dim">${investments.filter(i => !i.balance_cents).length} empty (redeemed) positions hidden</div></div>`;
  }));
  pane.querySelector('.fin-sync-wise')?.addEventListener('click', async e => {
    e.target.disabled = true;
    e.target.textContent = 'Refreshing…';
    try {
      const r = await fetch(`${API}/sync/wise`, { method: 'POST', credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.text()).slice(0, 300));
      await refreshMeta();
      render();
    } catch (err) { showError(`Wise: ${err.message}`); e.target.disabled = false; e.target.textContent = 'Refresh Wise'; }
  });
  pane.querySelectorAll('[data-acc]').forEach(c => c.addEventListener('click', () => { st.account = c.dataset.acc; st.offset = 0; goTransactions(); }));
  renderCosts(pane.querySelector('.fin-costs')).catch(e => { pane.querySelector('.fin-costs').innerHTML = `<div class="fin-empty">Monthly cost failed: ${esc(e.message)}</div>`; });
  const { series } = await get('/balances');
  const curs = [...new Set(Object.keys(series).map(k => accByKey(k)?.currency || 'BRL'))].sort((a, b) => (a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b)));
  const sel = pane.querySelector('.fin-cur');
  // moeda propria do grafico de saldos: nao mexe em st.cur (o "All (in R$)" das outras abas)
  sel.innerHTML = curs.map(c => `<option ${c === st.balCur ? 'selected' : ''}>${c}</option>`).join('');
  const draw = () => {
    st.balCur = sel.value;
    lineChart(pane.querySelector('.fin-chart'), Object.fromEntries(Object.entries(series).filter(([k]) => (accByKey(k)?.currency || 'BRL') === st.balCur)));
  };
  sel.addEventListener('change', draw);
  draw();
}

async function renderTransactions(pane) {
  const opts = st.meta.accounts.map(a => `<option value="${esc(a.key)}" ${a.key === st.account ? 'selected' : ''}>${esc(accLabel(a))}</option>`).join('');
  pane.innerHTML = `
    <div class="fin-filters">
      <select class="fin-f-acc"><option value="">all accounts</option>${opts}</select>
      <input class="fin-f-q" placeholder="search description" value="${esc(st.q)}">
      <input class="fin-f-cat" placeholder="category (or (sem))" value="${esc(st.category)}" list="fin-cat-list">
      <input type="date" class="fin-f-from" value="${esc(st.from)}"><span>→</span><input type="date" class="fin-f-to" value="${esc(st.to)}">
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
    pane.querySelector('.fin-f-sum').textContent = `${d.total} transactions` + (st.account ? ` · sum ${money(d.sum, cur)}` : '');
    const rows = d.rows.map(r => {
      const a = accByKey(r.account_key);
      const src = r.sources.map(s => `<span class="fin-chip src" title="${esc(s.description)} (${day(s.date)})">${esc(IMPORTER[s.importer] || s.importer)}</span>`).join('');
      return `<tr><td class="nowrap">${dayLink(r.date)}</td><td>${esc(a ? accLabel(a) : r.account_key)}</td><td class="desc">${esc(r.description)}${r.refund_of ? ' <span class="fin-chip" title="refund matched with the original purchase: both are left out of the charts">refund</span>' : ''}${r.refunded ? ` <span class="fin-chip" title="purchase with ${money(r.refunded, a?.currency || 'BRL')} refunded: charts count only the difference">${r.refunded >= -r.amount_cents ? 'refunded' : 'partial refund'}</span>` : ''}</td>
        <td class="fin-catcell" data-tx="${r.id}" title="${r.manual ? 'manual category' : r.rule ? esc(r.rule) : 'no category'} — click to change">${r.category ? esc(r.category) + (r.manual ? ' ✎' : '') : '<span class="fin-dim">—</span>'}</td><td>${src}</td>
        <td class="num ${r.amount_cents < 0 ? 'neg' : 'pos'}">${money(r.amount_cents, a?.currency || 'BRL')}</td></tr>`;
    }).join('');
    const more = d.total > st.offset + d.rows.length;
    pane.querySelector('.fin-tx').innerHTML = `<table class="fin-table"><thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Category</th><th>Sources</th><th class="num">Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="fin-empty">Nothing found.</td></tr>'}</tbody></table>
      <div class="fin-pager">${st.offset ? '<button data-p="-1">← previous</button>' : ''}${more ? '<button data-p="1">next →</button>' : ''}</div>`;
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
  td.innerHTML = `<input class="fin-catedit" list="fin-cat-list" value="${esc(old === '—' ? '' : old)}" placeholder="group:sub (empty = back to the rule)">`;
  const inp = td.querySelector('input');
  inp.focus();
  let done = false;
  const save = async () => {
    if (done) return; done = true;
    const r = await fetch(`${API}/tx/${td.dataset.tx}/category`, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: inp.value }) });
    if (!r.ok) showError(`Finances: ${(await r.text()).slice(0, 200)}`);
    await loadCatNames();
    after();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { done = true; after(); } });
  inp.addEventListener('blur', save);
}

async function renderCategories(pane) {
  const periods = [['1', 'this month'], ['3', '3 months'], ['12', '12 months'], ['all', 'all']];
  const end = new Date();
  // dados param em 2024: "12 months" a partir do ultimo dado, nao de hoje
  const last = (st.meta.accounts.map(a => a.last).sort().pop() || '').slice(0, 10);
  const anchor = last ? new Date(last + 'T12:00:00') : end;
  const fromA = st.catPeriod === 'all' ? '' : new Date(anchor.getFullYear(), anchor.getMonth() - Number(st.catPeriod) + 1, 1).toISOString().slice(0, 10);
  const [d, rl, un] = await Promise.all([get(`/categories?currency=${st.cur}&from=${fromA || ''}`), get('/rules'), get('/uncategorized?limit=40')]);
  const isTransfer = c => c.startsWith('transferencias:') || c.startsWith('emprestimos:') || c.startsWith('patrimonio:') || c === 'financeiro:rotativo' || c === 'ajustes:pre-autorizacao';
  const cats = d.categories.filter(c => st.withTransfers || !isTransfer(c.category));
  const out = cats.filter(c => c.total < 0), inc = cats.filter(c => c.total > 0);
  const maxOut = Math.max(1, ...out.map(c => -c.total)), maxIn = Math.max(1, ...inc.map(c => c.total));
  const bar = (c, max, cls) => `<div class="fin-hbar" data-cat="${esc(c.category)}"><span class="fin-hbar-l">${esc(c.category)}</span>
    <span class="fin-hbar-t"><i class="${cls}" style="width:${(Math.abs(c.total) / max * 100).toFixed(1)}%"></i></span>
    <span class="fin-hbar-v">${money(c.total, st.cur)} <small>${c.count}</small></span></div>`;
  const sumOut = out.reduce((a, c) => a + c.total, 0), sumIn = inc.reduce((a, c) => a + c.total, 0);
  pane.innerHTML = `
    <div class="fin-filters">${periods.map(([v, l]) => `<button class="fin-btn ${st.catPeriod === v ? 'active' : ''}" data-cp="${v}">${l}</button>`).join('')}
      <select class="fin-cur2">${['ALL', 'BRL', 'USD', 'EUR', 'ILS', 'CHF', 'HUF', 'CZK', 'PLN', 'RON', 'GBP'].map(c => `<option value="${c}" ${c === st.cur ? 'selected' : ''}>${c === 'ALL' ? 'All (in R$)' : c}</option>`).join('')}</select>
      <label><input type="checkbox" class="fin-wt" ${st.withTransfers ? 'checked' : ''}> include transfers, loans and assets</label>
      <span class="fin-f-sum">${fromA ? 'since ' + day(fromA) + ' (up to the latest data)' : 'full history'} · income ${money(sumIn, st.cur)} · expenses ${money(sumOut, st.cur)}</span></div>
    <div class="fin-grid2">
      <div class="fin-card"><div class="fin-card-h">Expenses by category <span class="fin-hint">click to see the transactions</span></div>${out.map(c => bar(c, maxOut, 'neg')).join('') || '<div class="fin-dim">nothing</div>'}</div>
      <div class="fin-card"><div class="fin-card-h">Income by category</div>${inc.map(c => bar(c, maxIn, 'pos')).join('') || '<div class="fin-dim">nothing</div>'}</div>
    </div>
    <div class="fin-card"><div class="fin-card-h">Rules <span class="fin-hint">${esc(rl.path || '')}</span></div>
      ${rl.error ? `<div class="fin-chip warn">${esc(rl.error)}</div>` : `<div>${rl.rules.length} rules · ${(rl.coverage * 100).toFixed(1)}% of ${rl.transactions} transactions categorised · ${rl.manual} manual</div>
      <details><summary class="fin-dim">see rules</summary><table class="fin-table"><thead><tr><th>Rule</th><th>Priority</th><th>Category</th><th class="num">Transactions</th></tr></thead><tbody>
      ${rl.rules.map(r => `<tr><td title="${esc(JSON.stringify(r.when))}">${esc(r.id)}</td><td>${r.priority}</td><td>${esc(r.category)}</td><td class="num">${r.hits}</td></tr>`).join('')}</tbody></table></details>`}</div>
    <div class="fin-card"><div class="fin-card-h">Still uncategorised (by merchant) <span class="fin-hint">becomes a rule in the next round; or click a transaction's category to set it by hand</span></div>
      <table class="fin-table"><thead><tr><th>Merchant</th><th>Account</th><th class="num">Times</th><th class="num">Total</th><th>Example</th></tr></thead><tbody>
      ${un.groups.map(g => `<tr><td>${esc(g.merchant)}</td><td>${esc((INST[g.institution] || g.institution) + ' · ' + (KIND[g.kind] || g.kind))}</td><td class="num">${g.count}</td><td class="num">${money(g.sum_cents, g.currency)}</td><td class="desc fin-dim">${esc(g.examples[0])}</td></tr>`).join('')}</tbody></table></div>`;
  pane.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', () => { st.catPeriod = b.dataset.cp; render(); }));
  pane.querySelector('.fin-cur2').addEventListener('change', e => { st.cur = e.target.value; render(); });
  pane.querySelector('.fin-wt').addEventListener('change', e => { st.withTransfers = e.target.checked; render(); });
  pane.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    st.category = b.dataset.cat; st.account = ''; st.q = ''; st.from = fromA; st.to = ''; st.offset = 0; goTransactions();
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
  // acima de toda janela aberta: o contador de z dos modais sobe sem teto, então um z fixo
  // acabaria atrás do próprio hub numa sessão longa (mesma regra dos portais do upstream)
  tipEl.style.zIndex = String(topPortalZ());
  tipEl.style.display = 'block';
  const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${e.clientY + 14}px`;
}
function compact(cents) {
  const v = cents / 100, a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
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
  if (group === 'quarter') return p.replace('-T', '-Q');
  if (group !== 'month') return p;
  const m = MONTHS[Number(p.slice(5, 7)) - 1];
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
    if (i - run >= 3) svg.append(svgEl('text', { x: P.l + band * (run + (i - run) / 2), y: P.t + 24, 'text-anchor': 'middle', class: 'fin-band-l' }, 'no data')); run = null; } };
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
// largura da barra: folga de 6px entre colunas quando cabe; com muitos meses em tela estreita,
// 80% da coluna (nunca <= 0, senao a barra some e o segmento de cima "flutua")
function barWidth(band, n = 1) {
  const gap = Math.min(6, band * 0.2);
  return Math.min(24, Math.max(0.8, (band - gap) / n - (n > 1 && band >= 12 ? 1 : 0)));
}
const stackGap = bw => (bw >= 6 ? 2 : 0);  // separador entre segmentos so em barra larga
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
const tipHead = p => `<div class="fin-tip-h">${esc(periodLabel(p.period, st.mGroup))}${p.no_data ? ' · no data (statement missing)' : ''}${p.partial ? ' · partial (data up to ' + day(p.last_date) + ')' : ''}${p.incomplete ? ' · ⚠ incomplete data' : ''}</div>`;

function chartIncomeExpense(host, periods, cur) {
  const vals = periods.flatMap(p => [p.income, p.expenses, p.net]);
  const f = axisFrame(host, periods, Math.min(...vals), Math.max(...vals));
  const bw = barWidth(f.band, 2);
  periods.forEach((p, i) => {
    const op = p.incomplete || p.partial ? 0.45 : 1;
    [[p.income, SERIES[0], -1], [p.expenses, SERIES[1], 1]].forEach(([v, c, side]) => {
      if (!v) return;
      const x = side < 0 ? f.xc(i) - bw - (bw >= 4 ? 1 : 0) : f.xc(i) + (bw >= 4 ? 1 : 0);
      const b = roundedBar(x, bw, f.y(0), f.y(v), c); b.setAttribute('opacity', op); f.svg.append(b);
    });
  });
  let seg = [];
  const flush = () => { if (seg.length > 1) f.svg.append(svgEl('polyline', { points: seg.join(' '), fill: 'none', stroke: 'var(--fin-ink2)', 'stroke-width': 2, 'stroke-linejoin': 'round' })); seg = []; };
  periods.forEach((p, i) => { if (p.no_data) flush(); else seg.push(`${f.xc(i).toFixed(1)},${f.y(p.net).toFixed(1)}`); });
  flush();
  hitColumns(f.svg, f, periods, p => tipHead(p) + tipRow('income', money(p.income, cur), SERIES[0]) + tipRow('expenses', money(p.expenses, cur), SERIES[1])
    + tipRow('period net', money(p.net, cur)) + (p.savings_rate !== null ? tipRow('savings rate', (p.savings_rate * 100).toFixed(0) + '%') : ''));
  host.innerHTML = '';
  host.append(f.svg);
  host.insertAdjacentHTML('beforeend', legend([['Income', SERIES[0]], ['Expenses', SERIES[1]], ['Net (income − expenses)', 'var(--fin-ink2)', 'line']]));
}

function chartLine(host, periods, key, color, cur, { label, fmt = compact, tipFmt, extra, area = true } = {}) {
  // formato do tooltip e explicito por grafico (nada de adivinhar pelo nome do campo)
  const tf = tipFmt || (v => money(v, cur));
  const pts = periods.map((p, i) => [i, p[key]]).filter(([, v]) => v !== null && v !== undefined);
  if (!pts.length) { host.innerHTML = '<div class="fin-empty">No data in the period.</div>'; return; }
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
    return other ? rows.concat([['other', other]]) : rows;
  });
  const f = axisFrame(host, periods, 0, Math.max(1, ...segs.map(r => r.reduce((a, [, v]) => a + v, 0))));
  const bw = barWidth(f.band);
  segs.forEach((rows, i) => {
    let acc = 0;
    const live = rows.filter(([, v]) => v > 0);
    live.forEach(([g, v], k) => {
      const y0 = f.y(acc), y1 = f.y(acc + v);
      const isTop = k === live.length - 1;
      const el = isTop ? roundedBar(f.xc(i) - bw / 2, bw, y0, y1 + 0, colorOf(g)) : svgEl('rect', { x: f.xc(i) - bw / 2, y: y1, width: bw, height: Math.max(0, y0 - y1 - stackGap(bw)), fill: colorOf(g) });
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
  host.insertAdjacentHTML('beforeend', legend(top.map(g => [g, colorOf(g)]).concat(groups.length > 7 ? [['other', OTHER]] : [])));
}

const SAL_PARTS = [  // ordem fixa = cores fixas (slots 1-4 da paleta validada)
  ['salary_base', 'base salary', SERIES[0]],
  ['salary_13', '13th salary (estimated)', SERIES[1]],
  ['salary_other', 'vacation/other (estimated)', SERIES[2]],
  ['salary_extra', 'expat allowance', SERIES[3]],
  ['salary_bonus', 'bonus', SERIES[4]],
  ['salary_mesada', 'allowance', SERIES[6]],
];
function chartSalary(host, periods, cur) {
  const total = p => SAL_PARTS.reduce((a, [k]) => a + (p[k] || 0), 0);
  const f = axisFrame(host, periods, 0, Math.max(1, ...periods.map(total)));
  const bw = barWidth(f.band);
  periods.forEach((p, i) => {
    const parts = SAL_PARTS.filter(([k]) => (p[k] || 0) > 0);
    let acc = 0;
    parts.forEach(([k, , color], j) => {
      const v = p[k], y0 = f.y(acc) - (j ? stackGap(bw) : 0), y1 = f.y(acc + v);
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
  const periods = [['12', '12 months'], ['24', '24 months'], ['36', '3 years'], ['60', '5 years'], ['all', 'all']];
  const curs = ['ALL', ...[...new Set(st.meta.accounts.map(a => a.currency))].sort((a, b) => (a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b)))];
  const filters = `<div class="fin-filters">${periods.map(([v, l]) => `<button class="fin-btn ${st.mPeriod === v ? 'active' : ''}" data-mp="${v}">${l}</button>`).join('')}
      <select class="fin-mg"><option value="month" ${st.mGroup === 'month' ? 'selected' : ''}>by month</option><option value="quarter" ${st.mGroup === 'quarter' ? 'selected' : ''}>by quarter</option><option value="year" ${st.mGroup === 'year' ? 'selected' : ''}>by year</option></select>
      <select class="fin-mc" title="All = each entry converted to R$ at that day's ECB rate; balances at the end-of-month rate">${curs.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c === 'ALL' ? 'All (in R$)' : c}</option>`).join('')}</select>
      <label title="Pix/TED/DOC with people (transferencias:pessoas): sent counts as spending, received as income"><input type="checkbox" class="fin-mpp" ${st.mPeople ? 'checked' : ''}> count Pix/TED with people</label>
      <span class="fin-f-sum">${from ? 'since ' + day(from) : 'full history'} up to the latest data (${day(last)})</span></div>`;
  if (!P.length) { pane.innerHTML = filters + '<div class="fin-empty">No data for this currency/period.</div>'; bindM(); return; }
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
    ${kpi('Net worth', money(lastP.nw_plus, cur), `accounts − card ${money(nwLast, cur)} + investments ${money(lastP.investments ?? lastP.invested, cur)}${lastP.investments_source === 'estimado' ? '*' : ''}${nwDelta !== null ? ` · accounts ${nwDelta >= 0 ? '▲' : '▼'} ${money(Math.abs(nwDelta), cur)} over the period` : ''}`)}
    ${kpi('Income / month', money(Math.round(incomeAvg), cur), `average of the last ${months12} months`)}
    ${kpi('Expenses / month', money(Math.round(expAvg), cur), `average of the last ${months12} months`)}
    ${kpi('Savings rate', sr === null ? '—' : (sr * 100).toFixed(0) + '%', 'common benchmark: 15–20%')}
    ${kpi('Salary (base)', money(lastP.salary_base, cur), `${esc(periodLabel(lastP.period, st.mGroup))} · average base ${money(Math.round(sum('salary_base') / months12), cur)}/month · 13th+extras+allowance+bonus ${money(sum('salary_13') + sum('salary_other') + sum('salary_extra') + sum('salary_bonus'), cur)} over ${months12} months`)}
    ${kpi('Reserve', lastP.reserve_months === null ? '—' : lastP.reserve_months.toFixed(1) + ' months', 'net worth / 6-month average spending · benchmark 3–6')}
  </div>`;
  const warn = incompleteN ? `<div class="fin-note">⚠ ${incompleteN} period(s) with incomplete data (faded bars): there was a transfer between your accounts without the statement/bill on the other side — card spending for those months may be missing. See Audit.</div>` : '';
  const table = `<details class="fin-card"><summary class="fin-card-h">Table (${P.length} periods) <button class="fin-btn fin-csv">download CSV</button></summary>
    <table class="fin-table"><thead><tr><th>Period</th><th class="num">Income</th><th class="num">Base salary</th><th class="num">13th*</th><th class="num">Vacation/other*</th><th class="num">Allowance</th><th class="num">Bonus</th><th class="num">Pocket money</th><th class="num">Expenses</th><th class="num">fixed</th><th class="num">variable</th><th class="num">Net</th><th class="num">Savings</th><th class="num">Net worth</th><th class="num">Invested</th><th class="num">Reserve</th><th></th></tr></thead><tbody>
    ${P.slice().reverse().filter(p => !p.no_data).map(p => `<tr><td>${esc(periodLabel(p.period, st.mGroup))}</td><td class="num">${money(p.income, cur)}</td><td class="num">${money(p.salary_base, cur)}</td><td class="num">${p.salary_13 ? money(p.salary_13, cur) : ''}</td><td class="num">${p.salary_other ? money(p.salary_other, cur) : ''}</td><td class="num">${p.salary_extra ? money(p.salary_extra, cur) : ''}</td><td class="num">${p.salary_bonus ? money(p.salary_bonus, cur) : ''}</td><td class="num">${p.salary_mesada ? money(p.salary_mesada, cur) : ''}</td><td class="num">${money(p.expenses, cur)}</td><td class="num">${money(p.fixed, cur)}</td><td class="num">${money(p.variable, cur)}</td><td class="num ${p.net < 0 ? 'neg' : ''}">${money(p.net, cur)}</td><td class="num">${p.savings_rate === null ? '—' : (p.savings_rate * 100).toFixed(0) + '%'}</td><td class="num">${money(p.net_worth, cur)}</td><td class="num">${money(p.investments ?? p.invested, cur)}${p.investments_source === 'estimado' ? '*' : ''}</td><td class="num">${p.reserve_months === null ? '—' : p.reserve_months.toFixed(1)}</td><td>${p.partial ? '<span title="partial period">½</span> ' : ''}${p.incomplete ? '⚠' : ''}${p.card_known ? '' : ' <span title="no recent card bill: card debt unknown">💳?</span>'}</td></tr>`).join('')}</tbody></table></details>`;
  pane.innerHTML = `${filters}${kpis}${warn}
    <div class="fin-card"><div class="fin-card-h">Income × expenses <span class="fin-hint">transfers between your accounts, currency exchange and investments do not count</span></div><div class="fin-ch-ie"></div></div>
    <div class="fin-grid2">
      <div class="fin-card"><div class="fin-card-h">Net worth <span class="fin-hint">account balances − card, end of period</span></div><div class="fin-ch-nw"></div></div>
      <div class="fin-card"><div class="fin-card-h">Salary <span class="fin-hint">13th salary and extras estimated from the deposit pattern (the payslip would give the exact figure)</span></div><div class="fin-ch-sal"></div></div>
    </div>
    <div class="fin-grid2">
      <div class="fin-card"><div class="fin-card-h">Expenses by group</div><div class="fin-ch-st"></div></div>
      <div class="fin-card"><div class="fin-card-h">Savings rate <span class="fin-hint">(income − expenses) ÷ income</span></div><div class="fin-ch-sr"></div></div>
    </div>
    ${table}
    <div class="fin-dim fin-defs">* <b>Estimated invested</b>: before the first Open Finance snapshot, the sum of what went into savings pots/RDB/IPO, without yield. From the snapshot on, the real investment balance. Net worth sums only accounts in the chosen currency: money converted to Wise leaves the BRL total and shows up in its own currency.</div>`;
  chartIncomeExpense(pane.querySelector('.fin-ch-ie'), P, cur);
  chartLine(pane.querySelector('.fin-ch-nw'), P, 'net_worth', SERIES[0], cur, { label: 'net worth',
    extra: { key: 'nw_plus', label: 'with investments (* estimated before Open Finance)', color: SERIES[2], fmtTip: v => money(v, cur) } });
  chartSalary(pane.querySelector('.fin-ch-sal'), P, cur);
  chartStacked(pane.querySelector('.fin-ch-st'), P, d.groups, cur);
  chartLine(pane.querySelector('.fin-ch-sr'), P.map(p => ({ ...p, sr100: p.savings_rate === null ? null : Math.round(p.savings_rate * 10000) })), 'sr100', SERIES[0], cur,
    { label: 'savings rate', fmt: v => (v / 100).toFixed(0) + '%', tipFmt: v => (v / 100).toFixed(0) + '%', area: false });
  pane.querySelector('.fin-csv').addEventListener('click', e => {
    e.preventDefault();
    const head = ['period', 'income', 'base_salary', 'salary_13th_est', 'vacation_other_est', 'allowance', 'bonus', 'pocket_money', 'expenses', 'fixed', 'variable', 'net', 'savings_rate_pct', 'net_worth', 'invested', 'reserve_months', 'incomplete'];
    const csv = [head.join(';')].concat(P.map(p => [p.period, p.income, p.salary_base, p.salary_13, p.salary_other, p.salary_extra, p.salary_bonus, p.salary_mesada, p.expenses, p.fixed, p.variable, p.net, p.savings_rate === null ? '' : Math.round(p.savings_rate * 1000) / 10, p.net_worth ?? '', p.investments ?? p.invested, p.reserve_months ?? '', p.incomplete ? 1 : 0]
      .map((v, i) => (i >= 1 && i <= 9) || i === 11 || i === 12 ? (v === '' ? '' : (v / 100).toFixed(2).replace('.', ',')) : String(v).replace('.', ',')).join(';'))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `finances-${cur}-${st.mGroup}.csv`;
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


// ── aba Review ─────────────────────────────────────────────────────────
const QUICK = ['lazer:futebol', 'lazer:esporte', 'moradia:diarista', 'moradia:divisao-aluguel', 'moradia:aluguel', 'presentes:pessoas', 'reembolso:recebido', 'reembolso:pago', 'divisao:contas-compartilhadas',
  'transferencias:interna', 'renda:freelance', 'renda:outros', 'saude:consultas', 'educacao:cursos', 'impostos:taxas', 'alimentacao:restaurante',
  'compras:geral', 'servicos:profissionais'];
const CONF = { sem: ['uncategorised', 'warn'], baixa: ['generic', 'warn'], media: ['from Open Finance', ''] };

async function renderReview(pane) {
  st.revMonths = st.revMonths ?? '12';
  const d = await get(`/review?months=${st.revMonths}&limit=150`);
  const cats = [...new Set([...QUICK, ...d.categories])].sort();
  let dl = document.getElementById('fin-cat-list');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'fin-cat-list'; document.body.append(dl); }
  dl.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  const t = d.totals, sum = k => t[k]?.impact || 0;
  // so o que precisa de categoria (transferencias entre suas contas ficam fora da conta)
  const allMoving = Object.entries(t).filter(([k]) => k !== 'neutra').reduce((a, [, v]) => a + v.impact, 0) || 1;
  const pct = k => `${((sum(k) / allMoving) * 100).toFixed(1)}%`;
  pane.innerHTML = `
    <div class="fin-filters">${[['3', '3 months'], ['12', '12 months'], ['36', '3 years'], ['0', 'all']].map(([v, l]) => `<button class="fin-btn ${st.revMonths === v ? 'active' : ''}" data-rm="${v}">${l}</button>`).join('')}
      <span class="fin-f-sum">${d.groups} groups to review · biggest impact first</span></div>
    <div class="fin-kpis">
      <div class="fin-kpi"><div class="fin-kpi-l">Reliable</div><div class="fin-kpi-v">${pct('alta')}</div><div class="fin-kpi-s">${t.alta?.count || 0} transactions · specific rule or your own</div></div>
      <div class="fin-kpi"><div class="fin-kpi-l">Generic (Open Finance)</div><div class="fin-kpi-v">${pct('media')}</div><div class="fin-kpi-s">${t.media?.count || 0} transactions · likely, not confirmed</div></div>
      <div class="fin-kpi"><div class="fin-kpi-l">No "what for"</div><div class="fin-kpi-v">${pct('baixa')}</div><div class="fin-kpi-s">${t.baixa?.count || 0} transactions · Pix to people, bank slips…</div></div>
      <div class="fin-kpi"><div class="fin-kpi-l">Uncategorised</div><div class="fin-kpi-v">${pct('sem')}</div><div class="fin-kpi-s">${t.sem?.count || 0} transactions</div></div>
    </div>
    <div class="fin-dim fin-defs" style="margin-bottom:8px">Percentages of the income and expense value in the period (transfers between your accounts, currency exchange and investments are left out: they need no category).
      Choosing a category here applies to <b>all</b> of the item's transactions, past and future (it becomes your own rule in data/finance/ledger/rules_user.json). <b>Recurring</b> amounts for a person (same amount over several months, e.g. football R$ 150) are a separate item: the category applies only to that amount range, and other Pix to the same person stay separate.</div>
    <div class="fin-rev">${d.items.map((i, n) => `
      <div class="fin-rev-i" data-n="${n}">
        <div class="fin-rev-h"><b>${esc(i.merchant || '(no description)')}</b>
          <span class="fin-chip">${i.sign === 'debit' ? 'out' : 'in'}</span>
          ${i.band ? `<span class="fin-chip ok" title="same (or similar) amount repeating: the category applies only to amounts between ${money(i.band.min, 'BRL')} and ${money(i.band.max, 'BRL')}">recurring ~${money(i.band.typical, 'BRL')}${i.recurring.frequency === 'mensal' ? '/mo' : ''} · ${i.recurring.months} months</span>` : ''}
          ${i.rest_of_recurring ? '<span class="fin-chip" title="the recurring amounts of this person are in separate items">other amounts (one-offs)</span>' : ''}
          <span class="fin-chip ${CONF[i.confidence][1]}">${CONF[i.confidence][0]}${i.current ? ': ' + esc(i.current) : ''}</span>
          <span class="fin-rev-v ${i.sign === 'debit' ? 'neg' : 'pos'}">${money(i.sign === 'debit' ? -i.impact : i.impact, 'BRL')}</span></div>
        <div class="fin-dim">${i.count}× · ${day(i.first)} → ${day(i.last)} · ${esc(i.accounts.join(', '))}${i.provider_category ? ` · Open Finance says: ${esc(i.provider_category)}` : ''}</div>
        <div class="fin-dim fin-rev-ex">${i.examples.map(esc).join(' · ')}</div>
        <div class="fin-rev-a">
          <input class="fin-catedit" list="fin-cat-list" placeholder="group:sub — e.g. moradia:diarista" value="${esc(i.confidence === 'media' ? i.current : '')}">
          <button class="fin-btn fin-rev-ok">${i.band ? `apply to this amount (${i.count}× and future)` : i.rest_of_recurring ? `apply to the one-offs (${i.count})` : `apply to ${i.count === 1 ? 'this one' : 'all (' + i.count + ')'}`}</button>
          ${i.current && i.confidence !== 'sem' ? `<button class="fin-btn fin-rev-keep" title="the current category is right: confirm and take it off the queue">confirm ${esc(i.current)}</button>` : ''}
        </div>
      </div>`).join('') || '<div class="fin-empty">Nothing to review in this period 🎉</div>'}</div>`;
  pane.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { st.revMonths = b.dataset.rm; render(); }));
  const save = async (n, category, el) => {
    const i = d.items[n];
    if (!category.trim()) { showError('Choose a category (e.g. moradia:diarista)'); return; }
    el.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const r = await fetch(`${API}/review/assign`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: i.merchant, sign: i.sign, category, ...(i.band ? { amount_min: i.band.min, amount_max: i.band.max } : {}) }) });
    if (!r.ok) { showError(`Finances: ${(await r.text()).slice(0, 200)}`); el.querySelectorAll('button').forEach(b => { b.disabled = false; }); return; }
    const res = await r.json();
    el.classList.add('done');
    el.querySelector('.fin-rev-a').innerHTML = `<span class="fin-chip ok">✓ ${esc(res.rule.then.category)} on ${res.hits} transactions</span>`;
  };
  pane.querySelectorAll('.fin-rev-i').forEach(el => {
    const n = Number(el.dataset.n);
    el.querySelector('.fin-rev-ok')?.addEventListener('click', () => save(n, el.querySelector('input').value, el));
    el.querySelector('input')?.addEventListener('keydown', e => { if (e.key === 'Enter') save(n, e.target.value, el); });
    el.querySelector('.fin-rev-keep')?.addEventListener('click', () => save(n, d.items[n].current, el));
  });
}

async function renderAudit(pane) {
  const [d, tr] = await Promise.all([get('/audit'), get('/transfers')]);
  const accs = d.accounts.filter(a => a.transactions).map(a => {
    const acc = accByKey(a.account) || { institution: a.account, kind: '' };
    const cur = acc.currency || 'BRL';
    let body = '';
    if (a.breaks) {
      body = a.breaks.length
        ? a.breaks.map(b => `<li>between <b>${day(b.after)}</b> and <b>${day(b.until)}</b>: difference ${money(b.delta, cur)} — ${esc(b.hint)}</li>`).join('')
        : `<li class="fin-dim">${a.checked} balances printed by the source checked, all match.</li>`;
    } else {
      body = (a.unbalanced || []).map(b => `<li>${esc(b.file.split('/').pop())}: bill does not close, off by ${money(b.diff, cur)}</li>`).join('')
        + (a.chain_breaks || []).map(c => `<li>between ${day(c.between[0])} and ${day(c.between[1])}: previous bill closed at ${money(c.prev_closing, cur)} and the next opened at ${money(c.next_opening, cur)} — ${esc(c.hint)}</li>`).join('')
        || `<li class="fin-dim">${a.bills} bills, all close and chain correctly.</li>`;
    }
    const miss = (a.coverage.missing_months.length ? `<div class="fin-dim">months with no file (statement/bill missing): ${a.coverage.missing_months.join(', ')}</div>` : '')
      + ((a.coverage.idle_months || []).length ? `<div class="fin-dim">months without activity (the file covers it, there were no entries): ${a.coverage.idle_months.join(', ')}</div>` : '');
    return `<div class="fin-card"><div class="fin-card-h">${esc(accLabel(acc))} ${statusChip({ status: a.status, problems: (a.breaks || []).length + (a.unbalanced || []).length + (a.chain_breaks || []).length })}
      <span class="fin-hint">${day(a.coverage.first + '-01')} → ${a.coverage.last}</span></div><ul class="fin-list">${body}</ul>${miss}</div>`;
  }).join('');
  const queue = d.queue.map(q => {
    const acc = accByKey(q.account_key);
    const cands = q.candidates.map(c => `<button data-merge="${q.record_id}" data-tx="${c.id}">merge with ${day(c.date)} ${esc(c.description.slice(0, 40))}</button>`).join('');
    return `<tr><td class="nowrap">${dayLink(q.date)}</td><td>${esc(IMPORTER[q.importer] || q.importer)}</td><td class="desc">${esc(q.description)}</td>
      <td class="num">${money(q.amount_cents, acc?.currency || 'BRL')}</td><td>${q.reason === 'secundaria_sem_par' ? 'spreadsheet entry with no match in the statement' : 'uncertain match'}</td>
      <td class="fin-actions">${cands}<button data-keep="${q.record_id}" title="goes into the ledger as its own transaction">keep separate</button></td></tr>`;
  }).join('');
  const errs = d.errors.map(e => `<li><b>${esc(e.source_name)}</b>: ${esc(e.error)}</li>`).join('');
  const warns = d.warnings.map(w => `<li><b>${esc(w.source_name)}</b>: ${esc(w.message)}</li>`).join('');
  pane.innerHTML = `${accs}
    <div class="fin-card"><div class="fin-card-h">Review queue <span class="fin-hint">records that could not be matched safely — nothing here counts toward the balance until decided</span></div>
      ${queue ? `<table class="fin-table"><thead><tr><th>Date</th><th>Source</th><th>Description</th><th class="num">Amount</th><th>Reason</th><th></th></tr></thead><tbody>${queue}</tbody></table>` : '<div class="fin-dim">empty</div>'}</div>
    <div class="fin-card"><div class="fin-card-h">Transfers between your accounts missing the other side (${tr.unpaired.length})
      <span class="fin-hint">${tr.pairs} matched pairs · unmatched = the statement/bill on the other side is missing for that month</span></div>
      ${tr.unpaired.length ? `<details><summary class="fin-dim">see list</summary><table class="fin-table"><tbody>${tr.unpaired.map(t => `<tr><td class="nowrap">${dayLink(t.date)}</td><td>${esc(accLabel(accByKey(t.account_key) || { institution: t.account_key, kind: '' }))}</td><td class="desc">${esc(t.description)}</td><td class="num">${money(t.amount_cents, accByKey(t.account_key)?.currency || 'BRL')}</td></tr>`).join('')}</tbody></table></details>` : '<div class="fin-dim">all matched</div>'}</div>
    <div class="fin-card"><div class="fin-card-h">Import warnings</div>${warns ? `<ul class="fin-list">${warns}</ul>` : '<div class="fin-dim">none</div>'}</div>
    <div class="fin-card"><div class="fin-card-h">Files that were not imported <span class="fin-hint">the original is kept; reprocessed once a reader exists</span></div>${errs ? `<ul class="fin-list">${errs}</ul>` : '<div class="fin-dim">none</div>'}</div>`;
  const decide = async (id, body) => {
    const r = await fetch(`${API}/queue/${id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { showError(`Finances: ${(await r.text()).slice(0, 200)}`); return; }
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
    <td class="num">${f.n_records || ''}</td><td>${f.status === 'error' ? `<span class="fin-chip warn" title="${esc(f.error)}">error</span>` : 'ok'}</td>
    <td><a href="${API}/raw/${f.sha256}" title="sha256 ${f.sha256}">original</a></td></tr>`).join('');
  pane.innerHTML = `
    <div class="fin-card"><div class="fin-card-h">Import files <span class="fin-hint">OFX, Wise CSV, PDF statement/invoice. Re-importing the same file duplicates nothing.</span></div>
      <label class="fin-drop"><input type="file" multiple class="fin-upload"><span>Choose files…</span></label><div class="fin-upres"></div></div>
    <div class="fin-card"><div class="fin-card-h">Stored files (${d.files.length}) <span class="fin-hint">immutable raw copy in data/finance/raw, by sha256</span></div>
      <table class="fin-table"><thead><tr><th>File</th><th>Reader</th><th>Period</th><th class="num">Records</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  pane.querySelector('.fin-upload').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    const out = pane.querySelector('.fin-upres');
    out.textContent = `Importing ${files.length} file(s)…`;
    const fd = new FormData();
    files.forEach(f => fd.append('files', f, f.name));
    try {
      const r = await fetch(`${API}/import`, { method: 'POST', credentials: 'same-origin', body: fd });
      if (!r.ok) throw new Error((await r.text()).slice(0, 300));
      const res = await r.json();
      out.innerHTML = res.results.map(x => `<div>${x.status === 'parsed' ? '✓' : '✗'} ${esc(x.name)}: ${x.status === 'parsed' ? `${x.records} records, ${x.new_records} new` : esc(x.error)}${(x.warnings || []).map(w => `<div class="fin-dim">warning: ${esc(w)}</div>`).join('')}</div>`).join('');
      await refreshMeta();
    } catch (err) { out.textContent = `Failed: ${err.message}`; }
  });
}

const TABS = { overview: ['Overview', renderOverview], monthly: ['Monthly', renderMonthly], review: ['Review', renderReview], categories: ['Categories', renderCategories], transactions: ['Transactions', renderTransactions], audit: ['Audit', renderAudit], files: ['Files', renderFiles] };

// filtros da aba Transactions como vão no hash (#life/finances/transactions?from=&to=&account=&q=&category=)…
const txParams = () => ({ from: st.from, to: st.to, account: st.account, q: st.q, category: st.category });
// …e como voltam dele. O hash vem de fora (link, localStorage): datas só AAAA-MM-DD; o resto é texto e sai sempre
// escapado (esc) onde aparece.
function readTxParams(p) {
  const v = p || {};
  return {
    from: isIsoDate(v.from) ? v.from : '', to: isIsoDate(v.to) ? v.to : '',
    account: String(v.account || ''), q: String(v.q || ''), category: String(v.category || ''),
  };
}

// vai para a aba Transactions pelo hub (os filtros, inclusive a categoria, viajam nos params do hash)
function goTransactions() {
  void hubRef?.navigate(['transactions'], txParams());
}

// Cada render() pega um número e desenha num painel próprio dentro de .fin-body; o conteúdo atual passa para o
// painel novo e fica esmaecido enquanto carrega (sem piscar). Um desenho antigo que termina por último escreve no
// painel dele, já fora da página, e só o mais novo mostra erro ou tira o esmaecido.
let renderSeq = 0;
async function render() {
  if (!els.body) return;
  const mine = ++renderSeq;
  const body = els.body;
  els.tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === st.tab));
  const pane = document.createElement('div');
  pane.className = 'fin-pane';
  const prev = els.pane;
  if (prev?.parentNode === body) { pane.append(...prev.childNodes); prev.replaceWith(pane); } else body.replaceChildren(pane);
  els.pane = pane;
  if (!pane.children.length) pane.innerHTML = '<div class="fin-empty">Loading…</div>';
  body.style.opacity = '0.55';
  try {
    if (!st.meta) {
      pane.innerHTML = `<div class="fin-empty">Could not load Finances${metaError ? `: ${esc(metaError)}` : ''}</div>`;
      return;
    }
    if (!st.meta.available && st.tab !== 'files') {
      pane.innerHTML = '<div class="fin-empty">No data yet. Import files in the Files tab.</div>';
      return;
    }
    await TABS[st.tab][1](pane);
  } catch (e) {
    if (mine === renderSeq) pane.innerHTML = `<div class="fin-empty">Failed: ${esc(e.message)}</div>`;
  } finally {
    if (mine === renderSeq) body.style.opacity = '';
  }
}

let metaError = '';
async function refreshMeta() {
  st.meta = await get('/meta', { timeout: 15000 });
  const li = st.meta.last_import;
  if (els.status) els.status.textContent = st.meta.available
    ? `${st.meta.accounts.length} accounts` + (li ? ` · last import ${stamp(li)}` : '')
    : 'no data';
}

// Monta o app dentro do host do hub. Contrato: { route(path, params), unmount() }.
export async function mountFinances(host, hub) {
  hubRef = hub;
  host.innerHTML = `<div class="fin-content fin-embedded">
    <div class="fin-subhead"><div class="fin-tabs" role="tablist">${Object.entries(TABS).map(([k, [l]]) => `<button data-tab="${k}" role="tab">${l}</button>`).join('')}</div><span class="fin-status"></span></div>
    <div class="fin-body"></div>
  </div>`;
  const content = host.querySelector('.fin-content');
  els = { panel: host, content, tabs: content.querySelector('.fin-tabs'), body: content.querySelector('.fin-body'), status: content.querySelector('.fin-status') };
  els.tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    const key = b.dataset.tab;
    void hub.navigate([key], key === 'transactions' ? txParams() : {});
  });
  st.meta = null;
  metaError = '';
  try { await refreshMeta(); loadCatNames().catch(() => {}); } catch (e) { st.meta = null; metaError = e.message; }
  return {
    route(path, params) {
      const key = path?.[0];
      let tab = TABS[key] ? key : '';
      if (!tab) { try { tab = localStorage.getItem('odysseus-fin-tab') || ''; } catch (_) {} }
      st.tab = TABS[tab] ? tab : 'overview';
      // #life/finances sem aba: põe a aba na URL (replace), como o Diary faz com o dia. Sem isso o voltar de
      // #life/finances/monthly para #life/finances reabria a última aba (Monthly) e parecia não fazer nada. Só se a
      // URL ainda for a que o hub está aplicando: se o usuário já foi para outra, a rota nova vem na fila.
      if (!TABS[key]) {
        if (location.hash === hub.currentHash()) void hub.navigate([st.tab], st.tab === 'transactions' ? readTxParams(params) : {}, { replace: true });
        return;
      }
      if (st.tab === 'transactions') {
        Object.assign(st, readTxParams(params));
        st.offset = 0;
      }
      try { localStorage.setItem('odysseus-fin-tab', st.tab); } catch (_) {}
      void render();  // sem await: o hub não espera os fetches da aba
    },
    unmount() {
      renderSeq += 1;  // desenhos em andamento deste mount não mexem mais no corpo
      const tipNode = document.querySelector('.fin-tip');
      if (tipNode) tipNode.style.display = 'none';
    },
  };
}
