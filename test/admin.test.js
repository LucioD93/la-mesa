import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { turnHosts } from '../server/admin.js';
import { createMetered } from '../server/metered.js';
import { createCloudflareUsage, dailyUsage, monthBill } from '../server/cloudflare.js';
import { Stats, memoryKv } from '../server/stats.js';

// The admin page: its data is behind a shared password.

async function start(t) {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = 'letmein';
  const { server } = createApp();
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
  return { port, get };
}

async function client(port, match, token, hello = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?match=${match}`);
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'hello', token, name: token, ...hello }));
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

test('tracks who is in voice from signaling, and counts usage', async (t) => {
  const { port, get } = await start(t);
  const a = await client(port, 'room-1', 'token-a');
  t.after(() => a.ws.terminate());
  const voiceNow = async () => {
    await settle();
    return (await (await get('letmein')).json()).live.voice;
  };

  assert.deepEqual(await voiceNow(), []);
  a.send({ t: 'voice', data: { kind: 'join' } });
  assert.deepEqual(await voiceNow(), [{ match: 'room-1', people: 1 }]);

  const report = await (await get('letmein')).json();
  const today = report.days.at(-1);
  assert.equal(report.days.length, 30);
  assert.equal(today.voiceJoins, 1);
  assert.ok(today.socketIn > 0 && today.socketOut > 0);
  assert.equal(report.total.voiceJoins, 1);
  assert.equal(report.live.matches, 1);
  assert.equal(report.live.online, 1);

  a.send({ t: 'voice', data: { kind: 'leave' } });
  assert.deepEqual(await voiceNow(), []);

  // Hanging up by closing the socket counts too.
  a.send({ t: 'voice', data: { kind: 'join' } });
  assert.deepEqual(await voiceNow(), [{ match: 'room-1', people: 1 }]);
  a.ws.close();
  assert.deepEqual(await voiceNow(), []);
});

test('a socket handover stays in voice', async (t) => {
  const { port, get } = await start(t);
  const voiceNow = async () => {
    await settle();
    return (await (await get('letmein')).json()).live.voice;
  };
  const a = await client(port, 'room-1', 'token-a', { session: 'same' });
  t.after(() => a.ws.terminate());
  a.send({ t: 'voice', data: { kind: 'join' } });
  assert.deepEqual(await voiceNow(), [{ match: 'room-1', people: 1 }]);

  const b = await client(port, 'room-1', 'token-a', { session: 'same', inVoice: true });
  t.after(() => b.ws.terminate());
  a.send({ t: 'handoff' });
  await settle();
  a.ws.close();
  assert.deepEqual(await voiceNow(), [{ match: 'room-1', people: 1 }]);
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

test('the report shows every counter and says which services are configured', async (t) => {
  const { port, get } = await start(t);
  const a = await client(port, 'room-1', 'token-a');
  t.after(() => a.ws.terminate());
  a.send({ t: 'voice', data: { kind: 'join' } });
  await settle();
  const report = await (await get('letmein')).json();
  const today = report.days.at(-1);
  for (const field of ['sockets', 'messages', 'socketIn', 'socketOut', 'saves', 'voiceJoins']) assert.ok(today[field] > 0, field);
  assert.equal(report.cloudflare, null);
  assert.deepEqual(report.services.store.type, 'memory');
  assert.equal(report.services.cloudflare, false);
});

test('stats forget matches that stopped reporting, and old days', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 7) });
  const kv = memoryKv();
  const stats = new Stats(kv);
  stats.report('a', { online: 4, voice: 2 }, { '2026-11-07': { sockets: 4 } });
  stats.report('b', { online: 1, voice: 0 }, { '2026-11-07': { sockets: 1 }, '2026-07-01': { sockets: 9 } });
  assert.deepEqual(stats.overview(), { voice: [{ match: 'a', people: 2 }], matches: 2, online: 5 });
  assert.deepEqual(stats.readUsage(['2026-11-07']), { days: { '2026-11-07': { sockets: 5 } }, total: { sockets: 14 } });
  assert.ok(!kv.map.has('usage:2026-07-01'), 'older than 100 days');

  stats.report('b', { online: 0, voice: 0 });
  t.mock.timers.tick(16 * 60_000); // a's room was reset and never said goodbye
  assert.deepEqual(stats.overview(), { voice: [], matches: 0, online: 0 });
});

/** One day of Cloudflare's GraphQL groups. */
const groups = (date, n) => ({
  workers: [{ dimensions: { date }, sum: { requests: n, cpuTimeUs: n * 1000 } }],
  invocations: [
    { dimensions: { date, type: 'fetch' }, sum: { requests: n } },
    { dimensions: { date, type: 'websocketMessage' }, sum: { requests: 20 * n } },
  ],
  periodic: [{ dimensions: { date }, sum: { duration: n, cpuTime: n * 1000, inboundWebsocketMsgCount: 0, outboundWebsocketMsgCount: n, rowsRead: n, rowsWritten: n } }],
  storage: [{ dimensions: { date }, max: { storedBytes: 1e9 } }],
});

test('turns Cloudflare analytics into an estimated bill', () => {
  const merge = (...days) => Object.fromEntries(['workers', 'invocations', 'periodic', 'storage'].map((k) => [k, days.flatMap((d) => d[k])]));
  const { days, types } = dailyUsage(merge(groups('2026-10-31', 1e6), groups('2026-11-01', 60e6), groups('2026-11-02', 1e6)));
  assert.deepEqual(types, { fetch: 62e6, websocketMessage: 1240e6 });
  assert.equal(days[1].doRequestsBilled, 120e6, 'socket messages bill 20 to 1');

  // Halfway through November: October's day doesn't count.
  const bill = monthBill(days, Date.UTC(2026, 10, 16));
  const line = (id) => bill.lines.find((l) => l.id === id);
  assert.equal(bill.month, '2026-11');
  assert.equal(line('rowsWritten').used, 61e6);
  assert.ok(Math.abs(line('rowsWritten').cost - 11) < 1e-9, '11M rows over the 50M included');
  assert.ok(Math.abs(line('doRequests').cost - 122e6 * 0.15e-6 + 0.15) < 1e-9);
  assert.ok(Math.abs(line('workerRequests').cost - 51e6 * 0.3e-6) < 1e-9, '51M over the 10M included');
  assert.equal(line('rowsRead').cost, 0);
  assert.ok(Math.abs(line('rowsWritten').projected - 122e6) < 1e-3, 'twice as much by the end of the month');
  assert.ok(bill.projectedCost > bill.cost && bill.cost > 5);
});

test('Cloudflare usage is optional, cached, and reports errors without the token', async (t) => {
  assert.equal(await createCloudflareUsage().usage(), null);
  process.env.CF_ACCOUNT_ID = 'acct';
  process.env.CF_API_TOKEN = 'very secret';
  t.after(() => {
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_API_TOKEN;
  });
  const calls = [];
  const cf = createCloudflareUsage(async (url, init) => {
    calls.push(init);
    return { ok: true, json: async () => ({ data: { viewer: { accounts: [groups('2026-11-07', 10)] } } }) };
  });
  const now = Date.UTC(2026, 10, 7, 12);
  const usage = await cf.usage(now);
  assert.equal(usage.ok, true);
  assert.equal(usage.days.length, 1);
  assert.equal(calls[0].headers.authorization, 'Bearer very secret');
  assert.deepEqual(JSON.parse(calls[0].body).variables, { account: 'acct', since: '2026-10-09', until: '2026-11-07' });
  await cf.usage(now + 60_000);
  assert.equal(calls.length, 1, 'served from the cache');

  const failing = createCloudflareUsage(async () => ({ ok: true, json: async () => ({ errors: [{ message: 'not authorized' }] }) }));
  const failed = await failing.usage(now);
  assert.deepEqual(failed, { ok: false, error: 'not authorized' });
});
