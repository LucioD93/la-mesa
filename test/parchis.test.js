import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/parchis.js';
import { Match } from '../server/match.js';

const { NEST, START, ENTRY, GOAL } = G;
const dice = (...values) => {
  const queue = values.slice();
  return () => (queue.shift() - 1) / 6;
};

/** A round with the pieces set by hand: { color: [positions] }, the rest in the nest. */
function board(pieces = {}, rest = {}) {
  const r = G.newRound();
  for (const [color, list] of Object.entries(pieces)) list.forEach((p, i) => (r.pieces[color][i] = p));
  return Object.assign(r, rest);
}

/** A rival's position that stands on the ring square this color reaches at `pos`. */
const sameSquare = (color, pos, rival) => {
  for (let p = 0; p <= ENTRY; p++) if (G.ringOf(rival, p) === G.ringOf(color, pos)) return p;
  throw new Error('no such square');
};

const moved = (r, seat) => G.legalMoves(r, seat).map((m) => m.piece);

// ---- leaving the nest ----------------------------------------------------------

test('only a 5 brings a piece out, and it has to', () => {
  const r = board({ 0: [10] });
  G.roll(r, 0, dice(5));
  assert.deepEqual(moved(r, 0), [1, 2, 3]);
  G.move(r, 0, 0, 1);
  assert.equal(r.pieces[0][1], START);
  assert.equal(r.turn, 1);

  const stuck = board();
  G.roll(stuck, 0, dice(3));
  assert.equal(stuck.turn, 1, 'nothing to move passes the turn');
  assert.equal(stuck.lastRoll.passed, true);
});

test('two of your own on your start keep the others in, and a 5 moves something else', () => {
  const r = board({ 0: [START, START, 10] });
  G.roll(r, 0, dice(5));
  assert.deepEqual(moved(r, 0), [0, 1, 2]);
});

test('leaving onto a full start square takes the rival that got there last', () => {
  const ringPos = (c) => sameSquare(0, START, c);
  const r = board({ 1: [ringPos(1)], 3: [ringPos(3)] });
  r.arrived[1][0] = 5;
  r.arrived[3][0] = 9;
  G.roll(r, 0, dice(5));
  G.move(r, 0, 0, 0);
  assert.equal(r.pieces[3][0], NEST);
  assert.equal(r.pieces[1][0], ringPos(1));
  assert.deepEqual(r.pending, [20]);

  // A partner is never taken: with your partner and your own piece there, you stay in.
  const blocked = board({ 0: [START], 2: [sameSquare(0, START, 2)] });
  G.roll(blocked, 0, dice(5));
  assert.ok(!G.legalMoves(blocked, 0).some((m) => m.from === NEST));
});

// ---- sixes ---------------------------------------------------------------------

test('a 6 rolls again, and counts 7 once nothing is in the nest', () => {
  const inNest = board({ 0: [10] });
  G.roll(inNest, 0, dice(6));
  assert.deepEqual(inNest.pending, [6]);
  G.move(inNest, 0, 0, 0);
  assert.equal(inNest.pieces[0][0], 16);
  assert.equal(inNest.turn, 0);
  assert.equal(inNest.stage, 'roll');

  const allOut = board({ 0: [10, 20, 30, GOAL] });
  G.roll(allOut, 0, dice(6));
  assert.deepEqual(allOut.pending, [7]);
});

test('a third 6 sends the last piece moved home and ends the turn', () => {
  const r = board({ 0: [10, 20] });
  G.roll(r, 0, dice(6));
  G.move(r, 0, 0, 1);
  G.roll(r, 0, dice(6));
  G.move(r, 0, 0, 1);
  G.roll(r, 0, dice(6));
  assert.equal(r.pieces[0][1], NEST);
  assert.equal(r.pieces[0][0], 10);
  assert.equal(r.turn, 1);
  assert.equal(r.lastRoll.penalty, true);
  assert.equal(r.lastAction.type, 'penalty');
  assert.equal(r.repeats, 0);
});

