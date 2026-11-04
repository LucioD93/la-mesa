import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { turnHosts } from '../server/admin.js';
import { createMetered } from '../server/metered.js';
import { MemoryStore } from '../server/store.js';

// The admin page: its data is behind a shared password and adds up what voice
// clients report.

async function start(t) {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'letmein';
  const { server, hubReady } = createApp({ store: new MemoryStore() });
  server.listen(0);
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  });
  const { port } = server.address();
  const get = (password) =>
    fetch(`http://127.0.0.1:${port}/api/admin`, { headers: password ? { authorization: `Bearer ${password}` } : {} });
  return { port, get, hub: await hubReady };
}

async function client(port, match, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?match=${match}`);
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'hello', token, name: token }));
  await new Promise((resolve) => ws.on('message', (raw) => JSON.parse(raw).t === 'voiceConfig' && resolve()));
  return { ws, send: (m) => ws.send(JSON.stringify(m)) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('needs the shared password and fails closed without one', async (t) => {
  const { get } = await start(t);
  assert.equal((await get()).status, 401);
  assert.equal((await get('wrong')).status, 401);
  const ok = await get('letmein');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  delete process.env.ADMIN_PASSWORD;
  assert.equal((await get('letmein')).status, 503);
});

test('locks an address out after repeated wrong passwords', async (t) => {
  const { get } = await start(t);
  for (let i = 0; i < 10; i++) assert.equal((await get('wrong')).status, 401);
  assert.equal((await get('letmein')).status, 429);
});

test('adds up voice usage and shows who is in voice', async (t) => {
  const { port, get, hub } = await start(t);
  const a = await client(port, 'room-1', 'token-a');
  t.after(() => a.ws.terminate());

  a.send({ t: 'voice', data: { kind: 'join' } });
  a.send({ t: 'voiceStats', seconds: 20, sent: 1000, received: 2000, relayed: 500 });
  await settle();
  await hub.usage.flush();

  let report = await (await get('letmein')).json();
  const today = report.days.at(-1);
  assert.equal(report.days.length, 30);
  assert.equal(today.voiceSeconds, 20);
  assert.equal(today.voiceJoins, 1);
  assert.equal(today.audioSent, 1000);
  assert.equal(today.audioReceived, 2000);
  assert.equal(today.audioRelayed, 500);
  assert.ok(today.socketIn > 0 && today.socketOut > 0);
  assert.equal(report.total.audioSent, 1000);
  assert.deepEqual(report.live.voice, [{ match: 'room-1', people: 1 }]);
  assert.equal(report.live.matches, 1);
  assert.equal(report.live.online, 1);

  a.send({ t: 'voiceStats', seconds: 0, left: true });
  await settle();
  await hub.usage.flush();
  report = await (await get('letmein')).json();
  assert.deepEqual(report.live.voice, []);
});

test('ignores bad and too-frequent voice reports', async (t) => {
  const { port, get, hub } = await start(t);
  const a = await client(port, 'room-1', 'token-a');
  t.after(() => a.ws.terminate());

  a.send({ t: 'voiceStats', seconds: 1e9, sent: -5, received: 'lots', relayed: 1e12 });
  a.send({ t: 'voiceStats', seconds: 20, sent: 1000 }); // too soon after the last one
  await settle();
  await hub.usage.flush();

  const { days } = await (await get('letmein')).json();
  const today = days.at(-1);
  assert.equal(today.voiceSeconds, 60);
  assert.equal(today.audioSent, undefined);
  assert.equal(today.audioReceived, undefined);
  assert.equal(today.audioRelayed, 10_000_000);
});

test('reads Metered usage, caches it, and never reports the key', async (t) => {
  process.env.METERED_APP = 'my-app';
  process.env.METERED_SECRET_KEY = 'top secret';
  t.after(() => {
    delete process.env.METERED_APP;
    delete process.env.METERED_SECRET_KEY;
  });
  const urls = [];
  const replies = {
    current_usage: { quotaInGB: 0.5, usageInGB: 0.25, overageInGB: 0 },
    current_usage_by_date: [{ date: '2026-11-03', usageInGB: 0.25 }],
  };
  const metered = createMetered(async (url) => {
    urls.push(url);
    const path = new URL(url).pathname.split('/').pop();
    return { ok: true, json: async () => replies[path] };
  });

  const usage = await metered.usage(1000);
  assert.deepEqual(usage, {
    ok: true,
    quotaGB: 0.5,
    usedGB: 0.25,
    overageGB: 0,
    days: [{ date: '2026-11-03', usedGB: 0.25 }],
  });
  assert.ok(urls[0].startsWith('https://my-app.metered.live/api/v1/turn/'));
  assert.ok(urls[0].endsWith('?secretKey=top%20secret'));
  assert.ok(!JSON.stringify(usage).includes('secret'));

  await metered.usage(2000);
  assert.equal(urls.length, 2); // served from the cache
  await metered.usage(1000 + 60_000);
  assert.equal(urls.length, 4);
});

test('Metered is optional and its failures do not break the page', async (t) => {
  assert.equal(await createMetered().usage(), null);

  process.env.METERED_APP = 'my-app';
  process.env.METERED_SECRET_KEY = 'key';
  t.after(() => {
    delete process.env.METERED_APP;
    delete process.env.METERED_SECRET_KEY;
  });
  const failing = createMetered(async () => ({ ok: false, status: 401 }));
  assert.deepEqual(await failing.usage(), { ok: false });
});

test('names TURN hosts without exposing credentials', () => {
  const hosts = turnHosts([
    { urls: 'stun:stun.example.com:3478' },
    { urls: ['turn:relay.example.com:3478?transport=udp', 'turns:relay.example.com:443'], username: 'u', credential: 'secret' },
  ]);
  assert.deepEqual(hosts, ['relay.example.com']);
});
