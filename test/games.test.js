import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp } from '../server/app.js';
import { Match } from '../server/match.js';
import { MemoryStore, RedisStore } from '../server/store.js';
import { GAME_IDS } from '../server/games/index.js';
import { GAMES } from '../public/js/games.js';

// A match as the live Redis has it today, saved before matches had a `game`.
function savedDominoMatch() {
  const m = new Match('old');
  for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
  m.startRound();
  const json = JSON.parse(JSON.stringify(m));
  delete json.game;
  return json;
}

test('a slow human gets mocked by everyone else, once per moment, in every game', () => {
  for (const game of ['domino', 'truco', 'caida', 'parchis']) {
    const m = new Match('slow', { game });
    for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
    assert.equal(m.waitingOn(), null, `${game}: nobody is waited on in the lobby`);
    m.startRound();
    const w = m.waitingOn();
    assert.ok(w && w.seat >= 0 && w.seat < 4, game);
    assert.equal(m.hurry('another moment'), false, game);
    assert.equal(m.hurry(w.key, () => 0), true, game);
    assert.deepEqual(m.reaction.crowd, [0, 1, 2, 3].filter((s) => s !== w.seat), game);
    const seen = m.stateFor('a', new Set()).reaction;
    assert.equal(seen.emoji, 'manguangua', game);
    assert.equal(seen.crowd, 3, game);
    assert.equal(seen.slow, w.seat, game);
    assert.equal(m.hurry(w.key), false, `${game}: not twice for the same moment`);
    assert.equal(new Match('slow', JSON.parse(JSON.stringify(m))).hurry(w.key), false, `${game}: not after a reload either`);
  }
});

test('the table mocks a slow player with a reaction picked at random', () => {
  const m = new Match('slow', { game: 'domino' });
  for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
  m.startRound();
  assert.equal(m.hurry(m.waitingOn().key, () => 0.99), true);
  assert.equal(m.stateFor('a', new Set()).reaction.emoji, '⏳');
});

test('nobody is hurried while a bot is thinking', () => {
  const m = new Match('bots', { game: 'caida' });
  m.join('a', 'a');
  m.handle('a', { t: 'addBots' }, new Set(['a']));
  m.startRound();
  m.round.turn = 1;
  assert.equal(m.waitingOn(), null);
});

test('El Manguangua is also a reaction anyone can send', () => {
  const m = new Match('face', { game: 'truco' });
  for (const t of ['a', 'b']) m.join(t, t);
  assert.equal(m.handle('a', { t: 'react', emoji: 'manguangua' }, new Set()), true);
  assert.equal(m.handle('b', { t: 'react', emoji: 'manguangua' }, new Set()), true);
  assert.deepEqual(m.stateFor('a', new Set()).reaction, { n: 2, seat: 1, emoji: 'manguangua', crowd: 2 });
});

test('a match saved without a game loads as dominoes and keeps playing', () => {
  const saved = savedDominoMatch();
  const m = new Match('old', { ...saved, target: 75 });
  assert.equal(m.game, 'domino');
  assert.equal(m.target, 75);
  const seat = m.round.turn;
  const { tile, end } = m.stateFor(m.seats[seat].token, new Set()).round.legal[0];
  assert.equal(m.handle(m.seats[seat].token, { t: 'play', tile, end }, new Set()), true);
  assert.equal(m.round.line.length, 1);
  // Saved again, it is now explicit.
  assert.equal(JSON.parse(JSON.stringify(m)).game, 'domino');
});

test('an unknown game in saved data falls back to dominoes', () => {
  for (const game of ['chess', '__proto__', 'constructor', 7, null]) {
    assert.equal(new Match('x', { game }).game, 'domino');
  }
});

test('the game is picked in the lobby only, by anyone there, and resets the target', () => {
  const m = new Match('g');
  m.join('a', 'A');
  assert.equal(m.game, 'domino');
  assert.equal(m.target, 100);
  assert.equal(m.handle('a', { t: 'game', game: 'domino' }, new Set()), false);
  for (const game of ['chess', '__proto__', ['truco'], null]) {
    assert.equal(m.handle('a', { t: 'game', game }, new Set()), false);
  }
  // A spectator can change it, like the target.
  assert.equal(m.handle('spectator', { t: 'game', game: 'truco' }, new Set()), true);
  assert.equal(m.game, 'truco');
  assert.equal(m.target, 24);
  assert.deepEqual(m.stateFor('a', new Set()).targets, [12, 24, 32]);

  // Targets belong to the current game.
  assert.equal(m.handle('a', { t: 'target', target: 100 }, new Set()), false);
  assert.equal(m.handle('a', { t: 'target', target: 32 }, new Set()), true);
  assert.equal(m.handle('a', { t: 'game', game: 'domino' }, new Set()), true);
  assert.equal(m.target, 100);
  assert.equal(m.handle('a', { t: 'target', target: 32 }, new Set()), false);

  m.handle('a', { t: 'game', game: 'truco' }, new Set());
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  assert.equal(m.phase, 'playing');
  assert.equal(m.handle('a', { t: 'game', game: 'domino' }, new Set()), false);
  assert.equal(m.game, 'truco');
});

