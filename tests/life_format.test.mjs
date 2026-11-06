// Fork-local: formatação pura e ícones do painel Life (static/js/life/format.js, icons.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../static/js/life/format.js';
import { icon, ICON_NAMES } from '../static/js/life/icons.js';

test('dates', () => {
  assert.equal(f.fmtDate('2023-03-14'), 'Tue, 14 Mar 2023');
  assert.equal(f.fmtDateLong('2023-03-14'), 'Tuesday, 14 March 2023');
  assert.equal(f.fmtMonth('2023-03'), 'March 2023');
  assert.equal(f.shiftDay('2023-03-01', -1), '2023-02-28');
  assert.equal(f.shiftDay('2024-02-28', 1), '2024-02-29');
  assert.equal(f.shiftMonth('2023-01', -1), '2022-12');
  assert.equal(f.shiftMonth('2023-12', 1), '2024-01');
  assert.equal(f.yearsAgo(1), '1 year ago');
  assert.equal(f.yearsAgo(3), '3 years ago');
});

test('numbers and money', () => {
  assert.equal(f.compact(5117), '5.1k');
  assert.equal(f.compact(5000), '5k');
  assert.equal(f.compact(950), '950');
  assert.equal(f.fmtMoney(-21200, 'BRL'), '−R$ 212');
  assert.equal(f.fmtMoney(1250, 'EUR'), '€ 12.50');
  assert.equal(f.fmtMoney(123456, 'BRL', { decimals: 2 }), 'R$ 1,234.56');
});

test('hash routing round-trip', () => {
  assert.deepEqual(f.parseHash('#life/2023-03-14'), { view: 'day', day: '2023-03-14' });
  assert.deepEqual(f.parseHash('#life/2023-03'), { view: 'month', month: '2023-03' });
  assert.deepEqual(f.parseHash('#life/2023'), { view: 'year', year: '2023' });
  assert.deepEqual(f.parseHash('#life/search?q=p%C3%A3o'), { view: 'search', q: 'pão' });
  assert.deepEqual(f.parseHash('#life'), { view: null });
  assert.equal(f.parseHash('#abc123'), null);
  assert.equal(f.parseHash('#lifestyle'), null);
  assert.equal(f.buildHash({ view: 'day', day: '2023-03-14' }), '#life/2023-03-14');
  assert.equal(f.buildHash({ view: 'month', day: '2023-03-14' }), '#life/2023-03');
  assert.equal(f.buildHash({ view: 'year', day: '2023-03-14' }), '#life/2023');
  assert.equal(f.buildHash({ view: 'search', q: 'pão' }), '#life/search?q=p%C3%A3o');
});

test('escape and highlight', () => {
  assert.equal(f.escapeHtml('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
  assert.equal(f.highlight('Padaria <b>', 'pad'), '<mark>Pad</mark>aria &lt;b&gt;');
  assert.equal(f.highlight('abc', ''), 'abc');
});

test('icons are inline svg with a safe fallback', () => {
  for (const n of ICON_NAMES) assert.match(icon(n), /^<svg class="life-svg"[^>]*aria-hidden="true"/);
  assert.equal(icon('nope'), icon('other'));
  assert.match(icon('money', 20), /width="20" height="20"/);
});