test('a third 6 cannot touch a piece in its corridor', () => {
  const r = board({ 0: [ENTRY - 2, 10] }, { repeats: 2, lastMoved: { color: 0, piece: 0 } });
  r.pieces[0][0] = ENTRY + 3;
  G.roll(r, 0, dice(6));
  assert.equal(r.pieces[0][0], ENTRY + 3);
  assert.equal(r.turn, 1);
});

test('a 6 has to open your barrier when it can', () => {
  const r = board({ 0: [10, 10, 30] });
  G.roll(r, 0, dice(6));
  assert.deepEqual(moved(r, 0), [0, 1]);
});

// ---- barriers ------------------------------------------------------------------

test('nobody passes or lands on a barrier, your own included', () => {
  const p = sameSquare(0, 20, 1);
  const r = board({ 0: [17], 1: [p, p] });
  G.roll(r, 0, dice(4));
  assert.equal(r.turn, 1, 'the only piece is stopped');

  const own = board({ 0: [10, 13, 13] });
  G.roll(own, 0, dice(4));
  assert.deepEqual(moved(own, 0), [1, 2]);
});

test('two different colors on a square are no barrier, but it is full', () => {
  const p1 = sameSquare(0, 20, 1);
  const p3 = sameSquare(0, 20, 3);
  const pass = board({ 0: [17], 1: [p1], 3: [p3] });
  G.roll(pass, 0, dice(5));
  assert.deepEqual(moved(pass, 0), [1, 2, 3], 'a 5 still brings a piece out first');
  const r = board({ 0: [17, GOAL, GOAL, GOAL], 1: [p1], 3: [p3] });
  G.roll(r, 0, dice(3));
  assert.equal(r.turn, 1, 'cannot land on a full square');
  const past = board({ 0: [17, GOAL, GOAL, GOAL], 1: [p1], 3: [p3] });
  G.roll(past, 0, dice(4));
  assert.deepEqual(moved(past, 0), [0], 'can walk past it');
});

// ---- captures and bonuses ------------------------------------------------------

test('landing on a lone rival sends it home and pays 20 for one piece', () => {
  const p = sameSquare(0, 20, 1);
  const r = board({ 0: [17, 30], 1: [p] });
  G.roll(r, 0, dice(3));
  G.move(r, 0, 0, 0);
  assert.equal(r.pieces[1][0], NEST);
  assert.deepEqual(r.pending, [20]);
  assert.deepEqual(r.captures, [1, 0]);
  assert.equal(r.turn, 0);
  G.move(r, 0, 0, 1);
  assert.equal(r.pieces[0][1], 50);
  assert.equal(r.turn, 1);
});

test('safe squares protect, and a partner is never captured', () => {
  // Square 12 is the 8th from yellow's start.
  const p = sameSquare(0, 7, 1);
  const safe = board({ 0: [4], 1: [p] });
  G.roll(safe, 0, dice(3));
  G.move(safe, 0, 0, 0);
  assert.equal(safe.pieces[1][0], p);
  assert.deepEqual(safe.pending, []);

  const q = sameSquare(0, 13, 2);
  const partner = board({ 0: [10], 2: [q] });
  G.roll(partner, 0, dice(3));
  G.move(partner, 0, 0, 0);
  assert.equal(partner.pieces[2][0], q);
  assert.deepEqual(partner.pending, []);
});

test('the goal needs the exact count and pays 10, and an unusable bonus is lost', () => {
  const r = board({ 0: [GOAL - 3, 20] });
  G.roll(r, 0, dice(4));
  assert.deepEqual(moved(r, 0), [1], 'overshooting is not allowed');
  const exact = board({ 0: [GOAL - 3, 20] });
  G.roll(exact, 0, dice(3));
  G.move(exact, 0, 0, 0);
  assert.equal(exact.pieces[0][0], GOAL);
  assert.deepEqual(exact.pending, [10]);

  const lost = board({ 0: [GOAL - 3, GOAL - 1, GOAL, GOAL] });
  G.roll(lost, 0, dice(3));
  G.move(lost, 0, 0, 0);
  assert.deepEqual(lost.pending, []);
  assert.equal(lost.turn, 1);
});

