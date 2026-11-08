import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAVE_GRACE_MS, createRoom } from '../server/room.js';
import { GAME_IDS } from '../server/games/index.js';

// A match's room, driven the way a Durable Object drives it: sockets, a saved record, one alarm.

/** A host like the Worker's: storage that outlives the room, and an alarm to fire by hand. */
function host() {
  const h = {
    saved: undefined,
    alarm: null,
    reports: [],
    forgotten: 0,
    conns: new Map(),
    load: () => structuredClone(h.saved),
    save: (record) => (h.saved = structuredClone(record)),
    forget: () => (h.saved = undefined, h.forgotten++),
    connections: () => h.conns.values(),
    wakeAt: (at) => (h.alarm = at),
    report: (id, live, usage) => h.reports.push({ id, live, usage }),
  };
  return h;
}

let lastId = 0;
function socket(h, room) {
  const conn = {
    id: String(++lastId),
    state: null,
    inbox: [],
    setState(s) {
      return (this.state = s);
    },
    send(text) {
      this.inbox.push(JSON.parse(text));
    },
  };
  h.conns.set(conn.id, conn);
  room.connect(conn);
  return {
    conn,
    say: (msg, r = room) => r.message(conn, JSON.stringify(msg)),
    hello: (token, r = room) => r.message(conn, JSON.stringify({ t: 'hello', token, name: token, games: GAME_IDS })),
    leave: (r = room) => (h.conns.delete(conn.id), r.close(conn)),
    last: (t) => conn.inbox.findLast((m) => m.t === t),
  };
}

/** Fire the alarm once its time comes, as the platform would. */
function fire(t, h, room) {
  assert.ok(h.alarm != null, 'an alarm is set');
  t.mock.timers.tick(Math.max(0, h.alarm - Date.now()));
  room.wake();
}

test('a bot move survives the room going to sleep', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const h = host();
  const room = createRoom('sala', h);
  const a = socket(h, room);
  a.hello('a');
  a.say({ t: 'addBots' });
  a.say({ t: 'start' });
  assert.equal(a.last('state').phase, 'playing');
  assert.ok(h.saved.auto || h.saved.hurry, 'what the table waits for is saved');

  // Hibernation drops memory: a new room from the same storage carries on.
  const woken = createRoom('sala', h);
  let botMoves = 0;
  for (let i = 0; i < 20 && botMoves < 3; i++) {
    if (h.saved.auto) {
      fire(t, h, woken);
      botMoves++;
    } else {
      const { tile, end } = a.last('state').round.legal[0]; // our turn: play anything
      a.say({ t: 'play', tile, end }, woken);
    }
  }
  assert.equal(botMoves, 3, 'the saved timers played the bots');
});

test('the clocks stop when everyone leaves, and the seat waits out the grace period', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const h = host();
  const room = createRoom('sala', h);
  const a = socket(h, room);
  const b = socket(h, room);
  a.hello('a');
  b.hello('b');
  assert.deepEqual(b.last('state').seats.map((s) => s?.name ?? null), ['a', 'b', null, null]);

  // A reload doesn't free the seat right away…
  a.leave();
  assert.equal(b.last('state').seats[0]?.name, 'a');
  assert.equal(h.alarm, Date.now() + LEAVE_GRACE_MS);
  // …but once the grace ends, the lobby lets it go.
  fire(t, h, room);
  assert.equal(b.last('state').seats[0], null);

  b.say({ t: 'addBots' });
  b.say({ t: 'start' });
  b.leave();
  assert.equal(h.saved.auto, null, 'no bot plays to an empty table');
  assert.equal(h.saved.hurry, null);
});

test('a room nobody comes back to is forgotten after a day, without waking up in between', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const h = host();
  const room = createRoom('sala', h);
  const a = socket(h, room);
  a.hello('a');
  a.leave();
  fire(t, h, room); // the grace period
  const wakes = [];
  while (h.alarm != null && wakes.length < 5) {
    wakes.push(h.alarm - Date.now());
    fire(t, h, room);
  }
  assert.deepEqual(wakes, [24 * 60 * 60_000 - LEAVE_GRACE_MS]);
  assert.equal(h.forgotten, 1);
  assert.equal(h.saved, undefined);
});

test('reports who is here when it changes, with the usage counted so far', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 7) });
  const h = host();
  const room = createRoom('sala', h);
  const a = socket(h, room);
  a.hello('a');
  assert.deepEqual(h.reports.at(-1).live, { online: 1, voice: 0 });
  a.say({ t: 'voice', data: { kind: 'join' } });
  assert.deepEqual(h.reports.at(-1).live, { online: 1, voice: 1 });
  const today = {}; // what the reports carried between them
  for (const r of h.reports) for (const [k, n] of Object.entries(r.usage['2026-11-07'] ?? {})) today[k] = (today[k] || 0) + n;
  assert.equal(today.voiceJoins, 1);
  assert.equal(today.sockets, 1);
  assert.equal(today.messages, 2);
  assert.ok(today.saves >= 1 && today.socketIn > 0 && today.socketOut > 0);

  // Counters that pile up without a change go out within a minute.
  const n = h.reports.length;
  a.say({ t: 'rename', name: 'Ana' });
  assert.equal(h.reports.length, n);
  fire(t, h, room);
  assert.equal(h.reports.length, n + 1);
  assert.equal(h.reports.at(-1).usage['2026-11-07'].saves, 1);
});

test('an illegal move changes nothing, even halfway through', (t) => {
  const h = host();
  const room = createRoom('sala', h);
  const a = socket(h, room);
  a.hello('a');
  const before = room.snapshot().match.toJSON();
  assert.throws(() =>
    room.update((m) => {
      m.scores = [99, 99];
      throw new Error('boom');
    }),
  );
  assert.deepEqual(room.snapshot().match.toJSON(), before);
});

test('spectators and each seat get one view each, built once', () => {
  const h = host();
  const room = createRoom('sala', h);
  const players = ['a', 'b', 'c', 'd'].map((token) => {
    const s = socket(h, room);
    s.hello(token);
    return s;
  });
  const watchers = [1, 2, 3].map((n) => {
    const s = socket(h, room);
    s.hello(`w${n}`);
    return s;
  });
  players[0].say({ t: 'start' });
  const hands = players.map((p) => JSON.stringify(p.last('state').round.hand));
  assert.equal(new Set(hands).size, 4, 'each player sees their own hand');
  const views = watchers.map((w) => JSON.stringify(w.last('state')));
  assert.equal(new Set(views).size, 1);
  assert.equal(watchers[0].last('state').you, -1);
});
