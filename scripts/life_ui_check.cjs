// Fork-local: checagem visual do painel Life no Chromium headless DENTRO do container do Odysseus.
// Uso (no host):
//   docker cp scripts/life_ui_check.cjs odysseus-odysseus-1:/tmp/ && docker exec odysseus-odysseus-1 node /tmp/life_ui_check.cjs 2023-03-14
// Entra pelo proxy do NAS com o segredo do PRÓPRIO ambiente do container (nunca sai dele), percorre Diary (dia/mês/ano/busca), Finances e AI usage
// em 1440 px (escuro e claro) e 390 px, grava /tmp/life-*.png e sai com código 1 se houver erro de JS ou 4xx/5xx.
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
    page.on('response', r => { if (r.status() >= 400 && /\/static\/|\/api\/lifelog/.test(r.url())) errors.push(`${tag} ${r.status()} ${r.url()}`); });
    const snap = async name => { const f = `/tmp/life-${name}-${tag}.png`; await page.screenshot({ path: f }); shots.push(f); };
    const setTheme = async () => { if (theme === 'light') await page.evaluate(v => { document.documentElement.classList.add('light'); for (const [k, x] of Object.entries(v)) document.documentElement.style.setProperty(k, x); }, LIGHT); };
    const routes = [
      ['diary-month', `#life/diary/${day.slice(0, 7)}`, '#life-panel .life-month'],
      ['diary-year', `#life/diary/${day.slice(0, 4)}`, '#life-panel .life-year'],
      ['diary-search', '#life/diary/search?q=youtube', '#life-panel .life-search-view, #life-panel .life-empty'],
      ['finances-overview', '#life/finances/overview', '#life-panel .fin-embedded .fin-body > *'],
      ['finances-transactions', `#life/finances/transactions?from=${day}&to=${day}`, '#life-panel .fin-embedded .fin-body > *'],
      ['ai-overview', '#life/ai/overview', '#life-panel .aiu-embedded .aiu-body > *'],
      ['ai-sessions', `#life/ai/sessions?from=${day}&to=${day}`, '#life-panel .aiu-embedded .aiu-body > *'],
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
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ errors, shots }, null, 1));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(2); });
