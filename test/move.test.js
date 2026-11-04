import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/move.js', import.meta.url), 'utf8');

/** Run the script on a fake page. Like a real one, replaceState drops the fragment. */
function run(url, stored = {}) {
  const u = new URL(url);
  const storage = new Map(Object.entries(stored));
  const out = { storage, went: null, replaced: null };
  vm.runInNewContext(source, {
    location: {
      hostname: u.hostname,
      pathname: u.pathname,
      search: u.search,
      get hash() {
        return out.hash ?? u.hash;
      },
      replace: (to) => (out.went = to),
    },
    history: {
      replaceState: (_s, _t, to) => {
        out.replaced = to;
        out.hash = '';
      },
    },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    },
  });
  return out;
}

const TOKEN = 'ab'.repeat(16);
const carried = (saved) => `#carry=${encodeURIComponent(JSON.stringify(saved))}`;

test('the old address sends you to the new one with your saved data', () => {
  const { went } = run('https://domino-ten-theta.vercel.app/play/arepa-123?game=truco', {
    'domino.token': TOKEN,
    'domino.name': 'Ana',
    'domino.other': 'not this',
  });
  const to = new URL(went);
  assert.equal(to.origin + to.pathname + to.search, 'https://la-mesa-app.vercel.app/play/arepa-123?game=truco');
  assert.deepEqual(JSON.parse(decodeURIComponent(to.hash.slice(7))), { token: TOKEN, name: 'Ana' });
});

test('a first visit to the old address moves without a fragment', () => {
  assert.equal(run('https://domino-ten-theta.vercel.app/').went, 'https://la-mesa-app.vercel.app/');
});

test('the new address stores what was carried and cleans the URL', () => {
  const photo = 'data:image/jpeg;base64,AAAA';
  const hash = carried({ token: TOKEN, name: 'Ana', avatar: photo, lang: 'es', muted: '1' });
  const { storage, replaced, went } = run(`https://la-mesa-app.vercel.app/play/arepa-123?game=truco${hash}`);
  assert.equal(went, null);
  assert.equal(replaced, '/play/arepa-123?game=truco');
  assert.deepEqual(Object.fromEntries(storage), {
    'domino.token': TOKEN,
    'domino.name': 'Ana',
    'domino.avatar': photo,
    'domino.lang': 'es',
    'domino.muted': '1',
  });
});

test('a carried value never replaces what this browser already has', () => {
  const { storage } = run(`https://la-mesa-app.vercel.app/${carried({ token: TOKEN, name: 'Ana' })}`, {
    'domino.token': 'cd'.repeat(16),
  });
  assert.equal(storage.get('domino.token'), 'cd'.repeat(16));
  assert.equal(storage.get('domino.name'), 'Ana');
});

test('bad carried data is ignored', () => {
  const hash = carried({ token: 'short', name: 'x'.repeat(17), avatar: 'data:image/svg+xml,<svg/>', lang: 'fr', muted: 'yes', evil: 'x' });
  assert.equal(run(`https://la-mesa-app.vercel.app/${hash}`).storage.size, 0);
  assert.equal(run('https://la-mesa-app.vercel.app/#carry=%E0%A4%A').storage.size, 0);
  assert.equal(run('https://la-mesa-app.vercel.app/').replaced, null);
});