test('the game survives a save, and a rematch and the lobby keep it', () => {
  const m = new Match('g');
  m.join('a', 'A');
  m.setGame('truco');
  const loaded = new Match('g', JSON.parse(JSON.stringify(m)));
  assert.equal(loaded.game, 'truco');
  assert.equal(loaded.target, 24);
  loaded.handle('a', { t: 'addBots' }, new Set());
  loaded.handle('a', { t: 'start' }, new Set());
  loaded.phase = 'matchEnd';
  assert.equal(loaded.handle('a', { t: 'lobby' }, new Set()), true);
  assert.equal(loaded.game, 'truco');
  assert.equal(loaded.nextStarter, null);
  // Each game deals its own round after going back to the lobby and switching.
  loaded.setGame('domino');
  loaded.handle('a', { t: 'start' }, new Set());
  assert.ok(Array.isArray(loaded.round.line));
  assert.equal(loaded.round.hands[0].length, 7);
});

test("the lobby's menu offers every game the server plays, and only those", () => {
  assert.deepEqual([...GAMES].sort(), [...GAME_IDS].sort());
});

test('a game message from the other game is ignored', () => {
  const m = new Match('g', { game: 'truco' });
  m.join('a', 'A');
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  assert.equal(m.handle('a', { t: 'play', tile: [6, 6], end: 'R' }, new Set()), false);
});

test('a link can pick the game of a new match only', () => {
  const fresh = new Match('g');
  fresh.join('a', 'A', 'truco');
  assert.equal(fresh.game, 'truco');
  const bogus = new Match('g');
  bogus.join('a', 'A', 'chess');
  assert.equal(bogus.game, 'domino');
  const existing = new Match('g', { v: 3 });
  existing.join('a', 'A', 'truco');
  assert.equal(existing.game, 'domino');
});

test('Redis keys keep the domino prefix, so live matches and usage counters survive', async () => {
  const k = new RedisStore(null).keys('arepa-123');
  assert.deepEqual(k, {
    m: 'domino:{arepa-123}:m',
    v: 'domino:{arepa-123}:v',
    p: 'domino:{arepa-123}:p',
    ch: 'domino:{arepa-123}:ch',
    sig: 'domino:{arepa-123}:sig',
  });
  const read = [];
  const store = new RedisStore({ hGetAll: async (key) => (read.push(key), {}) });
  await store.readUsage(['2026-11-04']);
  assert.deepEqual(read.sort(), ['domino:usage:2026-11-04', 'domino:usage:total']);
});

async function listen(t) {
  const store = new MemoryStore();
  const { server } = createApp({ store });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  return { store, url: `ws://127.0.0.1:${server.address().port}/api/ws?match=sala` };
}

/** Connect and say hello; `messages` collects what arrives, `next` waits for a match. */
async function client(t, url, hello) {
  const ws = new WebSocket(url);
  t.after(() => ws.terminate());
  const messages = [];
  const waiting = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    messages.push(msg);
    for (const w of [...waiting]) {
      if (w.test(msg)) {
        waiting.splice(waiting.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'hello', ...hello }));
  const next = (test) =>
    new Promise((resolve) => {
      const found = messages.find(test);
      if (found) return resolve(found);
      waiting.push({ test, resolve });
    });
  const say = (msg) => ws.send(JSON.stringify(msg));
  return { messages, next, say };
}

test('everyone in the lobby sees the game change, over sockets', async (t) => {
  const { url } = await listen(t);
  const a = await client(t, url, { token: 'a', name: 'A', games: true });
  const b = await client(t, url, { token: 'b', name: 'B', games: true });
  const atDomino = (m) => m.t === 'state' && m.game === 'domino' && m.target === 100 && m.seats[1];
  await a.next(atDomino);
  await b.next(atDomino);
  a.say({ t: 'game', game: 'truco' });
  const atTruco = (m) => m.t === 'state' && m.game === 'truco' && m.target === 24;
  const [sa, sb] = await Promise.all([a.next(atTruco), b.next(atTruco)]);
  assert.deepEqual(sa.targets, [12, 24, 32]);
  assert.deepEqual(sb.targets, [12, 24, 32]);
});

test('a tab from before the deploy plays dominoes as before, and is told to reload for truco', async (t) => {
  const { url } = await listen(t);
  const old = await client(t, url, { token: 'old', name: 'Old' }); // no `games`
  const current = await client(t, url, { token: 'new', name: 'New', games: true });
  await old.next((m) => m.t === 'state' && m.seats[1]);
  const before = old.messages.findLast((m) => m.t === 'state');
  assert.equal(before.game, 'domino');
  current.say({ t: 'game', game: 'truco' });
  const told = await old.next((m) => m.t === 'error');
  assert.equal(told.message, 'Reload the page to keep playing');
  // It never gets a state it couldn't draw.
  assert.ok(!old.messages.some((m) => m.t === 'state' && m.game === 'truco'));
  // Back to dominoes it works again.
  current.say({ t: 'game', game: 'domino' });
  const count = old.messages.filter((m) => m.t === 'state').length;
  await old.next((m) => m.t === 'state' && old.messages.filter((x) => x.t === 'state').length > count);
});

