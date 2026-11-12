import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/rummy.js';
import { BOT_DELAY_MS, DEAL_MS } from '../server/games/common.js';
import { Match } from '../server/match.js';

/** A round where seat 1 has drawn and is about to play, with the hands set by hand. */
function drawn({ hands = [[], [], [], []], ...rest } = {}) {
  const r = G.newRound({ dealer: 0 });
  Object.assign(r, { hands, turn: 1, drawn: true }, rest);
  return r;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---- melds ---------------------------------------------------------------------

test('sets and runs, with the ace low or high but never both', () => {
  const kind = (...cards) => G.arrange(cards)?.kind ?? null;
  assert.equal(kind([7, 'S'], [7, 'H'], [7, 'C']), 'set');
  assert.equal(kind([7, 'S'], [7, 'H'], [7, 'C'], [7, 'D']), 'set');
  assert.equal(kind([5, 'H'], [3, 'H'], [4, 'H']), 'run');
  assert.equal(kind([1, 'H'], [2, 'H'], [3, 'H']), 'run');
  assert.equal(kind([12, 'H'], [1, 'H'], [13, 'H']), 'run');
  assert.equal(kind([13, 'H'], [1, 'H'], [2, 'H']), null);
  assert.equal(kind([5, 'H'], [6, 'H'], [8, 'H']), null);
  assert.equal(kind([5, 'H'], [6, 'H'], [7, 'S']), null);
  assert.equal(kind([5, 'H'], [6, 'H']), null);
  assert.equal(kind([5, 'H'], [5, 'H'], [5, 'S']), null);
  assert.deepEqual(G.arrange([[12, 'H'], [1, 'H'], [13, 'H']]).cards, [[12, 'H'], [13, 'H'], [1, 'H']]);
});

test('what cards are worth, the ace less at the bottom of a run', () => {
  assert.deepEqual([[2, 'S'], [9, 'S'], [10, 'S'], [13, 'S'], [1, 'S']].map((c) => G.cardPoints(c)), [5, 5, 10, 10, 15]);
  assert.equal(G.meldPoints(G.arrange([[1, 'H'], [2, 'H'], [3, 'H']])), 11);
  assert.equal(G.meldPoints(G.arrange([[12, 'H'], [13, 'H'], [1, 'H']])), 35);
  assert.equal(G.meldPoints(G.arrange([[1, 'H'], [1, 'S'], [1, 'C']])), 45);
});

// ---- a turn --------------------------------------------------------------------

test('the deal: 7 each, one card face up, and the seat after the dealer draws first', () => {
  const r = G.newRound({ dealer: 2 });
  assert.ok(r.hands.every((h) => h.length === G.HAND_SIZE));
  assert.equal(r.discard.length, 1);
  assert.equal(r.stock.length, 52 - 28 - 1);
  assert.equal(r.turn, 3);
  assert.deepEqual(G.options(r, 3), { draw: true, play: false });
  assert.deepEqual(G.options(r, 0), { draw: false, play: false });
});

test('draw, then meld or lay off, then discard to pass the turn', () => {
  const r = G.newRound({ dealer: 0 });
  r.hands[1] = [[7, 'S'], [7, 'H'], [2, 'C'], [9, 'D']];
  r.discard = [[7, 'C']];
  assert.throws(() => G.discard(r, 1, [2, 'C']), /Draw a card first/);
  assert.throws(() => G.draw(r, 2, 'stock'), /Not your turn/);
  G.draw(r, 1, 'discard');
  assert.deepEqual(r.discard, []);
  assert.throws(() => G.draw(r, 1, 'stock'), /Not your turn/);
  G.meld(r, 1, [[7, 'S'], [7, 'H'], [7, 'C']]);
  assert.deepEqual(r.melded, [0, 15]);
  assert.equal(r.melds[0].team, 1);
  assert.throws(() => G.discard(r, 1, [7, 'C']), /do not have/);
  G.discard(r, 1, [9, 'D']);
  assert.equal(r.turn, 2);
  assert.equal(r.drawn, false);
  assert.deepEqual(r.discard, [[9, 'D']]);
  assert.deepEqual(r.hands[1], [[2, 'C']]);
});

test('a card taken from the discard pile cannot go straight back', () => {
  const r = G.newRound({ dealer: 0 });
  r.hands[1] = [[2, 'C'], [9, 'D']];
  r.discard = [[13, 'S']];
  G.draw(r, 1, 'discard');
  assert.throws(() => G.discard(r, 1, [13, 'S']), /just took/);
  G.discard(r, 1, [2, 'C']);
  assert.equal(r.turn, 2);
});

test('an illegal meld or lay-off changes nothing', () => {
  const r = drawn({ hands: [[], [[5, 'H'], [6, 'H'], [8, 'H'], [9, 'S']], [], []] });
  assert.throws(() => G.meld(r, 1, [[5, 'H'], [6, 'H'], [8, 'H']]), /not a meld/);
  assert.throws(() => G.meld(r, 1, [[5, 'H'], [6, 'H'], [7, 'H']]), /do not have/);
  assert.throws(() => G.meld(r, 1, 'all'), /not a meld/);
  r.melds = [{ kind: 'run', cards: [[2, 'H'], [3, 'H'], [4, 'H']], team: 0, seat: 0 }];
  assert.throws(() => G.layoff(r, 1, [6, 'H'], 0), /does not fit/);
  assert.throws(() => G.layoff(r, 1, [5, 'H'], 3), /no such meld/);
  assert.equal(r.hands[1].length, 4);
  assert.deepEqual(r.melded, [0, 0]);
});

test('anyone lays off on any meld, and the points go to whoever laid the card', () => {
  const r = drawn({ hands: [[], [[1, 'H'], [5, 'H'], [13, 'S']], [], []] });
  r.melds = [{ kind: 'run', cards: [[2, 'H'], [3, 'H'], [4, 'H']], team: 0, seat: 0 }];
  G.layoff(r, 1, [5, 'H'], 0);
  G.layoff(r, 1, [1, 'H'], 0);
  assert.deepEqual(r.melds[0].cards, [[1, 'H'], [2, 'H'], [3, 'H'], [4, 'H'], [5, 'H']]);
  assert.deepEqual(r.melded, [0, 6]); // 5 for the five, 1 for the ace below the 2
  assert.equal(r.melds[0].team, 0);
});

// ---- the end of a round ------------------------------------------------------

test('going out ends the round: melded points less what both partners hold', () => {
  const r = drawn({
    hands: [[[13, 'S'], [2, 'S']], [[7, 'S'], [7, 'H'], [7, 'C'], [9, 'D']], [[1, 'C']], [[10, 'D']]],
  });
  G.meld(r, 1, [[7, 'S'], [7, 'H'], [7, 'C']]);
  assert.equal(r.over, null);
  G.discard(r, 1, [9, 'D']);
  assert.deepEqual(r.over, { reason: 'out', seat: 1 });
  assert.deepEqual(G.roundScore(r), [
    { melded: 0, held: 30, points: -30 }, // seats 0 and 2: K, 2 and an ace
    { melded: 15, held: 10, points: 5 }, // seat 3 still has a 10
  ]);
});

test('melding your last cards goes out without a discard', () => {
  const r = drawn({ hands: [[[2, 'S']], [[7, 'S'], [7, 'H'], [7, 'C']], [], []] });
  G.meld(r, 1, [[7, 'S'], [7, 'H'], [7, 'C']]);
  assert.deepEqual(r.over, { reason: 'out', seat: 1 });
});

test('the round ends when the deck runs out', () => {
  const r = drawn({ hands: [[], [[2, 'S'], [9, 'D']], [], []], stock: [] });
  G.discard(r, 1, [9, 'D']);
  assert.deepEqual(r.over, { reason: 'stock' });
});

// ---- bots ----------------------------------------------------------------------

test('a bot takes a discard it can use, melds, lays off and throws its worst card', () => {
  const r = G.newRound({ dealer: 0 });
  r.hands[1] = [[7, 'S'], [7, 'H'], [2, 'C'], [13, 'D'], [5, 'D']];
  r.discard = [[7, 'C']];
  assert.deepEqual(G.botMove(r, 1), { type: 'draw', from: 'discard' });
  G.draw(r, 1, 'discard');
  assert.equal(G.botMove(r, 1).type, 'meld');
  G.applyMove(r, 1, G.botMove(r, 1));
  r.melds.push({ kind: 'run', cards: [[2, 'D'], [3, 'D'], [4, 'D']], team: 0, seat: 0 });
  assert.deepEqual(G.botMove(r, 1), { type: 'layoff', card: [5, 'D'], index: 1 });
  G.applyMove(r, 1, G.botMove(r, 1));
  assert.deepEqual(G.botMove(r, 1), { type: 'discard', card: [13, 'D'] });

  const s = G.newRound({ dealer: 0 });
  s.hands[1] = [[7, 'S'], [9, 'H'], [2, 'C']];
  s.discard = [[13, 'C']];
  assert.deepEqual(G.botMove(s, 1), { type: 'draw', from: 'stock' });
});

test('bots play whole rounds and every card is accounted for', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const r = G.newRound({ dealer: seed % 4, rng: seeded(seed) });
    let guard = 0;
    while (!r.over) {
      assert.ok(guard++ < 500, 'the round ends');
      G.applyMove(r, r.turn, G.botMove(r, r.turn));
    }
    const onTable = r.melds.reduce((n, m) => n + m.cards.length, 0);
    const held = r.hands.reduce((n, h) => n + h.length, 0);
    assert.equal(onTable + held + r.stock.length + r.discard.length, 52);
    for (const m of r.melds) assert.ok(G.arrange(m.cards));
    if (r.over.reason === 'out') assert.equal(r.hands[r.over.seat].length, 0);
    else assert.equal(r.stock.length, 0);
  }
});

