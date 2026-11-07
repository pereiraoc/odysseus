// Fork-local: rotas do hub Life (static/js/life/router.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_IDS, lifeHref, parseLifeHash } from '../static/js/life/router.js';

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
