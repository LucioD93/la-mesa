import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.js';
import { Match } from '../server/match.js';

// Deterministic RNG so failures are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('full set has 28 unique tiles and deals 7 each', () => {
  assert.equal(G.fullSet().length, 28);
  const r = G.newRound({ rng: mulberry32(1) });
  assert.deepEqual(r.hands.map((h) => h.length), [7, 7, 7, 7]);
  const keys = new Set(r.hands.flat().map((t) => t.join()));
  assert.equal(keys.size, 28);
});

test('first round: double-six holder starts and must play it', () => {
  const r = G.newRound({ rng: mulberry32(2) });
  assert.ok(r.hands[r.turn].some((t) => G.sameTile(t, [6, 6])));
  const moves = G.legalMoves(r, r.turn);
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].tile, [6, 6]);
});

test('later rounds: starter may open with any tile', () => {
  const r = G.newRound({ starter: 3, rng: mulberry32(3) });
  assert.equal(r.turn, 3);
  assert.equal(G.legalMoves(r, 3).length, 7);
});

test('tiles are oriented so neighbours match', () => {
  const r = G.newRound({ starter: 0, rng: mulberry32(4) });
  r.hands = [
    [[2, 5], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    [[5, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    [[3, 2], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    [[1, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  ];
  G.play(r, 0, [2, 5], 'R');
  G.play(r, 1, [5, 1], 'R');
  G.play(r, 2, [3, 2], 'L');
  G.play(r, 3, [1, 1], 'R');
  assert.deepEqual(r.line, [[3, 2], [2, 5], [5, 1], [1, 1]]);
  assert.equal(r.center, 1);
  assert.deepEqual(G.boardEnds(r), [3, 1]);
});

test('rejects illegal moves', () => {
  const r = G.newRound({ rng: mulberry32(5) });
  const other = (r.turn + 1) % 4;
  assert.throws(() => G.play(r, other, r.hands[other][0], 'R'), G.MoveError);
  const notDouble = r.hands[r.turn].find((t) => !G.sameTile(t, [6, 6]));
  assert.throws(() => G.play(r, r.turn, notDouble, 'R'), G.MoveError);
  assert.throws(() => G.pass(r, r.turn), G.MoveError);
});

test('domino scores all pips left in every hand', () => {
  const r = G.newRound({ starter: 1, rng: mulberry32(6) });
  r.hands[1] = [[4, 4]];
  const leftover = r.hands.reduce((s, h, i) => (i === 1 ? s : s + G.handPips(h)), 0);
  G.play(r, 1, [4, 4], 'R');
  assert.equal(r.over.reason, 'domino');
  assert.equal(r.over.winnerTeam, 1);
  assert.equal(r.over.points, leftover);
});

test('blocked game goes to the team with fewer pips', () => {
  const r = G.newRound({ starter: 0, rng: mulberry32(7) });
  // Board ends will both be 0 with every 0 already out: nobody can move.
  r.line = [[0, 1], [1, 0]];
  r.hands = [[[0, 2], [6, 6]], [[3, 3]], [[1, 1]], [[5, 5]]];
  // Seat 0 plays its last zero; now no one can continue.
  G.play(r, 0, [0, 2], 'R');
  assert.equal(r.over.reason, 'blocked');
  // team 0: 12 + 2 = 14, team 1: 6 + 10 = 16
  assert.deepEqual(r.over.teamPips, [14, 16]);
  assert.equal(r.over.winnerTeam, 0);
  assert.equal(r.over.points, 30);
  assert.equal(r.over.winnerSeat, 2);
});

test('bot-only matches always reach a winner (state survives JSON round-trips)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = mulberry32(seed);
    let m = new Match('t' + seed);
    m.join('human', 'Me');
    m.handle('human', { t: 'addBots' }, new Set());
    m.seats[0] = { token: null, name: 'Bot', bot: true };
    m.startRound(rng);
    let guard = 0;
    while (m.phase !== 'matchEnd') {
      if (m.phase === 'roundEnd') m.startRound(rng);
      const p = m.pendingAuto();
      assert.ok(p, 'a bot should always be due to move');
      assert.ok(m.runAuto(p.key));
      assert.equal(m.runAuto(p.key), false, 'a stale turn key must not move twice');
      m = new Match(m.id, JSON.parse(JSON.stringify(m)));
      if (++guard > 5000) assert.fail('match did not finish, seed ' + seed);
      assert.equal(m.round.line.length + m.round.hands.flat().length, 28);
    }
    assert.ok(Math.max(...m.scores) >= m.target);
    assert.equal(m.history.length, m.roundNo);
  }
});

test('rejoining with the same token keeps the seat', () => {
  const m = new Match('rejoin');
  m.join('tok-a', 'Ann');
  m.join('tok-b', 'Ben');
  m.handle('tok-b', { t: 'sit', seat: 3 }, new Set());
  assert.equal(m.seatOf('tok-b'), 3);
  m.handle('tok-a', { t: 'addBots' }, new Set());
  m.handle('tok-a', { t: 'start' }, new Set());
  m.join('tok-b', 'Ben');
  assert.equal(m.seatOf('tok-b'), 3);
  assert.equal(m.stateFor('tok-b', new Set(['tok-b'])).round.hand.length, 7);
});

test('a player replaced by a bot after dropping gets the seat back on rejoin', () => {
  let m = new Match('reclaim');
  m.join('tok-a', 'Ann');
  m.join('tok-b', 'Ben');
  m.handle('tok-a', { t: 'addBots' }, new Set());
  m.handle('tok-a', { t: 'start' }, new Set());
  const hand = m.round.hands[1];
  // Ben drops; Ann hands his seat to a bot.
  assert.equal(m.handle('tok-a', { t: 'botify', seat: 1 }, new Set(['tok-a'])), true);
  assert.equal(m.seatOf('tok-b'), -1);
  assert.equal(m.stateFor('tok-a', new Set(['tok-a'])).seats[1].bot, true);
  m = new Match(m.id, JSON.parse(JSON.stringify(m)));
  m.join('tok-b', 'Ben');
  assert.equal(m.seatOf('tok-b'), 1);
  assert.deepEqual(m.stateFor('tok-b', new Set(['tok-b'])).round.hand, hand);
});

test('lobby frees seats of players who went offline', () => {
  const m = new Match('lobby');
  m.join('a', 'Ann');
  m.join('b', 'Ben');
  assert.equal(m.cleanupLobby(new Set(['a', 'b'])), false);
  assert.equal(m.cleanupLobby(new Set(['a'])), true);
  assert.equal(m.seatOf('b'), -1);
  assert.equal(m.seatOf('a'), 0);
});

test('reactions: only seated players, known emoji, rate limited', () => {
  const m = new Match('react');
  m.join('a', 'Ann');
  m.join('spec', 'Sam');
  m.handle('a', { t: 'sit', seat: 2 }, new Set());
  m.handle('spec', { t: 'stand' }, new Set());
  assert.equal(m.handle('spec', { t: 'react', emoji: '👏' }, new Set()), false);
  assert.equal(m.handle('a', { t: 'react', emoji: '💩' }, new Set()), false);
  assert.equal(m.handle('a', { t: 'react', emoji: '👏' }, new Set()), true);
  assert.equal(m.handle('a', { t: 'react', emoji: '😂' }, new Set()), false, 'cooldown');
  assert.deepEqual(m.stateFor('spec', new Set()).reaction, { n: 1, seat: 2, emoji: '👏' });
  m.reaction.at -= 1000;
  assert.equal(m.handle('a', { t: 'react', emoji: '😂' }, new Set()), true);
  assert.equal(m.reaction.n, 2);
});
