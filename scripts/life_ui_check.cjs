// Fork-local: checagem visual do painel Life no Chromium headless DENTRO do container do Odysseus.
// Uso (no host):
//   docker cp scripts/life_ui_check.cjs odysseus-odysseus-1:/tmp/ && docker exec odysseus-odysseus-1 node /tmp/life_ui_check.cjs 2023-03-14
// Entra pelo proxy do NAS com o segredo do PRÓPRIO ambiente do container (nunca sai dele), percorre dia/mês/ano/busca
// em 1440 px (escuro e claro) e 390 px, grava /tmp/life-*.png e sai com código 1 se houver erro de JS ou 4xx/5xx.
// As capturas têm dados pessoais: apagar depois de revisar.
const fs = require('fs');
const path = require('path');

const base = '/app/.npm/_npx';
const pw = fs.readdirSync(base).map(d => path.join(base, d, 'node_modules/playwright-core')).find(p => fs.existsSync(p));
const { chromium } = require(pw);
const LIGHT = { '--bg': '#f3f5f7', '--fg': '#26313a', '--panel': '#ffffff', '--border': '#cbd3da' };

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
    await page.goto(`http://127.0.0.1:7000/#life/${day}`, { waitUntil: 'networkidle', timeout: 60000 });
    if (theme === 'light') await page.evaluate(v => { for (const [k, x] of Object.entries(v)) document.documentElement.style.setProperty(k, x); }, LIGHT);
    const snap = async name => { const f = `/tmp/life-${name}-${tag}.png`; await page.screenshot({ path: f }); shots.push(f); };
    await page.waitForSelector('#life-panel .life-day, #life-panel .life-empty', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await snap('day');
    await page.evaluate(() => document.querySelector('#life-panel .life-dg > summary')?.click());
    await page.waitForTimeout(300);
    await snap('day-open');
    for (const [view, hash] of [['month', day.slice(0, 7)], ['year', day.slice(0, 4)]]) {
      await page.evaluate(x => { location.hash = `#life/${x}`; }, hash);
      await page.waitForSelector(`#life-panel .life-${view}`, { timeout: 20000 });
      await page.waitForTimeout(800);
      await snap(view);
    }
    await page.evaluate(() => { location.hash = '#life/search?q=youtube'; });
    await page.waitForSelector('#life-panel .life-search-view, #life-panel .life-empty', { timeout: 20000 });
    await page.waitForTimeout(800);
    await snap('search');
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ errors, shots }, null, 1));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FALHOU', e); process.exit(2); });
