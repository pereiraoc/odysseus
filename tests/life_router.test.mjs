// Fork-local: rotas do hub Life (static/js/life/router.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_IDS, isIsoDate, lifeHref, parseLifeHash } from '../static/js/life/router.js';

test('apps and hrefs', () => {
  assert.deepEqual(APP_IDS, ['diary', 'finances', 'ai']);
  assert.equal(lifeHref('diary', ['2023-03-14']), '#life/diary/2023-03-14');
  assert.equal(lifeHref('finances', ['transactions'], { from: '2023-03-14', to: '2023-03-14', q: '' }),
    '#life/finances/transactions?from=2023-03-14&to=2023-03-14');
  assert.equal(lifeHref('ai'), '#life/ai');
  assert.equal(lifeHref('diary', ['search'], { q: 'pão quente' }), '#life/diary/search?q=p%C3%A3o+quente');
});

test('parse app routes', () => {
  assert.deepEqual(parseLifeHash('#life/diary/2023-03-14'), { app: 'diary', path: ['2023-03-14'], params: {} });
  assert.deepEqual(parseLifeHash('#life/finances/transactions?from=2023-03-14&to=2023-03-14'),
    { app: 'finances', path: ['transactions'], params: { from: '2023-03-14', to: '2023-03-14' } });
  assert.deepEqual(parseLifeHash('#life/ai'), { app: 'ai', path: [], params: {} });
  assert.deepEqual(parseLifeHash('#life/diary/search?q=p%C3%A3o+quente'), { app: 'diary', path: ['search'], params: { q: 'pão quente' } });
  assert.deepEqual(parseLifeHash('#life'), { app: null, path: [], params: {} });
});

test('legacy diary hashes', () => {
  assert.deepEqual(parseLifeHash('#life/2023-03-14'), { app: 'diary', path: ['2023-03-14'], params: {} });
  assert.deepEqual(parseLifeHash('#life/2023-03'), { app: 'diary', path: ['2023-03'], params: {} });
  assert.deepEqual(parseLifeHash('#life/2023'), { app: 'diary', path: ['2023'], params: {} });
  assert.deepEqual(parseLifeHash('#life/search?q=razer'), { app: 'diary', path: ['search'], params: { q: 'razer' } });
});

test('foreign and unknown hashes', () => {
  assert.equal(parseLifeHash('#abc123'), null);
  assert.equal(parseLifeHash('#lifestyle'), null);
  assert.equal(parseLifeHash(''), null);
  assert.deepEqual(parseLifeHash('#life/nope/x'), { app: null, path: [], params: {} });
});

test('round trip', () => {
  for (const [app, path, params] of [['diary', ['2023-03'], {}], ['finances', ['monthly'], {}], ['ai', ['sessions'], { from: '2026-11-01', to: '2026-11-05' }]]) {
    assert.deepEqual(parseLifeHash(lifeHref(app, path, params)), { app, path, params });
  }
});

test('malformed escapes return null', () => {
  assert.equal(parseLifeHash('#life/%'), null);
  assert.equal(parseLifeHash('#life/diary/%E0%A4%A'), null);
  assert.equal(lifeHref('ai', [], null), '#life/ai');
});

test('isIsoDate accepts only YYYY-MM-DD', () => {
  for (const ok of ['2023-03-14', '1999-12-31']) assert.equal(isIsoDate(ok), true, ok);
  for (const bad of ['', null, undefined, '2023-03', '2023-3-14', '2023-03-14T00:00', ' 2023-03-14', '2023-03-14 ',
    '"><img src=x>', '2023-03-14"><img src=x>', 20230314]) assert.equal(isIsoDate(bad), false, String(bad));
});

test('crafted Finances hash keeps the payload only as a string param', () => {
  const r = parseLifeHash('#life/finances/transactions?from=%22%3E%3Cimg%20src%3Dx%3E&to=2023-01-01');
  assert.equal(r.app, 'finances');
  assert.equal(r.params.from, '"><img src=x>');
  assert.equal(isIsoDate(r.params.from), false);
  assert.equal(isIsoDate(r.params.to), true);
});
