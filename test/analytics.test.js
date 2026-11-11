import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { Match } from '../server/match.js';
import { createAnalytics, countryOf, glance, transitions } from '../server/analytics.js';

// What leaves the server for PostHog: match-level events, never names or tokens.

const names = (events) => events.map(([name]) => name);

/** A match the store has saved once, as it is after the first player joins. */
function joined(...tokens) {
  const m = new Match('abc');
  for (const t of tokens) m.join(t, t);
  m.v = 1;
  return m;
}

test('a match going from lobby to playing to the end reports each step once', () => {
  const m = new Match('abc');
  m.join('t1', 'Ana');
  const created = transitions(glance(m), glance(m));
  assert.deepEqual(names(created), ['match_created'], 'a match nobody has saved yet is new');
  m.v = 1;

  m.handle('t1', { t: 'addBots' }, new Set(['t1']));
  let before = glance(m);
  m.handle('t1', { t: 'start' }, new Set(['t1']));
  const started = transitions(before, glance(m));
  assert.deepEqual(names(started), ['match_started']);
  assert.equal(started[0][1].humans, 1);
  assert.equal(started[0][1].bots, 3);
  assert.ok(m.startedAt, 'the first round stamps the match');

  before = glance(m);
  m.phase = 'roundEnd';
  assert.deepEqual(names(transitions(before, glance(m))), ['round_finished']);

  m.phase = 'playing';
  before = glance(m);
  m.scores = [m.target, 10];
  m.phase = 'matchEnd';
  const done = transitions(before, glance(m));
  assert.deepEqual(names(done), ['round_finished', 'match_finished']);
  assert.equal(done[1][1].winner_team, 0);
  assert.equal(typeof done[1][1].duration_s, 'number');
});

test('leaving mid-game is an abandoned match, leaving after the end is not', () => {
  const m = joined('t1');
  m.handle('t1', { t: 'addBots' }, new Set());
  m.handle('t1', { t: 'start' }, new Set());
  let before = glance(m);
  m.handle('t1', { t: 'lobby' }, new Set());
  assert.deepEqual(names(transitions(before, glance(m))), ['match_abandoned']);

  m.handle('t1', { t: 'start' }, new Set());
  m.phase = 'matchEnd';
  before = glance(m);
  m.handle('t1', { t: 'lobby' }, new Set());
  assert.deepEqual(names(transitions(before, glance(m))), []);
});

test('a bot replacing a player who left is reported', () => {
  const m = joined('t1', 't2');
  m.handle('t1', { t: 'addBots' }, new Set());
  m.handle('t1', { t: 'start' }, new Set());
  const before = glance(m);
  m.handle('t1', { t: 'botify', seat: 1 }, new Set(['t1']));
  assert.deepEqual(names(transitions(before, glance(m))), ['bot_takeover']);
});

test('nothing is sent without a key', () => {
  const calls = [];
  const analytics = createAnalytics({ key: '', fetch: (...a) => calls.push(a) });
  analytics.capture('x', 'y');
  assert.equal(analytics.enabled, false);
  assert.equal(calls.length, 0);
});

test('an event carries the country but asks PostHog not to look up an address', async () => {
  const calls = [];
  const analytics = createAnalytics({
    key: 'phc_test',
    host: 'https://ph.example',
    fetch: async (url, init) => (calls.push({ url, body: JSON.parse(init.body) }), { ok: true }),
  });
  analytics.capture('voice_joined', 'p1', { match: 'abc' }, 'VE');
  assert.equal(calls[0].url, 'https://ph.example/i/v0/e/');
  const { api_key, event, distinct_id, properties } = calls[0].body;
  assert.deepEqual([api_key, event, distinct_id], ['phc_test', 'voice_joined', 'p1']);
  assert.equal(properties.country, 'VE');
  assert.equal(properties.$geoip_country_code, 'VE');
  assert.equal(properties.$geoip_disable, true);
  assert.equal(properties.$process_person_profile, false);
});

test('the country header counts only where the platform sets it', () => {
  const req = { headers: { 'x-vercel-ip-country': 've' } };
  const was = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(countryOf(req), null);
    process.env.VERCEL = '1';
    assert.equal(countryOf(req), 'VE');
    assert.equal(countryOf({ headers: { 'x-vercel-ip-country': '<script>' } }), null);
  } finally {
    if (was === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = was;
  }
});

test('a player starting a match with bots over a socket is reported with no names or tokens', async (t) => {
  const sent = [];
  const analytics = createAnalytics({
    key: 'phc_test',
    fetch: async (_url, init) => (sent.push(JSON.parse(init.body)), { ok: true }),
  });
  const was = process.env.VERCEL;
  process.env.VERCEL = '1';
  const { server } = createApp({ store: new MemoryStore(), analytics });
  server.listen(0);
  await once(server, 'listening');
  t.after(() => {
    server.close();
    if (was === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = was;
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/ws?match=stats-1`, {
    headers: { 'x-vercel-ip-country': 'VE' },
  });
  await once(ws, 'open');
  const states = [];
  ws.on('message', (raw) => states.push(JSON.parse(raw)));
  const waitFor = async (pred) => {
    for (let i = 0; i < 100; i++) {
      if (states.some(pred)) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.fail('timed out');
  };
  ws.send(JSON.stringify({ t: 'hello', token: 'secret-token-1', name: 'Lucio' }));
  await waitFor((m) => m.t === 'state');
  ws.send(JSON.stringify({ t: 'addBots' }));
  await waitFor((m) => m.t === 'state' && m.seats.every(Boolean));
  ws.send(JSON.stringify({ t: 'start' }));
  await waitFor((m) => m.t === 'state' && m.phase === 'playing');
  ws.close();

  const byName = Object.fromEntries(sent.map((e) => [e.event, e]));
  assert.deepEqual(Object.keys(byName).sort(), ['match_created', 'match_started', 'player_joined']);
  assert.equal(byName.match_started.properties.humans, 1);
  assert.equal(byName.match_started.properties.bots, 3);
  assert.deepEqual(byName.match_started.properties.countries, ['VE']);
  assert.equal(byName.player_joined.properties.country, 'VE');
  const everything = JSON.stringify(sent);
  assert.ok(!everything.includes('secret-token-1'), 'the token stays secret');
  assert.ok(!everything.includes('Lucio'), 'names stay home');
});
