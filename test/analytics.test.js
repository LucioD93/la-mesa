import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { Match } from '../server/match.js';
import { createAnalytics, countryOf, glance, transitions } from '../server/analytics.js';
import { LEAVE_GRACE_MS, createRoom } from '../server/room.js';
import { GAME_IDS } from '../server/games/index.js';

// What leaves the server for PostHog: match-level events, never names or tokens.

const names = (events) => events.map(([name]) => name);

/** PostHog's two endpoints: events land in `sent`, and flag questions get `flags` back (key: on). */
function fakePostHog(sent, flags = {}, asked = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    if (!url.includes('/flags')) return sent.push(body), { ok: true };
    asked.push({ url, body });
    return { ok: true, json: async () => ({ flags: Object.fromEntries(Object.entries(flags).map(([k, on]) => [k, { key: k, enabled: on }])) }) };
  };
}

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

test('a country is a two-letter code, or nothing', () => {
  assert.equal(countryOf('ve'), 'VE');
  assert.equal(countryOf('XX'), null, "Cloudflare's unknown");
  assert.equal(countryOf('T1'), null, 'Tor');
  assert.equal(countryOf('<script>'), null);
  assert.equal(countryOf(undefined), null);
});

/** A room with the host's parts it needs, reporting to `sent`. */
function analyticsRoom(sent) {
  const analytics = createAnalytics({
    key: 'phc_test',
    fetch: fakePostHog(sent),
  });
  const conns = new Map();
  let saved;
  const room = createRoom('stats-2', {
    load: () => structuredClone(saved),
    save: (record) => (saved = structuredClone(record)),
    forget: () => (saved = undefined),
    connections: () => conns.values(),
    wakeAt: () => {},
    report: () => {},
    analytics,
  });
  let last = 0;
  const socket = (country) => {
    const conn = { id: String(++last), state: null, setState: (s) => (conn.state = s), send: () => {} };
    conns.set(conn.id, conn);
    room.connect(conn, country);
    return {
      say: (msg) => room.message(conn, JSON.stringify(msg)),
      leave: () => (conns.delete(conn.id), room.close(conn)),
    };
  };
  return { room, socket };
}

test('events carry the country the host saw, and a player joins once per visit', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const sent = [];
  const { room, socket } = analyticsRoom(sent);
  const hello = { t: 'hello', token: 'secret-token-2', name: 'Lucio', games: GAME_IDS };
  const a = socket('VE');
  a.say(hello);
  const b = socket('AR');
  b.say({ ...hello, token: 'secret-token-3', name: 'Ana' });
  a.say({ t: 'voice', data: { kind: 'join' } });

  // A reload: a new socket before the old one's grace runs out.
  a.leave();
  const again = socket('VE');
  again.say(hello);
  const joins = () => sent.filter((e) => e.event === 'player_joined');
  assert.equal(joins().length, 2, 'a reload is the same visit');

  // Gone for good, then back later.
  again.leave();
  t.mock.timers.tick(LEAVE_GRACE_MS + 1000);
  room.wake();
  socket('VE').say(hello);
  assert.equal(joins().length, 3, 'coming back is a new visit');

  const created = sent.find((e) => e.event === 'match_created');
  assert.equal(created.properties.country, 'VE');
  assert.deepEqual(created.properties.countries, ['VE'], 'only the first player was here yet');
  assert.equal(joins()[1].properties.country, 'AR');
  assert.equal(sent.find((e) => e.event === 'voice_joined').properties.country, 'VE');
  const everything = JSON.stringify(sent);
  assert.ok(!everything.includes('secret-token'), 'tokens stay secret');
  assert.ok(!everything.includes('Lucio') && !everything.includes('Ana'), 'names stay home');
});

test('a player starting a match with bots over a socket is reported with no names or tokens', async (t) => {
  const sent = [];
  const analytics = createAnalytics({
    key: 'phc_test',
    fetch: fakePostHog(sent),
  });
  const { server } = createApp({ analytics });
  server.listen(0);
  await once(server, 'listening');
  t.after(() => server.close());

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/ws?match=stats-1`);
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
  ws.send(JSON.stringify({ t: 'hello', token: 'secret-token-1', name: 'Lucio', games: GAME_IDS }));
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
  assert.equal(byName.player_joined.properties.country, undefined, 'the local server knows no country');
  const everything = JSON.stringify(sent);
  assert.ok(!everything.includes('secret-token-1'), 'the token stays secret');
  assert.ok(!everything.includes('Lucio'), 'names stay home');
});

// ---- feature flags ------------------------------------------------------------------

test('flags are asked about a match, with the match as a property a flag can target', async () => {
  const asked = [];
  const analytics = createAnalytics({ key: 'phc_test', host: 'https://ph.example', fetch: fakePostHog([], { rummikub: true, other: false }, asked) });
  assert.deepEqual(await analytics.flags('sala', { match: 'sala' }), { rummikub: true, other: false });
  assert.equal(asked[0].url, 'https://ph.example/flags?v=2');
  assert.deepEqual(asked[0].body, { api_key: 'phc_test', distinct_id: 'sala', person_properties: { match: 'sala' } });
});

/** A room on PostHog with these flags; `say` sends as player `p`, `state` is the last one it got. */
function flaggedRoom(flags, fetch) {
  const asked = [];
  const analytics = createAnalytics({ key: 'phc_test', fetch: fetch ?? fakePostHog([], flags, asked) });
  const conn = { id: '1', state: null, inbox: [], setState: (st) => (conn.state = st), send: (text) => conn.inbox.push(JSON.parse(text)) };
  let saved;
  const room = createRoom('flags-1', {
    load: () => structuredClone(saved),
    save: (record) => (saved = structuredClone(record)),
    forget: () => {},
    connections: () => [conn],
    wakeAt: () => {},
    report: () => {},
    analytics,
  });
  room.connect(conn);
  const say = (msg) => room.message(conn, JSON.stringify(msg));
  say({ t: 'hello', token: 'p', name: 'P', games: GAME_IDS });
  return { asked, say, state: () => conn.inbox.findLast((m) => m.t === 'state') };
}
const settle = () => new Promise((r) => setImmediate(r));

test('a game behind a flag is not offered until PostHog says the flag is on for the match', async () => {
  const off = flaggedRoom({});
  assert.ok(!off.state().offered.includes('rummikub'), 'held back while PostHog answers');
  await settle();
  assert.equal(off.asked.length, 1);
  assert.ok(!off.state().offered.includes('rummikub'));
  assert.ok(off.state().offered.includes('rummy'), 'games without a flag are always there');
  off.say({ t: 'game', game: 'rummikub' });
  assert.equal(off.state().game, 'domino', 'it cannot be picked either');

  const on = flaggedRoom({ rummikub: true });
  await settle();
  assert.ok(on.state().offered.includes('rummikub'));
  on.say({ t: 'game', game: 'rummikub' });
  assert.equal(on.state().game, 'rummikub');
});

test('no answer from PostHog keeps the flagged games back', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a);
  try {
    const room = flaggedRoom(null, async (url) => (url.includes('/flags') ? { ok: false, status: 500 } : { ok: true }));
    await settle();
    await settle();
    assert.ok(!room.state().offered.includes('rummikub'));
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
  }
});

test('without PostHog every game is offered', () => {
  const m = new Match('local');
  m.join('p', 'P');
  assert.ok(m.stateFor('p', new Set(['p'])).offered.includes('rummikub'));
  assert.equal(m.setGame('rummikub'), true);
});
