// Fork-local: checagem visual do painel Life no Chromium headless DENTRO do container do Odysseus.
// Uso (no host):
//   docker cp scripts/life_ui_check.cjs odysseus-odysseus-1:/tmp/ && docker exec odysseus-odysseus-1 node /tmp/life_ui_check.cjs 2023-03-14
// Entra pelo proxy do NAS com o segredo do PRÓPRIO ambiente do container (nunca sai dele), percorre Diary (dia/mês/ano/busca), Finances e AI usage
// em 1440 px (escuro e claro) e 390 px, esperando por um elemento que só a aba pedida desenha; depois abre e fecha o
// painel duas vezes pela barra lateral (✖ no desktop; Esc e arrasto no celular), conferindo que ele some, que o app
// foi desmontado e que a URL volta ao hash da conversa. Grava
// /tmp/life-*.png e sai com código 1 se houver erro de JS, 4xx/5xx (estáticos e /api/lifelog|finance|ai-usage) ou
// falha numa dessas conferências.
// As capturas têm dados pessoais: apagar depois de revisar.
const fs = require('fs');
const path = require('path');

const base = '/app/.npm/_npx';
const pw = fs.readdirSync(base).map(d => path.join(base, d, 'node_modules/playwright-core')).find(p => fs.existsSync(p));
const { chromium } = require(pw);
const LIGHT = { '--bg': '#f3f5f7', '--fg': '#26313a', '--panel': '#ffffff', '--border': '#cbd3da', '--red': '#b34d5c' };

(async () => {
  const day = process.argv[2] || '2023-03-14';
  const remote = (process.env.TRUSTED_PROXY_USER_MAP || '').split(',')[0].split(':')[0].trim();
  const headers = { 'X-Odysseus-Proxy-Secret': process.env.TRUSTED_PROXY_SECRET || '', 'Remote-User': remote };
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const shots = [];
  for (const [w, h, theme] of [[1440, 900, 'dark'], [1440, 900, 'light'], [390, 844, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', extraHTTPHeaders: headers });
    const page = await ctx.newPage();
    const tag = `${w}-${theme}`;
    page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400 && /\/static\/|\/api\/(lifelog|finance|ai-usage)\//.test(r.url())) errors.push(`${tag} ${r.status()} ${r.url()}`); });
    const snap = async name => { const f = `/tmp/life-${name}-${tag}.png`; await page.screenshot({ path: f }); shots.push(f); };
    const setTheme = async () => { if (theme === 'light') await page.evaluate(v => { document.documentElement.classList.add('light'); for (const [k, x] of Object.entries(v)) document.documentElement.style.setProperty(k, x); }, LIGHT); };
    const routes = [
      ['diary-month', `#life/diary/${day.slice(0, 7)}`, '#life-panel .life-month'],
      ['diary-year', `#life/diary/${day.slice(0, 4)}`, '#life-panel .life-year'],
      ['diary-search', '#life/diary/search?q=youtube', '#life-panel .life-search-view, #life-panel .life-empty'],
      // seletores que só a aba pedida desenha (o conteúdo da aba anterior fica esmaecido até a nova escrever)
      ['finances-overview', '#life/finances/overview', '#life-panel .fin-embedded .fin-pane .fin-conn'],
      ['finances-transactions', `#life/finances/transactions?from=${day}&to=${day}`, '#life-panel .fin-embedded .fin-pane .fin-tx .fin-table'],
      ['ai-overview', '#life/ai/overview', '#life-panel .aiu-embedded .aiu-pane .aiu-kpis .aiu-kpi'],
      ['ai-sessions', `#life/ai/sessions?from=${day}&to=${day}`, '#life-panel .aiu-embedded .aiu-pane .aiu-card:has(.aiu-search) tbody tr'],
    ];
    await page.goto(`http://127.0.0.1:7000/#life/diary/${day}`, { waitUntil: 'networkidle', timeout: 60000 });
    await setTheme();
    await page.waitForSelector('#life-panel .life-day, #life-panel .life-empty', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await snap('diary-day');
    await page.evaluate(() => document.querySelector('#life-panel .life-dg > summary')?.click());
    await page.waitForTimeout(300);
    await snap('diary-day-open');
    for (const [key, hash, sel] of routes) {
      await page.evaluate(x => { location.hash = x; }, hash);
      await page.waitForSelector(sel, { timeout: 20000 });
      await page.waitForTimeout(800);
      await snap(key);
    }
    if (w === 390) {
      await page.evaluate(() => { location.hash = '#life'; });
      await page.waitForSelector('#life-panel.is-index .life-rail', { timeout: 20000 });
      await page.waitForTimeout(500);
      await snap('index');
    }
    // abrir → fechar → abrir → fechar pela barra lateral: o modalManager esquece o registro no close(); o hub registra
    // de novo a cada abertura, senão o ✖ parava de funcionar na segunda vez. No desktop fecha no ✖ (clique de
    // verdade); no celular o ✖ some (02-compare.css): fecha com Esc e depois como o arrasto da folha para baixo faz
    // em ui.js (.hidden + evento 'modal-dismissed').
    const isHidden = () => document.getElementById('life-panel')?.classList.contains('hidden');
    const closePanel = async (step, how) => {
      if (how === 'x') await page.click('#life-panel .close-btn', { timeout: 5000 });
      else if (how === 'esc') await page.keyboard.press('Escape');
      else await page.evaluate(() => { const m = document.getElementById('life-panel'); m.classList.add('hidden'); window.dispatchEvent(new CustomEvent('modal-dismissed', { detail: { id: m.id } })); });
      try { await page.waitForFunction(isHidden, null, { timeout: 5000 }); } catch (_) { errors.push(`${tag} ${step} (${how}): the panel did not hide`); }
    };
    const phone = w < 640;
    await closePanel('close-initial', phone ? 'esc' : 'x');
    const CHAT = '#lifecheck-chat';
    await page.evaluate(h => history.replaceState(null, '', location.pathname + location.search + h), CHAT);
    for (const [round, how] of phone ? [[1, 'esc'], [2, 'swipe']] : [[1, 'x'], [2, 'x']]) {
      await page.evaluate(() => document.querySelector('#lifelog-list .life-side-item[data-app="finances"]').click());
      await page.waitForSelector('#life-panel:not(.hidden) .fin-embedded .fin-pane :is(.fin-table, .fin-conn)', { timeout: 20000 });
      const st = await page.evaluate(() => ({ hash: location.hash, minimize: document.querySelectorAll('#life-panel .modal-minimize-btn').length }));
      if (!st.hash.startsWith('#life/finances')) errors.push(`${tag} open ${round}: URL ${st.hash}`);
      if (st.minimize !== 1) errors.push(`${tag} open ${round}: ${st.minimize} minimize buttons`);
      await page.waitForTimeout(400);
      await closePanel(`close ${round}`, how);
      const hash = await page.evaluate(() => location.hash);
      if (hash !== CHAT) errors.push(`${tag} close ${round}: URL ${hash} (expected ${CHAT})`);
      // o unmount vai pela fila do hub: espera ela esvaziar o host
      try { await page.waitForFunction(() => !document.querySelector('#life-panel .life-host > *'), null, { timeout: 5000 }); } catch (_) { errors.push(`${tag} close ${round}: the app is still mounted`); }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ errors, shots }, null, 1));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(2); });
