import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/rummikub.js';
import * as client from '../public/js/rummikub-tiles.js';
import { BOT_DELAY_MS, DEAL_MS, MoveError } from '../server/games/common.js';
import { Match } from '../server/match.js';

// Tiles by name: k black, b blue, o orange, r red; `r7` is the red 7 and `r7'` its twin.
const COLOR = { k: 0, b: 1, o: 2, r: 3 };
const T = (name) => {
  if (name === 'J') return 104;
  if (name === "J'") return 105;
  const twin = name.endsWith("'");
  return COLOR[name[0]] * 13 + Number(name.slice(1, twin ? -1 : undefined)) - 1 + (twin ? 52 : 0);
};
const tiles = (s) => s.split(' ').map(T);

/** A round on seat 0's turn, with the racks and table set by hand. */
function round({ hands = ['', '', '', ''], table = [], melded = [true, true, true, true], pool, ...rest } = {}) {
  const r = G.newRound({ starter: 0 });
  Object.assign(r, {
    hands: hands.map((h) => (h ? tiles(h) : [])),
    table: table.map(tiles),
    melded,
    ...rest,
  });
  if (pool) r.pool = pool;
  return r;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---- tiles and sets ---------------------------------------------------------------

test('106 tiles: 1 to 13 in four colors twice, and two jokers', () => {
  const r = G.newRound({ rng: seeded(1) });
  const all = [...r.pool, ...r.hands.flat()].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 106 }, (_, i) => i));
  assert.deepEqual(r.hands.map((h) => h.length), [14, 14, 14, 14]);
  assert.equal(r.pool.length, 50);
  assert.equal(G.numberOf(T('r7')), 7);
  assert.equal(G.colorOf(T("r7'")), 3);
  assert.equal(G.numberOf(T('r7')), G.numberOf(T("r7'")));
});

test('groups: 3 or 4 of a number, every color different', () => {
  const kind = (s) => G.arrange(tiles(s))?.kind ?? null;
  assert.equal(kind('k7 b7 r7'), 'group');
  assert.equal(kind('k7 b7 o7 r7'), 'group');
  assert.equal(kind('k7 b7 r7 J'), 'group');
  assert.equal(kind("k7 b7 k7'"), null);
  assert.equal(kind('k7 b7'), null);
  assert.equal(kind('k7 b7 o7 r7 J'), null);
  assert.deepEqual(G.arrange(tiles('r7 k7 b7')).tiles, tiles('k7 b7 r7'));
});

test('runs: 3 or more in a row of one color, 1 only at the bottom, 13 the top', () => {
  const kind = (s) => G.arrange(tiles(s))?.kind ?? null;
  assert.equal(kind('r5 r3 r4'), 'run');
  assert.equal(kind('r1 r2 r3'), 'run');
  assert.equal(kind('r11 r12 r13'), 'run');
  assert.equal(kind('r12 r13 r1'), null);
  assert.equal(kind('r5 r6 r8'), null);
  assert.equal(kind('r5 r6 b7'), null);
  assert.equal(kind("r5 r6 r6'"), null);
  assert.deepEqual(G.arrange(tiles('r5 r3 r4')).tiles, tiles('r3 r4 r5'));
  const all = Array.from({ length: 13 }, (_, i) => `b${i + 1}`).join(' ');
  assert.equal(kind(all), 'run');
  assert.equal(kind(`${all} J`), null);
});

test('a joker fills a gap first, then the high end, then the low end once the run reaches 13', () => {
  const values = (s) => G.arrange(tiles(s)).values;
  assert.deepEqual(G.arrange(tiles('o4 J o6')).tiles, tiles('o4 J o6'));
  assert.deepEqual(values('o4 J o6'), [4, 5, 6]);
  assert.deepEqual(G.arrange(tiles('J o4 o5')).tiles, tiles('o4 o5 J'));
  assert.deepEqual(values('J o4 o5'), [4, 5, 6]);
  assert.deepEqual(values('o12 o13 J'), [11, 12, 13]);
  assert.deepEqual(values("o3 J J'"), [3, 3, 3]); // one real tile: a group of 3s
  assert.equal(G.setPoints(tiles('o9 o10 J')), 30);
  assert.equal(G.setPoints(tiles('k7 b7 J')), 21);
});