test('a match with four bots runs to the end, paced like the other games', () => {
  const m = new Match('bots', { game: 'rummy' });
  m.handle('a', { t: 'addBots' }, new Set());
  m.startRound();
  assert.equal(m.pendingAuto().delay, BOT_DELAY_MS + DEAL_MS); // the deal shows first
  m.runAuto(m.pendingAuto().key, seeded(1)); // drawn: the rest of the turn goes at its own pace
  assert.equal(m.pendingAuto().delay, G.STEP_MS);
  let guard = 0;
  const rng = seeded(3);
  while (m.phase !== 'matchEnd') {
    assert.ok(guard++ < 20000);
    if (m.phase === 'roundEnd') m.startRound(rng);
    else m.runAuto(m.pendingAuto().key, rng);
  }
  assert.ok(m.scores.some((s) => s >= m.target));
  const sum = (team) => m.history.reduce((n, h) => n + h.score[team].points, 0);
  assert.deepEqual(m.scores, [sum(0), sum(1)]);
});

// ---- what each player sees -----------------------------------------------------

test('a player sees their own hand, the top of the discard pile and nobody else’s draw', () => {
  const m = new Match('v', { game: 'rummy' });
  for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
  m.nextStarter = 0;
  m.startRound();
  const r = m.round;
  assert.equal(r.turn, 1);
  assert.equal(m.handle('b', { t: 'draw', from: 'stock' }, new Set()), true);
  const drawnCard = r.hands[1].at(-1);
  const forB = m.stateFor('b', new Set()).round;
  const forC = m.stateFor('c', new Set()).round;
  assert.deepEqual(forB.newCard, drawnCard);
  assert.equal(forC.newCard, null);
  assert.equal(forC.lastAction.card, null);
  assert.equal(forC.hands, null);
  assert.equal(forC.hand.length, 7);
  assert.deepEqual(forC.options, { draw: false, play: false });
  assert.deepEqual(forB.options, { draw: false, play: true });
  assert.equal(forC.stock, 52 - 28 - 2);
  // Not a rummy move: nothing happens.
  assert.equal(m.handle('b', { t: 'play', card: drawnCard }, new Set()), false);
});
