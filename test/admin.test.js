import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { turnHosts } from '../server/admin.js';
import { createMetered } from '../server/metered.js';
import { DATASETS, alertsFor, buildQuery, createCloudflareUsage, dailyLimits, dailyUsage, monthBill, windowOf } from '../server/cloudflare.js';
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

/** One day of the daily datasets, as flat rows. */
const groups = (date, n) => ({
  workers: [{ date, requests: n, cpuTimeUs: n * 1000 }],
  invocations: [
    { date, type: 'fetch', requests: n },
    { date, type: 'websocketMessage', requests: 20 * n },
  ],
  periodic: [{ date, duration: n, cpuTime: n * 1000, inboundWebsocketMsgCount: 0, outboundWebsocketMsgCount: n, rowsRead: n, rowsWritten: n }],
  storage: [{ date, maxStoredBytes: 1e9 }],
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

test('today against the free limits: the share, the time it runs out, and what is unknown', () => {
  const noon = Date.UTC(2026, 11, 7, 12);
  const days = [{ date: '2026-12-06', storedBytes: 2e9, rowsRead: 9e6 }, { date: '2026-12-07', rowsWritten: 80e3, rowsRead: 1000, workerRequests: 10 }];
  const line = (id) => dailyLimits(days, noon).find((l) => l.id === id);
  assert.equal(line('rowsWritten').share, 0.8);
  assert.equal(line('rowsWritten').projected, 160e3, 'twice as much by the end of the day');
  assert.equal(new Date(line('rowsWritten').runsOutAt).toISOString(), '2026-12-07T15:00:00.000Z');
  assert.equal(line('workerRequests').runsOutAt, null);
  assert.equal(line('doRequests').used, null, 'no dataset gave it');
  assert.equal(line('doRequests').share, null);
  assert.equal(line('storage').used, 2, 'the last day with a figure');
  // A busy start says little: no guess in the day's first hour.
  assert.equal(dailyLimits(days, Date.UTC(2026, 11, 7, 0, 30)).find((l) => l.id === 'rowsWritten').runsOutAt, null);
});

test('warns near a limit, past one, and about what could not be read', () => {
  const noon = Date.UTC(2026, 11, 7, 12);
  const today = { date: '2026-12-07', rowsWritten: 100e3, workerRequests: 85e3, doDuration: 1, exceededCpu: 2, workerCpuMax: 12 };
  const limits = dailyLimits([today], noon);
  const alerts = alertsFor({ plan: 'free', limits, bill: monthBill([today], noon), today, failed: [{ label: 'Static files', error: 'HTTP 500' }], limited: [] });
  const texts = alerts.map((a) => `${a.level} ${a.text}`);
  assert.equal(alerts[0].level, 'bad', 'the worst come first');
  assert.ok(texts.some((t) => t.startsWith('bad SQLite rows written') && t.includes('00:00 UTC')));
  assert.ok(texts.some((t) => t.startsWith('warn Worker requests: 85%')));
  assert.ok(texts.some((t) => t.startsWith('warn Worker requests: at this pace') && t.includes('14:')), 'runs out around 14:07 UTC');
  assert.ok(texts.some((t) => t.startsWith('bad Objects hit the CPU limit 2 times')));
  assert.ok(texts.some((t) => t.includes('12.0 ms of CPU')));
  assert.ok(texts.some((t) => t === 'warn Could not read Static files: HTTP 500.'));

  const quiet = dailyLimits([{ date: '2026-12-07', rowsWritten: 10 }], noon);
  assert.deepEqual(alertsFor({ plan: 'free', limits: quiet, bill: monthBill([], noon), today: {}, failed: [], limited: [] }), []);
});

test('each dataset is asked for only what the account allows', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  const days = DATASETS.periodic;
  assert.deepEqual(windowOf(days, undefined, now), { since: '2026-10-22', until: '2026-11-20', limited: false });
  const cut = windowOf(days, { notOlderThan: 3 * 86400, maxDuration: 32 * 86400 }, now);
  assert.equal(cut.limited, true);
  assert.equal(cut.since, '2026-11-19', 'whole days inside the reach, with a margin');
  const hours = windowOf(DATASETS.hourActivity, { notOlderThan: 3600, maxDuration: 3600 }, now);
  assert.equal(hours.since, '2026-11-20T11:00:00.000Z');
  assert.equal(windowOf(days, { notOlderThan: 3600 }, now).since, '2026-11-20', 'never later than today');

  const query = buildQuery('periodic', { maxPageSize: 50, availableFields: ['sum_rowsWritten', 'max_memoryUsageBytes', 'date'] });
  assert.match(query, /limit: 50,/);
  assert.match(query, /sum \{ rowsWritten \}/);
  assert.match(query, /max \{ memoryUsageBytes \}/);
  assert.doesNotMatch(query, /quantiles/, 'none of its fields are allowed');
  assert.match(buildQuery('matches'), /orderBy: \[sum_rowsWritten_DESC\]/);
  assert.match(buildQuery('hourActivity'), /datetime_geq: \$since/);
  assert.match(buildQuery('periodic', { availableFields: ['some other shape'] }), /sum \{ rowsWritten/, 'a list it cannot read asks for everything');
});

/** A fake of Cloudflare's API: `datasets` maps a query's name to its groups, or to an error. */
function fakeCloudflare(datasets, { deployment = true } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const reply = (body) => ({ ok: true, json: async () => body });
    if (url.endsWith('/graphql')) {
      const { query, variables } = JSON.parse(init.body);
      const [, name] = query.match(/query (\w+)/);
      const answer = datasets[name];
      if (answer instanceof Error) return reply({ errors: [{ message: answer.message }] });
      if (name === 'settings') return reply({ data: { viewer: { accounts: [{ settings: answer ?? {} }] } } });
      calls.at(-1).variables = variables;
      return reply({ data: { viewer: { accounts: [{ rows: answer ?? [] }] } } });
    }
    if (!deployment) return { ok: false, status: 403, json: async () => { throw new Error('not json'); } };
    if (url.endsWith('/deployments')) return reply({ success: true, result: { deployments: [{ created_on: '2026-11-01T00:00:00Z', source: 'wrangler', versions: [{ version_id: 'abcdef012345', percentage: 100 }], annotations: { 'workers/message': 'hi' } }] } });
    if (url.endsWith('/namespaces')) return reply({ success: true, result: [{ id: 'ns1', class: 'MatchServer', script: 'jugar', use_sqlite: true }] });
    return reply({ success: true, result: [{ id: 'jugar', created_on: '2026-10-01T00:00:00Z', modified_on: '2026-11-01T00:00:00Z' }] });
  };
  return { calls, fetcher };
}

function cloudflareEnv(t, plan) {
  process.env.CF_ACCOUNT_ID = 'acct';
  process.env.CF_API_TOKEN = 'very secret';
  if (plan) process.env.CF_PLAN = plan;
  t.after(() => {
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_PLAN;
  });
}

const gql = (dimensions, sum, extra) => ({ dimensions, sum, ...extra });

test('Cloudflare usage is optional, cached, and reports errors without the token', async (t) => {
  assert.equal(await createCloudflareUsage().usage(), null);
  cloudflareEnv(t);
  const { calls, fetcher } = fakeCloudflare({
    periodic: [gql({ date: '2026-11-07' }, { rowsWritten: 10, duration: 1.5 }, { max: { activeWebsocketConnections: 4 }, quantiles: { memoryUsageBytesP50: 100 } })],
    matches: [gql({ name: 'sala' }, { rowsWritten: 10 })],
    classes: [gql({ namespaceId: 'ns1' }, { rowsWritten: 10 })],
    hourActivity: [gql({ datetimeHour: '2026-11-07T11:00:00Z' }, { rowsWritten: 10 })],
  });
  const cf = createCloudflareUsage(fetcher);
  const now = Date.UTC(2026, 10, 7, 12);
  const usage = await cf.usage(now);
  assert.equal(usage.ok, true);
  assert.equal(usage.plan, 'free', 'the free plan unless told otherwise');
  assert.equal(usage.limits.find((l) => l.id === 'rowsWritten').used, 10);
  assert.equal(usage.days[0].maxSockets, 4);
  assert.equal(usage.days[0].doMemoryP50, 100);
  assert.equal(usage.hours[0].rowsWritten, 10);
  assert.equal(usage.breakdowns.matches[0].name, 'sala');
  assert.equal(usage.breakdowns.classes[0].class, 'MatchServer', 'the id, named');
  assert.equal(usage.deployment.deployments[0].message, 'hi');
  assert.equal(usage.deployment.error, null);
  assert.equal(calls[0].init.headers.authorization, 'Bearer very secret');
  assert.deepEqual(calls.find((c) => c.variables?.since === '2026-10-09').variables, { account: 'acct', since: '2026-10-09', until: '2026-11-07' });
  const n = calls.length;
  await cf.usage(now + 60_000);
  assert.equal(calls.length, n, 'served from the cache');

  const failing = createCloudflareUsage(async () => ({ ok: true, json: async () => ({ errors: [{ message: 'not authorized' }] }) }));
  const failed = await failing.usage(now);
  assert.deepEqual(failed, { ok: false, error: 'not authorized' });

  const refused = createCloudflareUsage(async () => ({ ok: false, status: 400, json: async () => ({ errors: [{ code: 6003, message: 'Invalid request headers' }] }) }));
  assert.deepEqual(await refused.usage(now), { ok: false, error: 'Invalid request headers' }, 'its reason, not just the status');
});

test('a dataset that fails costs only itself, and the settings are respected', async (t) => {
  cloudflareEnv(t, 'paid');
  const now = Date.UTC(2026, 10, 7, 12);
  const { calls, fetcher } = fakeCloudflare(
    {
      settings: {
        workersAssetsRequestsAdaptiveGroups: { enabled: false },
        durableObjectsPeriodicGroups: { enabled: true, notOlderThan: 3 * 86400, maxDuration: 3 * 86400, maxPageSize: 10 },
      },
      workers: [gql({ date: '2026-11-07' }, { requests: 5 })],
      periodic: new Error('too many fields'),
    },
    { deployment: false },
  );
  const usage = await createCloudflareUsage(fetcher).usage(now);
  assert.equal(usage.ok, true);
  assert.equal(usage.plan, 'paid');
  assert.equal(usage.days[0].workerRequests, 5);
  assert.equal(usage.days[0].rowsWritten, undefined, 'unknown, not zero');
  const texts = usage.alerts.map((a) => a.text);
  assert.ok(texts.includes('Could not read Object activity: too many fields.'));
  assert.ok(texts.includes('Could not read Static files: not enabled for this account.'));
  assert.ok(texts.some((text) => text.startsWith('Object activity: this account can only read back')));
  assert.equal(usage.deployment.error, 'HTTP 403', 'the token need not have Workers Scripts: Read');
  assert.deepEqual(usage.deployment.deployments, []);
  const asked = calls.filter((c) => c.url.endsWith('/graphql')).map((c) => JSON.parse(c.init.body).query.match(/query (\w+)/)[1]);
  assert.ok(!asked.includes('assets'), 'a dataset that is not enabled is not asked for');
  // The settings failing leaves every dataset to try on its own.
  const lost = fakeCloudflare({ settings: new Error('nope'), workers: [gql({ date: '2026-11-07' }, { requests: 5 })] });
  assert.equal((await createCloudflareUsage(lost.fetcher).usage(now)).days[0].workerRequests, 5);
});