test('the browser checks sets the way the server does', () => {
  const rng = seeded(7);
  for (let i = 0; i < 4000; i++) {
    const size = 3 + Math.floor(rng() * 4);
    const pool = Array.from({ length: 106 }, (_, k) => k);
    // Mostly tiles close together, so plenty of them are sets.
    const color = Math.floor(rng() * 4);
    const near = pool.filter((id) => G.isJoker(id) || (rng() < 0.5 ? G.colorOf(id) === color : G.numberOf(id) === 7));
    const ids = [];
    while (ids.length < size) {
      const id = near[Math.floor(rng() * near.length)];
      if (!ids.includes(id)) ids.push(id);
    }
    assert.deepEqual(client.arrange(ids), G.arrange(ids), ids.join(' '));
  }
});

test('a rack costs its numbers, and 30 for a joker', () => {
  assert.equal(G.rackPoints(tiles('k1 b13 J')), 44);
});

// ---- turns ----------------------------------------------------------------------

test('drawing takes a tile from the pool and ends the turn', () => {
  const r = round({ hands: ['k1', 'b1', 'o1', 'r1'], pool: tiles('k9 b9') });
  G.draw(r, 0);
  assert.deepEqual(r.hands[0], tiles('k1 b9'));
  assert.equal(r.drew[0], T('b9'));
  assert.equal(r.turn, 1);
  assert.equal(r.lastAction.type, 'draw');
  assert.throws(() => G.draw(r, 0), MoveError);
});

test('with the pool empty a turn passes, and four passes in a row block the round', () => {
  const r = round({ hands: ['k1', 'b1', 'o1', 'r1'], pool: [] });
  assert.deepEqual(G.options(r, 0), { play: true, draw: false, pass: true });
  for (let s = 0; s < 3; s++) G.draw(r, s);
  assert.equal(r.over, null);
  G.draw(r, 3);
  assert.deepEqual(r.over, { reason: 'blocked' });
});

test('a play keeps every table tile, adds at least one of yours, and every set must be good', () => {
  const r = round({ hands: ['r8 k2', 'b1', 'o1', 'r1'], table: ['r5 r6 r7'] });
  assert.throws(() => G.play(r, 0, [tiles('r5 r6 r7')]), /at least one tile/);
  assert.throws(() => G.play(r, 0, [tiles('r5 r6 r7 r8 k2')]), /group or a run/);
  assert.throws(() => G.play(r, 0, [tiles('r6 r7 r8')]), /stay there/);
  assert.throws(() => G.play(r, 0, [tiles('r5 r6 r7 r8 r9')]), /do not have/);
  assert.throws(() => G.play(r, 0, [tiles('r5 r6 r7 r8'), tiles('r8')]), /not a table/);
  assert.throws(() => G.play(r, 0, [[1.5]]), /not a table/);
  assert.throws(() => G.play(r, 1, [tiles('r5 r6 r7 r8')]), /Not your turn/);
  G.play(r, 0, [tiles('r8 r7 r6 r5')]);
  assert.deepEqual(r.table, [tiles('r5 r6 r7 r8')]);
  assert.deepEqual(r.hands[0], tiles('k2'));
  assert.equal(r.turn, 1);
  assert.deepEqual(r.lastAction, { n: 1, type: 'play', seat: 0, placed: [T('r8')], first: false });
});

