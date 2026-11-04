import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.js';
import { AUTO_PASS_DELAY_MS, Match, STUCK_PLAYER_DELAY_MS } from '../server/match.js';

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

test('domino scores only the pips left in the losing team\'s hands', () => {
  const r = G.newRound({ starter: 1, rng: mulberry32(6) });
  r.hands[1] = [[4, 4]];
  const losers = G.handPips(r.hands[0]) + G.handPips(r.hands[2]);
  G.play(r, 1, [4, 4], 'R');
  assert.equal(r.over.reason, 'domino');
  assert.equal(r.over.winnerTeam, 1);
  assert.equal(r.over.points, losers);
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
  assert.equal(r.over.points, 16);
});

test('bots are different memes, drawn at random', () => {
  const counts = {};
  const draws = 2000;
  for (let i = 0; i < draws; i++) {
    const m = new Match('memes' + i);
    m.join('a', 'Ann');
    m.handle('a', { t: 'addBots' }, new Set());
    const bots = m.seats.filter((s) => s.bot);
    assert.equal(bots.length, 3);
    assert.equal(new Set(bots.map((b) => b.name)).size, 3);
    assert.ok(bots.every((b) => b.emoji));
    for (const b of bots) counts[b.name] = (counts[b.name] ?? 0) + 1;
  }
  // Three of eight per match: each bot sits down about 750 times, none favored.
  assert.equal(Object.keys(counts).length, 8);
  for (const n of Object.values(counts)) assert.ok(n > 600 && n < 900, `drawn ${n} times`);
});

test('a bot replacing a dropped player keeps the names unique and gives the seat back', () => {
  const m = new Match('memes-botify');
  m.join('a', 'Ann');
  m.join('b', 'Ben');
  m.handle('a', { t: 'addBots' }, new Set(['a', 'b']));
  m.startRound(mulberry32(1));
  m.handle('a', { t: 'botify', seat: 1 }, new Set(['a']));
  assert.ok(m.seats[1].bot);
  assert.equal(new Set(m.seats.map((s) => s.name)).size, 4);
  assert.equal(m.stateFor('a', new Set(['a'])).seats[1].emoji, m.seats[1].emoji);
  m.join('b', 'Ben');
  assert.equal(m.seats[1].name, 'Ben');
});

test('the opener rotates to the right each round, whoever won', () => {
  const m = new Match('rotate');
  m.join('a', 'Ann');
  m.handle('a', { t: 'addBots' }, new Set());
  m.startRound(mulberry32(8));
  const first = m.round.starter;
  for (let i = 1; i <= 8; i++) {
    const r = m.round;
    // End the round by domino from a seat other than the opener.
    const winner = (r.starter + 1 + (i % 3)) % 4;
    r.turn = winner;
    r.hands[winner] = [[1, 1]];
    r.line = [];
    r.mustPlay = null;
    G.play(r, winner, [1, 1], 'R');
    m.afterMove();
    m.phase = 'roundEnd';
    m.startRound(mulberry32(8 + i));
    assert.equal(m.round.starter, (first + i) % 4);
    assert.equal(m.round.mustPlay, null);
  }
});

test('a blocked round passes the opener to the right too', () => {
  const m = new Match('rotate-blocked');
  m.join('a', 'Ann');
  m.handle('a', { t: 'addBots' }, new Set());
  m.nextStarter = 1;
  m.startRound(mulberry32(9));
  const r = m.round;
  r.line = [[0, 1], [1, 0]];
  r.hands = [[[3, 3]], [[0, 2], [6, 6]], [[1, 1]], [[5, 5]]];
  G.play(r, 1, [0, 2], 'R');
  m.afterMove();
  assert.equal(r.over.reason, 'blocked');
  assert.equal(m.nextStarter, 2);
});

test('a new match goes back to the double six', () => {
  const m = new Match('rotate-rematch');
  m.join('a', 'Ann');
  m.handle('a', { t: 'addBots' }, new Set());
  m.startRound(mulberry32(10));
  m.nextStarter = 2;
  m.phase = 'matchEnd';
  m.handle('a', { t: 'rematch' }, new Set());
  assert.deepEqual(m.round.mustPlay, [6, 6]);
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

test('a stuck human gets longer than a bot before the forced pass', () => {
  const m = new Match('stuck');
  m.join('a', 'Ann');
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  const seat = m.seatOf('a');
  const r = m.round;
  r.line = [[6, 6]];
  r.center = 0;
  r.hands = r.hands.map(() => [[0, 1]]);
  r.turn = seat;
  assert.equal(m.pendingAuto().delay, STUCK_PLAYER_DELAY_MS);
  r.turn = (seat + 1) % 4;
  assert.equal(m.pendingAuto().delay, AUTO_PASS_DELAY_MS);
});

test('blunders: only the player on turn, rate limited, tile never revealed', () => {
  const m = new Match('blunder');
  m.join('a', 'Ann');
  m.join('spec', 'Sam');
  m.handle('spec', { t: 'stand' }, new Set());
  const seat = m.seatOf('a');
  assert.equal(m.handle('a', { t: 'blunder' }, new Set()), false, 'lobby');
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  m.round.turn = (seat + 1) % 4;
  assert.equal(m.handle('a', { t: 'blunder' }, new Set()), false, 'not your turn');
  m.round.turn = seat;
  assert.equal(m.handle('spec', { t: 'blunder' }, new Set()), false, 'spectator');
  assert.equal(m.handle('a', { t: 'blunder', tile: [6, 6] }, new Set()), true);
  assert.equal(m.handle('a', { t: 'blunder' }, new Set()), false, 'cooldown');
  assert.deepEqual(m.stateFor('spec', new Set()).blunder, { n: 1, seat });
  assert.equal(JSON.parse(JSON.stringify(m)).blunder.n, 1, 'survives a store round trip');
  m.blunder.at -= 2000;
  assert.equal(m.handle('a', { t: 'blunder' }, new Set()), true);
  assert.equal(m.blunder.n, 2);
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
  assert.deepEqual(m.stateFor('spec', new Set()).reaction, { n: 1, seat: 2, emoji: '👏', crowd: 1 });
  m.reaction.sent[2] -= 1000;
  assert.equal(m.handle('a', { t: 'react', emoji: '😂' }, new Set()), true);
  assert.equal(m.reaction.n, 2);
});

test('reactions: the crowd counts different players sending the same emoji in time', () => {
  const m = new Match('crowd');
  for (const p of ['a', 'b', 'c']) m.join(p, p);
  const react = (p, emoji) => m.handle(p, { t: 'react', emoji }, new Set());
  const crowd = () => m.stateFor('a', new Set()).reaction.crowd;
  const age = (ms) => {
    m.reaction.at -= ms;
    for (const s in m.reaction.sent) m.reaction.sent[s] -= ms;
  };

  react('a', '🔥');
  assert.equal(crowd(), 1);
  assert.equal(react('b', '🔥'), true, 'one player does not throttle another');
  assert.equal(crowd(), 2);
  age(1000);
  react('a', '🔥');
  assert.equal(crowd(), 2, 'the same player repeating does not grow it');
  react('c', '🔥');
  assert.equal(crowd(), 3);

  age(1000);
  react('a', '😂');
  assert.equal(crowd(), 1, 'another emoji starts over');
  age(4000);
  react('b', '😂');
  assert.equal(crowd(), 1, 'too late to join');
});
