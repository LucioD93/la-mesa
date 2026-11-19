import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { ID_COOKIE, idCookie, idFromCookie, saveId, withId } from '../server/identity.js';

// A device's player token, kept in a cookie too, so a browser that clears localStorage
// gets it back from /play.

const TOKEN = '0123456789abcdef0123456789abcdef';

test('the token comes out of a Cookie header, and only a token-like one', () => {
  assert.equal(idFromCookie(`a=1; ${ID_COOKIE}=${TOKEN}; b=2`), TOKEN);
  assert.equal(idFromCookie(`${ID_COOKIE}=${TOKEN}`), TOKEN);
  assert.equal(idFromCookie('a=1'), null);
  assert.equal(idFromCookie(undefined), null);
  assert.equal(idFromCookie(`${ID_COOKIE}=<script>`), null);
  assert.equal(idFromCookie(`${ID_COOKIE}=short`), null);
});

test('the cookie lasts 400 days, is HttpOnly, and is Secure over https', () => {
  assert.equal(idCookie(TOKEN, true), `${ID_COOKIE}=${TOKEN}; Max-Age=34560000; Path=/; HttpOnly; SameSite=Lax; Secure`);
  assert.doesNotMatch(idCookie(TOKEN, false), /Secure/);
});

test('the page gets the token in a meta tag', () => {
  const html = withId('<html><head><title>x</title></head><body></body></html>', TOKEN);
  assert.match(html, new RegExp(`<meta name="la-mesa-id" content="${TOKEN}" />\\s*</head>`));
});

test('only the page itself can save a token', () => {
  const base = { method: 'POST', host: 'jugar.example', secure: true, body: TOKEN };
  assert.deepEqual(saveId({ ...base, fetchSite: 'same-origin' }), { status: 204, cookie: idCookie(TOKEN, true) });
  assert.equal(saveId({ ...base, origin: 'https://jugar.example' }).status, 204);
  assert.equal(saveId(base).status, 204); // no browser headers at all: curl, a test
  assert.equal(saveId({ ...base, fetchSite: 'cross-site' }).status, 403);
  assert.equal(saveId({ ...base, fetchSite: 'same-site' }).status, 403);
  assert.equal(saveId({ ...base, origin: 'https://evil.example' }).status, 403);
  assert.equal(saveId({ ...base, origin: 'null' }).status, 403);
  assert.equal(saveId({ ...base, body: 'not a token!' }).status, 400);
  assert.equal(saveId({ ...base, method: 'GET' }).status, 405);
});

async function start(t) {
  const { server } = createApp();
  server.listen(0);
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('the local server saves the token and hands it back with /play', async (t) => {
  const url = await start(t);

  const fresh = await fetch(`${url}/play/arepa-123`);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers.get('set-cookie'), null);
  assert.doesNotMatch(await fresh.text(), /la-mesa-id/);

  const saved = await fetch(`${url}/api/id`, { method: 'POST', body: TOKEN, headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(saved.status, 204);
  const cookie = saved.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^${ID_COOKIE}=${TOKEN};`));

  const back = await fetch(`${url}/play/arepa-123`, { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(back.status, 200);
  assert.equal(back.headers.get('cache-control'), 'private, no-store');
  assert.match(back.headers.get('set-cookie'), /Max-Age=34560000/); // another 400 days
  assert.match(await back.text(), new RegExp(`<meta name="la-mesa-id" content="${TOKEN}"`));

  const refused = await fetch(`${url}/api/id`, { method: 'POST', body: TOKEN, headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get('set-cookie'), null);
});
