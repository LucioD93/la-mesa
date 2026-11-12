import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../server/games/fives.js';
import { Match } from '../server/match.js';

/** A round opened by seat 0, with these hands. */
function rigged(hands, { scores = [0, 0], target = 150 } = {}) {
  const r = F.newRound({ starter: 0, scores, target });
  r.hands = hands;
  return r;
}

test('the ends count: a lone tile its pips, a double on an end both halves', () => {
  assert.equal(F.endsCount([]), 0);
  assert.equal(F.endsCount([[6, 4]]), 10);
  assert.equal(F.endsCount([[5, 5]]), 10);
  assert.equal(F.endsCount([[4, 4], [4, 1]]), 9);
  assert.equal(F.endsCount([[3, 3], [3, 2], [2, 2]]), 10);
  assert.equal(F.scoreFor(0), 0);
  assert.equal(F.scoreFor(15), 15);
  assert.equal(F.scoreFor(12), 0);
});

test('pips round to the nearest 5', () => {
  assert.deepEqual([0, 2, 3, 7, 8, 12, 13].map(F.roundToFive), [0, 0, 5, 5, 10, 10, 15]);
});

test('a play scores for its team when the ends make a multiple of 5', () => {
  const r = rigged([[[6, 4], [0, 0]], [[4, 1], [0, 1]], [[1, 1], [0, 2]], [[6, 0], [0, 3]]]);
  F.play(r, 0, [6, 4], 'R'); // 6|4: 10
  assert.deepEqual(r.points, [10, 0]);
  assert.equal(r.lastAction.points, 10);
  F.play(r, 1, [4, 1], 'R'); // 6 … 1: 7
  assert.deepEqual(r.points, [10, 0]);
  assert.equal(r.lastAction.points, 0);
  F.play(r, 2, [1, 1], 'R'); // 6 … 1-1: 6 + 2 = 8
  assert.deepEqual(r.points, [10, 0]);
  F.play(r, 3, [6, 0], 'L'); // 0 … 1-1: 2
  assert.deepEqual(r.points, [10, 0]);
});

test('going out scores the other team\'s pips, to the nearest 5, on top of the ends', () => {
  const r = rigged([[[5, 0]], [[0, 0], [6, 6], [6, 1]], [[4, 3], [2, 2]], [[6, 5], [1, 1]]]);
  F.play(r, 0, [5, 0], 'R');
  assert.ok(r.over);
  assert.equal(r.over.reason, 'domino');
  // Seats 1 and 3 hold 0 + 12 + 7 + 11 + 2 = 32: rounded, 30. The opening 5-0 scored 5.
  assert.equal(r.over.bonus, 30);
  assert.deepEqual(r.points, [35, 0]);
});

test('reaching the target on a play ends the round on the spot', () => {
  const r = rigged([[[5, 5], [0, 0]], [[5, 2], [0, 1]], [[1, 3], [0, 2]], [[1, 4], [0, 3]]], { scores: [145, 0], target: 150 });
  F.play(r, 0, [5, 5], 'R');
  assert.equal(r.over.reason, 'target');
  assert.equal(r.over.winnerTeam, 0);
  assert.equal(r.over.bonus, 0);
});

test('the bot takes the play that scores the most, over the domino bot\'s heavy double', () => {
  const r = rigged([[[0, 0]], [[0, 0]], [[0, 0]], [[1, 1], [1, 6], [4, 4]]]);
  r.line = [[4, 1]];
  r.turn = 3;
  // 1-1 on the 1: 4 + 2 = 6. 4-4 on the 4: 8 + 1 = 9. 1-6 on the 1: 4 + 6 = 10.
  const move = F.botMove(r, 3);
  assert.deepEqual([move.tile, move.end], [[1, 6], 'R']);
});

test('a match of all fives plays to the end and adds the points as they land', () => {
  const m = new Match('fives', { game: 'fives' });
  m.handle('a', { t: 'addBots' }, new Set());
  m.target = 100;
  m.startRound();
  for (let i = 0; i < 2000 && m.phase !== 'matchEnd'; i++) {
    if (m.phase === 'roundEnd') m.startRound();
    const auto = m.pendingAuto();
    assert.ok(auto, 'every seat is a bot');
    const before = m.round.points.slice();
    m.runAuto(auto.key);
    const r = m.round;
    if (r.lastAction?.type === 'play' && !r.over) assert.equal(r.points[r.lastAction.seat % 2] - before[r.lastAction.seat % 2], r.lastAction.points);
  }
  assert.equal(m.phase, 'matchEnd');
  assert.ok(m.scores.some((s) => s >= 100));
  assert.ok(m.scores.every((s) => s % 5 === 0), 'every point comes in fives');
  const h = m.history.at(-1);
  assert.deepEqual(Object.keys(h).sort(), ['bonus', 'gained', 'reason', 'round', 'teamPips', 'winnerSeat', 'winnerTeam']);
  assert.deepEqual(m.history.reduce((sum, x) => [sum[0] + x.gained[0], sum[1] + x.gained[1]], [0, 0]), m.scores);
});

test('the round view shows the points so far', () => {
  const m = new Match('view', { game: 'fives' });
  m.handle('a', { t: 'addBots' }, new Set());
  m.startRound();
  const view = m.stateFor('nobody', new Set()).round;
  assert.deepEqual(view.points, [0, 0]);
  assert.equal(view.hand, null);
});