test('a tab from before caída gets told to reload, and keeps playing what it knows', async (t) => {
  const { url } = await listen(t);
  const old = await client(t, url, { token: 'old', name: 'Old', games: true });
  const current = await client(t, url, { token: 'new', name: 'New', games: ['domino', 'truco', 'caida'] });
  await old.next((m) => m.t === 'state' && m.seats[1]);
  current.say({ t: 'game', game: 'truco' });
  await old.next((m) => m.t === 'state' && m.game === 'truco');
  current.say({ t: 'game', game: 'caida' });
  const told = await old.next((m) => m.t === 'error');
  assert.equal(told.message, 'Reload the page to keep playing');
  await current.next((m) => m.t === 'state' && m.game === 'caida');
  assert.ok(!old.messages.some((m) => m.t === 'state' && m.game === 'caida'));
});

test('a caída game runs through the hub with bots, over sockets', async (t) => {
  const { url } = await listen(t);
  const p = await client(t, url, { token: 'p', name: 'P', games: ['domino', 'truco', 'caida'], game: 'caida' });
  await p.next((m) => m.t === 'state' && m.game === 'caida');
  p.say({ t: 'addBots' });
  await p.next((m) => m.t === 'state' && m.seats.every(Boolean));
  p.say({ t: 'start' });
  const started = await p.next((m) => m.t === 'state' && m.phase === 'playing');
  assert.equal(started.round.deal, 0);
  assert.deepEqual(started.targets, [12, 24]);
});

test('a parchís game runs through the hub with bots, over sockets', async (t) => {
  const { url } = await listen(t);
  const p = await client(t, url, { token: 'p', name: 'P', games: ['parchis'], game: 'parchis' });
  await p.next((m) => m.t === 'state' && m.game === 'parchis');
  p.say({ t: 'addBots' });
  await p.next((m) => m.t === 'state' && m.seats.every(Boolean));
  p.say({ t: 'start' });
  const started = await p.next((m) => m.t === 'state' && m.phase === 'playing');
  assert.deepEqual(started.targets, [1, 2, 3]);
  assert.deepEqual(started.round.hand, []);
  assert.equal(started.round.pieces.flat().length, 16);
});

test('a roba la cochina game runs through the hub with bots, over sockets', async (t) => {
  const { url } = await listen(t);
  const p = await client(t, url, { token: 'p', name: 'P', games: ['cochina'], game: 'cochina' });
  await p.next((m) => m.t === 'state' && m.game === 'cochina');
  p.say({ t: 'addBots' });
  await p.next((m) => m.t === 'state' && m.seats.every(Boolean));
  p.say({ t: 'start' });
  const started = await p.next((m) => m.t === 'state' && m.phase === 'playing');
  assert.deepEqual(started.targets, [1, 3, 5]);
  assert.equal(started.round.hand.length, 3);
  assert.equal(started.round.table.length, 4);
  assert.deepEqual(started.round.piles, [0, 0]);
});

test('a rummy game runs through the hub, and a tab from before rummy is told to reload', async (t) => {
  const { url } = await listen(t);
  const old = await client(t, url, { token: 'old', name: 'Old', games: ['domino', 'truco', 'caida', 'parchis'] });
  const p = await client(t, url, { token: 'p', name: 'P', games: ['domino', 'truco', 'caida', 'parchis', 'rummy'] });
  await old.next((m) => m.t === 'state' && m.seats[1]);
  p.say({ t: 'game', game: 'rummy' });
  await p.next((m) => m.t === 'state' && m.game === 'rummy');
  const told = await old.next((m) => m.t === 'error');
  assert.equal(told.message, 'Reload the page to keep playing');
  p.say({ t: 'addBots' });
  await p.next((m) => m.t === 'state' && m.seats.every(Boolean));
  p.say({ t: 'start' });
  const started = await p.next((m) => m.t === 'state' && m.phase === 'playing');
  assert.equal(started.round.hand.length, 7);
  assert.equal(started.round.discard.length, 1);
  assert.deepEqual(started.targets, [150, 300]);
});

test('a truco game runs through the hub with bots, over sockets', async (t) => {
  const { url } = await listen(t);
  const p = await client(t, url, { token: 'p', name: 'P', games: true, game: 'truco' });
  await p.next((m) => m.t === 'state' && m.game === 'truco');
  p.say({ t: 'addBots' });
  await p.next((m) => m.t === 'state' && m.seats.every(Boolean));
  p.say({ t: 'start' });
  const started = await p.next((m) => m.t === 'state' && m.phase === 'playing');
  assert.ok(started.round.vira);
  assert.equal(started.round.hand.length, 3);
  assert.equal(started.round.line, undefined);
});