// ---- pairs ---------------------------------------------------------------------

test('with all yours home you move your partner, and the pair wins together', () => {
  const r = board({ 0: [GOAL, GOAL, GOAL, GOAL], 2: [GOAL, GOAL, GOAL, GOAL - 2] });
  G.roll(r, 0, dice(2));
  const [m] = G.legalMoves(r, 0);
  assert.equal(m.color, 2);
  assert.throws(() => G.move(r, 0, 0, 0), /cannot move/);
  G.move(r, 0, 2, 3);
  assert.deepEqual(r.over, { team: 0 });
  assert.throws(() => G.roll(r, 0), /over/);
});

// ---- turns ---------------------------------------------------------------------

test('moves out of turn or out of order are refused', () => {
  const r = board({ 0: [10] });
  assert.throws(() => G.roll(r, 1), /Not your turn/);
  assert.throws(() => G.move(r, 0, 0, 0), /Not your turn/);
  G.roll(r, 0, dice(2));
  assert.throws(() => G.roll(r, 0), /Not your turn/);
  for (const [color, piece] of [[1, 0], [0, 1], ['0', 0], [0, '__proto__'], [null, null]]) {
    assert.throws(() => G.move(r, 0, color, piece), /cannot move/);
  }
});

test('bots prefer a capture, and a whole game of bots ends with the rules intact', () => {
  const p = sameSquare(0, 20, 1);
  const r = board({ 0: [17, 30, 40, 50], 1: [p] }, { stage: 'move', pending: [3] });
  assert.deepEqual(G.botMove(r, 0), { type: 'move', color: 0, piece: 0, steps: 3 });

  for (let g = 0; g < 20; g++) {
    const game = G.newRound({ starter: g % 4, dice: 1 + (g % 2) });
    let guard = 0;
    while (!game.over) {
      assert.ok(++guard < 50000, 'the game has to end');
      G.applyMove(game, game.turn, G.botMove(game, game.turn));
      const seen = new Map();
      game.pieces.forEach((list, color) =>
        list.forEach((pos) => {
          assert.ok(pos >= NEST && pos <= GOAL);
          if (pos < START || pos === GOAL) return;
          const key = pos <= ENTRY ? `r${G.ringOf(color, pos)}` : `c${color}:${pos}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
          assert.ok(seen.get(key) <= 2, 'at most two pieces on a square');
        }),
      );
    }
    const team = game.over.team;
    for (const c of [team, team + 2]) assert.ok(game.pieces[c].every((pos) => pos === GOAL));
  }
});

// ---- as a match -----------------------------------------------------------------

function seated() {
  const m = new Match('p', { game: 'parchis' });
  m.join('a', 'A');
  m.target = 1;
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  return m;
}

test('a match plays through the Match, survives a save, and scores a game won', () => {
  const m = seated();
  const view = m.stateFor('a', new Set(['a']));
  assert.equal(view.seats[0].count, 0);
  assert.deepEqual(view.round.hand, []);
  assert.equal(m.stateFor('spectator', new Set()).round.hand, null);
  assert.deepEqual(m.rules.targets, [1, 2, 3]);

  const loaded = new Match('p', JSON.parse(JSON.stringify(m)));
  loaded.round.turn = 0;
  loaded.round.pieces = [[GOAL, GOAL, GOAL, GOAL - 1], [NEST, NEST, NEST, NEST], [GOAL, GOAL, GOAL, GOAL], [NEST, NEST, NEST, NEST]];
  loaded.round.stage = 'move';
  loaded.round.pending = [1];
  assert.equal(loaded.handle('a', { t: 'move', color: 0, piece: 3 }, new Set()), true);
  assert.equal(loaded.phase, 'matchEnd');
  assert.deepEqual(loaded.scores, [1, 0]);
  assert.equal(loaded.history[0].team, 0);
});

test('automatic moves only run for bots, and only for the same moment', () => {
  const m = seated();
  m.round.turn = 0;
  assert.equal(m.pendingAuto(), null);
  m.round.turn = 1;
  const p = m.pendingAuto();
  assert.equal(p.delay, G.ROLL_DELAY_MS);
  assert.equal(m.runAuto('stale'), false);
  assert.equal(m.runAuto(p.key, dice(5, 1)), true);
  assert.deepEqual(m.round.lastRoll.values, [5, 1]);
  assert.equal(m.pendingAuto().delay, G.MOVE_DELAY_MS);
});

// ---- two dice --------------------------------------------------------------------

const twoDice = (pieces, rest) => board(pieces, { dice: 2, ...rest });

test('each die is used on its own, in the order you pick, on one piece or two', () => {
  const r = twoDice({ 0: [10, 30, GOAL, GOAL] });
  G.roll(r, 0, dice(2, 4));
  assert.deepEqual(r.pending, [2, 4]);
  assert.deepEqual(G.legalMoves(r, 0).map((m) => [m.piece, m.to, m.uses]), [[0, 12, [2]], [1, 32, [2]], [0, 14, [4]], [1, 34, [4]]]);
  G.move(r, 0, 0, 1, 4);
  assert.equal(r.pieces[0][1], 34);
  assert.deepEqual(r.pending, [2]);
  assert.equal(r.turn, 0);
  assert.throws(() => G.move(r, 0, 0, 0, 4), /cannot move/, 'that die is spent');
  G.move(r, 0, 0, 1, 2);
  assert.equal(r.pieces[0][1], 36);
  assert.equal(r.turn, 1, 'no double, no second roll');
});

test('dice adding up to 5 bring a piece out between them, and that comes first', () => {
  const r = twoDice({ 0: [10] });
  G.roll(r, 0, dice(2, 3));
  const moves = G.legalMoves(r, 0);
  assert.ok(moves.every((m) => m.from === NEST && m.to === START));
  assert.deepEqual(moves[0].uses, [2, 3]);
  G.move(r, 0, 0, 1, 3);
  assert.equal(r.pieces[0][1], START);
  assert.deepEqual(r.pending, []);
  assert.equal(r.turn, 1);

  const none = twoDice({ 0: [10, 20, 30, 40] });
  G.roll(none, 0, dice(2, 3));
  assert.deepEqual(none.pending, [2, 3], 'with nobody to bring out they are two plain dice');
  assert.equal(G.legalMoves(none, 0).length, 8);
});

test('a single 5 brings a piece out and a double 5 brings out two', () => {
  const one = twoDice({ 0: [10] });
  G.roll(one, 0, dice(5, 1));
  assert.ok(G.legalMoves(one, 0).every((m) => m.from === NEST && m.uses[0] === 5));
  G.move(one, 0, 0, 1);
  assert.deepEqual(one.pending, [1]);

  const two = twoDice();
  G.roll(two, 0, dice(5, 5));
  G.move(two, 0, 0, 0);
  G.move(two, 0, 0, 1);
  assert.deepEqual(two.pieces[0], [START, START, NEST, NEST]);
  assert.equal(two.turn, 0, 'a double goes again');
  assert.equal(two.stage, 'roll');
});

test('with two dice a double rolls again and a 6 is just a 6', () => {
  const six = twoDice({ 0: [10, 20, 30, 40] });
  G.roll(six, 0, dice(6, 2));
  assert.deepEqual(six.pending, [6, 2], 'no 7 with two dice');
  G.move(six, 0, 0, 0, 6);
  G.move(six, 0, 0, 0, 2);
  assert.equal(six.turn, 1, 'no second roll for a 6');

  const double = twoDice({ 0: [10, 20, 30, 40] });
  G.roll(double, 0, dice(6, 6));
  assert.equal(double.again, true);
});

test('a third double sends the last piece home, and a double has to open a barrier', () => {
  const r = twoDice({ 0: [10, 20] }, { repeats: 2, lastMoved: { color: 0, piece: 1 } });
  G.roll(r, 0, dice(3, 3));
  assert.equal(r.pieces[0][1], NEST);
  assert.equal(r.lastRoll.penalty, true);
  assert.equal(r.turn, 1);

  const barrier = twoDice({ 0: [10, 10, 30, 40] });
  G.roll(barrier, 0, dice(2, 2));
  assert.ok(G.legalMoves(barrier, 0).every((m) => m.from === 10));
});

test('a die blocked now can still be used after the other one moves', () => {
  // A rival barrier 3 ahead stops the 4 for now.
  const r = twoDice({ 0: [10, 11, GOAL, GOAL] });
  const p = sameSquare(0, 13, 3);
  r.pieces[3][0] = p;
  r.pieces[3][1] = p;
  G.roll(r, 0, dice(1, 4));
  assert.deepEqual(G.legalMoves(r, 0).map((m) => [m.piece, m.uses[0]]), [[0, 1], [1, 1]]);
  r.pieces[3][1] = NEST; // the barrier opens while the 4 is still pending
  assert.ok(G.legalMoves(r, 0).some((m) => m.uses[0] === 4));
});

test('a bonus can be picked ahead of the die that is left', () => {
  const p = sameSquare(0, 20, 1);
  const r = twoDice({ 0: [17, 30, GOAL, GOAL], 1: [p] });
  G.roll(r, 0, dice(3, 1));
  G.move(r, 0, 0, 0, 3);
  assert.deepEqual(r.pending, [1, 20]);
  G.move(r, 0, 0, 1, 20);
  assert.equal(r.pieces[0][1], 50);
  assert.deepEqual(r.pending, [1]);
});

test('the dice are picked in the lobby only, and belong to parchís', () => {
  const m = new Match('d');
  m.join('a', 'A');
  assert.equal(m.variant, null);
  assert.equal(m.handle('a', { t: 'variant', variant: 1 }, new Set()), false, 'dominoes have no choice');
  assert.equal(m.stateFor('a', new Set()).variants, null);

  m.handle('a', { t: 'game', game: 'parchis' }, new Set());
  assert.equal(m.variant, 2);
  for (const variant of [0, 3, 'x', null]) assert.equal(m.handle('a', { t: 'variant', variant }, new Set()), false);
  assert.equal(m.handle('a', { t: 'variant', variant: 1 }, new Set()), true);
  const view = m.stateFor('a', new Set());
  assert.deepEqual(view.variants, [1, 2]);
  assert.equal(view.variant, 1);

  const loaded = new Match('d', JSON.parse(JSON.stringify(m)));
  assert.equal(loaded.variant, 1);
  loaded.handle('a', { t: 'addBots' }, new Set());
  loaded.handle('a', { t: 'start' }, new Set());
  assert.equal(loaded.round.dice, 1);
  assert.equal(loaded.handle('a', { t: 'variant', variant: 2 }, new Set()), false);

  loaded.phase = 'matchEnd';
  loaded.handle('a', { t: 'lobby' }, new Set());
  loaded.handle('a', { t: 'game', game: 'truco' }, new Set());
  assert.equal(loaded.variant, null);
  loaded.handle('a', { t: 'game', game: 'parchis' }, new Set());
  assert.equal(loaded.variant, 2, 'switching back starts from the default');
});

test('dice and moves are ignored from anyone not seated', () => {
  const m = seated();
  assert.equal(m.handle('spectator', { t: 'roll' }, new Set()), false);
});