test('the table can be rearranged any way at all', () => {
  // Split a run with the twin of one of its tiles.
  const r = round({ hands: ["b6' k9", 'k1', '', ''], table: ['b3 b4 b5 b6 b7 b8', 'r9 r10 J'] });
  G.play(r, 0, [tiles('b3 b4 b5 b6'), tiles("b6' b7 b8"), tiles('r9 r10 J')]);
  assert.deepEqual(r.table, [tiles('b3 b4 b5 b6'), tiles("b6' b7 b8"), tiles('r9 r10 J')]);
  assert.deepEqual(r.hands[0], tiles('k9'));
  // Swap the joker for the tile it stood for, and use it in a new group.
  const s = round({ hands: ['r11 k9 o9', '', '', ''], table: ['r9 r10 J'] });
  G.play(s, 0, [tiles('r9 r10 r11'), tiles('k9 o9 J')]);
  assert.deepEqual(s.table, [tiles('r9 r10 r11'), tiles('k9 o9 J')]);
  assert.deepEqual(s.hands[0], []);
  assert.deepEqual(s.over, { reason: 'out', seat: 0 });
});

test('the first play is 30 or more of your own tiles, and leaves the table alone', () => {
  const fresh = [false, true, true, true];
  const r = round({ hands: ['k10 b10 o10 r4 r5 r6 k1', '', '', ''], table: ['r1 r2 r3'], melded: fresh });
  assert.throws(() => G.play(r, 0, [tiles('r1 r2 r3'), tiles('r4 r5 r6')]), /add up to 30/);
  assert.throws(() => G.play(r, 0, [tiles('r1 r2 r3 r4 r5 r6'), tiles('k10 b10 o10')]), /cannot touch the table/);
  G.play(r, 0, [tiles('r1 r2 r3'), tiles('k10 b10 o10')]);
  assert.equal(r.melded[0], true);
  assert.equal(r.lastAction.first, true);
  // Two sets together can make the 30, and a joker counts as what it stands for.
  const s = round({ hands: ['k1 k2 k3 b9 b10 J k5', '', '', ''], melded: fresh });
  G.play(s, 0, [tiles('k1 k2 k3'), tiles('b9 b10 J')]);
  assert.deepEqual(s.hands[0], tiles('k5'));
});

// ---- scoring ------------------------------------------------------------------------

test('going out scores what is left on the other team\'s racks', () => {
  const r = round({ hands: ['', 'k5 J', 'r13', 'b2'], over: { reason: 'out', seat: 0 } });
  assert.deepEqual(G.roundScore(r), { held: [13, 37], winner: 0, points: [37, 0] });
});

test('a blocked round goes to the team with less left; a tie scores nothing', () => {
  const r = round({ hands: ['k5', 'k9', 'r3', 'b2'], over: { reason: 'blocked' } });
  assert.deepEqual(G.roundScore(r), { held: [8, 11], winner: 0, points: [11, 0] });
  r.hands = [tiles('k5'), tiles('k9'), tiles('r4'), []];
  assert.deepEqual(G.roundScore(r), { held: [9, 9], winner: null, points: [0, 0] });
});

// ---- the bot ------------------------------------------------------------------------

test('a tile splits a run around its twin', () => {
  assert.deepEqual(G.fitTile(tiles('b4 b5 b6 b7 b8'), T("b6'")), [tiles('b4 b5 b6'), tiles("b6' b7 b8")]);
  assert.equal(G.fitTile(tiles('b4 b5 b6 b7'), T("b6'")), null); // 6-7 alone is too short
  assert.deepEqual(G.fitTile(tiles('b4 b5 b6'), T('b7')), [tiles('b4 b5 b6 b7')]);
  assert.equal(G.fitTile(tiles('k7 b7 o7 r7'), T("k7'")), null);
});

