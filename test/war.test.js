import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/war.js';
import { DEAL_MS } from '../server/games/common.js';
import { Match } from '../server/match.js';

/** A round with these face-down hands, the last card of each turned first. */
function dealt(hands) {
  const r = G.newRound({ dealer: 0 });
  r.hands = hands.map((h) => h.slice());
  r.fighting = [0, 1, 2, 3].filter((s) => r.hands[s].length);
  r.toFlip = r.fighting.slice();
  return r;
}

const flipAll = (r, seats = r.toFlip.slice()) => seats.forEach((s) => G.flip(r, s));

// ---- dealing --------------------------------------------------------------------

test('a round deals the whole deck face down, 13 each, and everyone turns at once', () => {
  const r = G.newRound({ dealer: 2 });
  assert.ok(r.hands.every((h) => h.length === G.HAND_SIZE));
  assert.equal(new Set(r.hands.flat().map(String)).size, 52);
  assert.deepEqual(r.toFlip, [0, 1, 2, 3]);
  for (let s = 0; s < 4; s++) assert.deepEqual(G.options(r, s), { flip: true });
});

test('nobody sees a card before it is turned, not even their own', () => {
  const m = new Match('w', { game: 'war' });
  for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
  m.startRound();
  const seen = m.stateFor('a', new Set()).round;
  assert.equal(seen.hand, 13);
  assert.equal(JSON.stringify(seen).includes(JSON.stringify(m.round.hands[0][0])), false);
});

// ---- battles --------------------------------------------------------------------

test('the highest card takes the battle for its team, aces high', () => {
  const r = dealt([[[5, 'S']], [[13, 'H']], [[2, 'D']], [[1, 'C']]]);
  flipAll(r, [2, 0, 3]);
  assert.equal(r.result, null, 'it waits for everyone');
  assert.throws(() => G.flip(r, 0), /already turned/);
  G.flip(r, 1);
  assert.deepEqual(r.result, { team: 1, seat: 3, cards: 4, war: 0 });
  assert.deepEqual(G.options(r, 0), { flip: false });
  assert.throws(() => G.flip(r, 0), /Wait for the cards/);
  G.collect(r);
  assert.deepEqual(r.won, [0, 4]);
  assert.deepEqual(r.over, { reason: 'cards', team: 1, cards: [0, 4] });
});

test('partners tied on top just take it, no war', () => {
  const r = dealt([[[3, 'S'], [9, 'S']], [[3, 'H'], [4, 'H']], [[3, 'D'], [9, 'D']], [[3, 'C'], [2, 'C']]]);
  flipAll(r);
  assert.equal(r.result.team, 0);
  assert.equal(r.war, 0);
});

test('a tie between the teams is war: the tied lay one down and turn one up, the rest wait', () => {
  const r = dealt([
    [[8, 'S'], [2, 'S'], [10, 'S']],
    [[3, 'H'], [7, 'H'], [10, 'H']],
    [[4, 'D'], [5, 'D'], [6, 'D']],
    [[4, 'C'], [5, 'C'], [6, 'C']],
  ]);
  flipAll(r);
  assert.equal(r.result, null);
  assert.equal(r.war, 1);
  assert.deepEqual(r.toFlip, [0, 1]);
  assert.equal(r.lastAction.type, 'war');
  assert.throws(() => G.flip(r, 2), /not in this war/);
  G.flip(r, 0);
  assert.deepEqual(r.table[0], [{ card: [10, 'S'], up: true }, { card: [2, 'S'], up: false }, { card: [8, 'S'], up: true }]);
  G.flip(r, 1);
  assert.deepEqual(r.result, { team: 0, seat: 0, cards: 8, war: 1 });
  G.collect(r);
  assert.deepEqual(r.won, [8, 0]);
  assert.deepEqual(r.wars, [1, 0]);
  assert.deepEqual(r.toFlip, [2, 3], 'only those with cards left fight the next battle');
});

test('the face-down card of a war stays secret until the round is over', () => {
  const r = dealt([[[8, 'S'], [2, 'S'], [10, 'S']], [[3, 'H'], [7, 'H'], [10, 'H']], [[4, 'D']], [[4, 'C']]]);
  flipAll(r);
  G.flip(r, 0);
  assert.deepEqual(G.game.roundView(r, 1).table[0], [[10, 'S'], null, [8, 'S']]);
});

test('with one card left, a war turns it up without one face down', () => {
  const r = dealt([[[6, 'S'], [12, 'S']], [[9, 'H'], [12, 'H']], [[2, 'D']], [[2, 'C']]]);
  flipAll(r);
  G.flip(r, 0);
  assert.deepEqual(r.table[0].map((c) => c.up), [true, true]);
});

test('a side out of cards mid-war loses it, and nobody takes a war nobody can finish', () => {
  const r = dealt([[[6, 'S'], [12, 'S']], [[12, 'H']], [[2, 'D']], [[2, 'C']]]);
  flipAll(r);
  assert.deepEqual(r.result, { team: 0, seat: 0, cards: 4, war: 0, tied: [0, 1] });

  const both = dealt([[[12, 'S']], [[12, 'H']], [[2, 'D']], [[2, 'C']]]);
  flipAll(both);
  assert.equal(both.result.team, null);
  G.collect(both);
  assert.equal(both.lost, 4);
  assert.deepEqual(both.over, { reason: 'cards', team: null, cards: [0, 0] });
});

test('a war can lead to another war', () => {
  const r = dealt([
    [[13, 'S'], [2, 'S'], [5, 'S'], [3, 'S'], [9, 'S']],
    [[4, 'H'], [2, 'H'], [5, 'H'], [3, 'H'], [9, 'H']],
    [[2, 'D']],
    [[2, 'C']],
  ]);
  flipAll(r);
  flipAll(r);
  assert.equal(r.war, 2);
  flipAll(r);
  assert.deepEqual(r.result, { team: 0, seat: 0, cards: 12, war: 2 });
});

// ---- the table plays itself ------------------------------------------------------

test('bots turn after the deal, the cards wait to be taken, and a round plays to the end', () => {
  const m = new Match('w', { game: 'war' });
  m.join('a', 'a');
  m.handle('a', { t: 'addBots' }, new Set(['a']));
  m.startRound();
  assert.ok(m.pendingAuto().delay >= DEAL_MS, 'the first battle waits for the deal');
  for (let i = 0; i < 3; i++) m.runAuto(m.pendingAuto().key);
  assert.equal(m.pendingAuto(), null, 'nothing left but the human');
  assert.equal(m.waitingOn().seat, 0);
  for (let i = 0; i < 400 && m.phase === 'playing'; i++) {
    if (m.round.toFlip.includes(0) && !m.round.result) m.handle('a', { t: 'flip' }, new Set(['a']));
    else m.runAuto(m.pendingAuto().key);
  }
  assert.equal(m.phase, 'roundEnd');
  const r = m.round;
  assert.equal(r.won[0] + r.won[1] + r.lost, 52);
  assert.equal(m.history.at(-1).team, r.over.team);
  assert.equal(m.scores[r.over.team] ?? 0, r.over.team === null ? 0 : 1);
});