test('the bot only makes a first play worth 30, and draws without one', () => {
  const r = round({ hands: ['k1 k2 k3 r9 b9', '', '', ''], melded: [false, true, true, true], table: ['o5 o6 o7'] });
  assert.deepEqual(G.botMove(r, 0), { type: 'draw' });
  r.hands[0] = tiles('k1 k2 k3 r9 b9 o9 k13');
  const move = G.botMove(r, 0);
  assert.equal(move.type, 'play');
  G.applyMove(r, 0, move);
  assert.deepEqual(r.hands[0], tiles('k13'));
});

test('the bot lays off, splits runs and borrows a spare tile', () => {
  const r = round({ hands: ["b9 k6' r12 r13", 'k1', '', ''], table: ['b5 b6 b7 b8', 'k3 k4 k5 k6 k7 k8', 'o11 b11 k11 r11'] });
  G.applyMove(r, 0, G.botMove(r, 0));
  assert.deepEqual(r.table, [tiles('b5 b6 b7 b8 b9'), tiles('k3 k4 k5 k6'), tiles("k6' k7 k8"), tiles('k11 b11 o11'), tiles('r11 r12 r13')]);
  assert.deepEqual(r.over, { reason: 'out', seat: 0 });
});

test('the bot keeps a joker for a set of its own, unless it is the last tile', () => {
  const r = round({ hands: ['b9 J k1', 'k2', '', ''], table: ['b5 b6 b7 b8'] });
  G.applyMove(r, 0, G.botMove(r, 0));
  assert.deepEqual(r.hands[0], tiles('J k1'));
  const s = round({ hands: ['b9 J', 'k2', '', ''], table: ['b5 b6 b7 b8'] });
  G.applyMove(s, 0, G.botMove(s, 0));
  assert.deepEqual(s.hands[0], []);
});

test('bots play whole rounds legally, and they end', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = G.newRound({ starter: seed % 4, rng: seeded(seed) });
    for (let n = 0; !r.over; n++) {
      assert.ok(n < 1000, `seed ${seed} never ended`);
      G.applyMove(r, r.turn, G.botMove(r, r.turn));
    }
    const left = r.hands.flat().length + r.pool.length + r.table.flat().length;
    assert.equal(left, 106);
  }
});

// ---- the match -------------------------------------------------------------------

test('a rummikub match deals, waits for the deal, and plays to the end with bots', () => {
  const m = new Match('rk', { game: 'rummikub' });
  assert.deepEqual(m.rules.targets, [50, 100, 200]);
  assert.equal(m.target, 100);
  m.handle(null, { t: 'addBots' }, new Set());
  m.startRound(seeded(3));
  assert.equal(m.pendingAuto().delay, BOT_DELAY_MS + DEAL_MS);
  const rng = seeded(4);
  for (let i = 0; i < 5000 && m.phase !== 'matchEnd'; i++) {
    if (m.phase === 'roundEnd') m.startRound(rng);
    else m.runAuto(m.pendingAuto().key, rng);
  }
  assert.equal(m.phase, 'matchEnd');
  assert.ok(m.scores.some((s) => s >= 100));
  assert.ok(m.history.every((h) => h.points.length === 2 && h.held.length === 2));
});

test('each player sees only their own rack, until the round is over', () => {
  const m = new Match('rk', { game: 'rummikub' });
  m.seats = [0, 1, 2, 3].map((s) => ({ token: `p${s}`, name: `p${s}`, bot: false }));
  m.startRound(seeded(5));
  const view = m.stateFor('p1', new Set(['p1'])).round;
  assert.deepEqual(view.hand, m.round.hands[1]);
  assert.equal(view.hands, null);
  assert.equal(view.pool, 50);
  assert.equal(JSON.stringify(view).includes(JSON.stringify(m.round.pool)), false);
  assert.equal(m.stateFor('watcher', new Set()).round.hand, null);
  m.handle('p0', { t: 'draw' }, new Set());
  assert.equal(m.stateFor('p0', new Set()).round.newTile, m.round.drew[0]);
  assert.equal(m.stateFor('p1', new Set()).round.newTile, null);
});
