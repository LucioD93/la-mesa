import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/cochina.js';
import { BOT_DELAY_MS } from '../server/games/common.js';
import { Match } from '../server/match.js';

/** A round ready to play, with the table, hands and cochinas set by hand. Seat 1 plays first. */
function dealt({ table = [], hands = [[], [], [], []], deck = [], piles = [[], []] } = {}) {
  const r = G.newRound({ dealer: 0 });
  Object.assign(r, { table, hands, deck, piles });
  return r;
}

// ---- dealing --------------------------------------------------------------------

test('a round lays 4 cards, deals 3 each, and the player after the dealer starts', () => {
  for (let dealer = 0; dealer < 4; dealer++) {
    const r = G.newRound({ dealer });
    assert.equal(r.table.length, G.TABLE_CARDS);
    assert.ok(r.hands.every((h) => h.length === 3));
    assert.equal(r.deck.length, 40 - 4 - 12);
    assert.equal(r.deal, 1);
    assert.equal(r.turn, (dealer + 1) % 4);
    assert.deepEqual(r.piles, [[], []]);
  }
});

test('only the player on turn plays, and only a card they hold', () => {
  const r = dealt({ table: [[4, 'c']], hands: [[[1, 'o']], [[2, 'o']], [[3, 'o']], [[5, 'o']]] });
  assert.deepEqual(G.options(r, 1), { play: true });
  assert.deepEqual(G.options(r, 0), { play: false });
  assert.throws(() => G.play(r, 0, [1, 'o']), /Not your turn/);
  assert.throws(() => G.play(r, 1, [3, 'o']), /You do not have that card/);
});

// ---- playing ----------------------------------------------------------------------

test('a card with no match stays on the table', () => {
  const r = dealt({ table: [[4, 'c']], hands: [[[1, 'o']], [[2, 'o'], [6, 'b']], [[3, 'o']], [[5, 'o']]] });
  G.play(r, 1, [2, 'o']);
  assert.deepEqual(r.table, [[4, 'c'], [2, 'o']]);
  assert.deepEqual(r.piles, [[], []]);
  assert.equal(r.turn, 2);
  assert.equal(r.lastAction.steals, false);
});

test('a card takes every card of its number, and goes on top of the cochina', () => {
  const r = dealt({ table: [[7, 'c'], [3, 'e'], [7, 'b']], hands: [[[1, 'o']], [[7, 'o'], [6, 'b']], [[3, 'o']], [[5, 'o']]] });
  G.play(r, 1, [7, 'o']);
  assert.deepEqual(r.table, [[3, 'e']]);
  assert.deepEqual(r.piles[1], [[7, 'c'], [7, 'b'], [7, 'o']]);
  assert.deepEqual(r.lastAction.taken, [[7, 'c'], [7, 'b']]);
  assert.equal(r.lastCapture, 1);
});

test("matching the rivals' top card steals their whole cochina", () => {
  const r = dealt({
    table: [[12, 'c']],
    hands: [[[1, 'o']], [[5, 'o'], [6, 'b']], [[3, 'o']], [[2, 'o']]],
    piles: [[[1, 'c'], [4, 'e'], [5, 'c']], [[10, 'e']]],
  });
  G.play(r, 1, [5, 'o']);
  assert.deepEqual(r.piles[0], []);
  assert.deepEqual(r.piles[1], [[10, 'e'], [1, 'c'], [4, 'e'], [5, 'c'], [5, 'o']]);
  assert.deepEqual(r.steals, [0, 1]);
  assert.equal(r.lastAction.stolen, 3);
  assert.deepEqual(r.table, [[12, 'c']]);

  // Now team 1's top is the 5 it played: a 5 steals it right back, with the table's 5.
  r.table.push([5, 'b']);
  r.hands[2] = [[5, 'e']];
  G.play(r, 2, [5, 'e']);
  assert.deepEqual(r.piles[0], [[10, 'e'], [1, 'c'], [4, 'e'], [5, 'c'], [5, 'o'], [5, 'b'], [5, 'e']]);
  assert.deepEqual(r.piles[1], []);
  assert.deepEqual(r.steals, [1, 1]);
});

test('partners never steal from their own cochina', () => {
  const r = dealt({ table: [], hands: [[], [[4, 'o'], [1, 'b']], [], [[4, 'b']]], piles: [[], [[4, 'c']]] });
  G.play(r, 1, [4, 'o']);
  assert.deepEqual(r.piles[1], [[4, 'c']]);
  assert.deepEqual(r.table, [[4, 'o']]);
});

test('an empty cochina has nothing to steal', () => {
  const r = dealt({ table: [], hands: [[], [[4, 'o'], [1, 'b']], [], []] });
  assert.deepEqual(G.takes(r, 1, [4, 'o']), { taken: [], steals: false });
});

// ---- dealing again and the end ------------------------------------------------------

test('empty hands get a new deal until the deck is out', () => {
  const r = G.newRound({ dealer: 3 });
  for (let i = 0; i < 4; i++) {
    G.play(r, r.turn, r.hands[r.turn][0]);
    G.play(r, r.turn, r.hands[r.turn][0]);
    G.play(r, r.turn, r.hands[r.turn][0]);
  }
  assert.equal(r.deal, 2);
  assert.ok(r.hands.every((h) => h.length === 3));
  assert.equal(r.deck.length, 12);
});

test('at the end the last capture takes the table, under its top card, and the bigger cochina wins', () => {
  const r = dealt({
    table: [[11, 'o']],
    hands: [[[2, 'e']], [[4, 'c']], [], []],
    piles: [[[1, 'o'], [1, 'c']], [[6, 'c']]],
  });
  Object.assign(r, { turn: 0, lastCapture: 1 });
  G.play(r, 0, [2, 'e']);
  G.play(r, 1, [4, 'c']);
  assert.ok(r.over);
  assert.equal(r.leftovers, 3);
  assert.deepEqual(r.piles[1], [[11, 'o'], [2, 'e'], [4, 'c'], [6, 'c']]);
  assert.deepEqual(r.over, { reason: 'cards', team: 1, cards: [2, 4] });
  assert.throws(() => G.play(r, 2, [1, 'o']), /Round is over/);
});

test('every full round ends with all 40 cards in the cochinas, or on the table if nobody took', () => {
  for (let i = 0; i < 100; i++) {
    const r = G.newRound({ dealer: i % 4 });
    while (!r.over) G.play(r, r.turn, G.botMove(r, r.turn).card);
    assert.equal(r.deal, G.DEALS);
    assert.equal(r.piles[0].length + r.piles[1].length + r.table.length, 40);
    assert.deepEqual(r.over.cards, [r.piles[0].length, r.piles[1].length]);
  }
});

// ---- bot ----------------------------------------------------------------------------

test('the bot steals the biggest cochina it can, over a table capture', () => {
  const r = dealt({
    table: [[3, 'c'], [3, 'b']],
    hands: [[], [[3, 'o'], [6, 'o'], [12, 'b']], [], []],
    piles: [[[1, 'o'], [2, 'o'], [7, 'c'], [6, 'c']], []],
  });
  assert.deepEqual(G.botMove(r, 1).card, [6, 'o']);
});

test('the bot captures rather than dropping a card', () => {
  const r = dealt({ table: [[10, 'c']], hands: [[], [[3, 'o'], [10, 'o'], [12, 'b']], [], []] });
  assert.deepEqual(G.botMove(r, 1).card, [10, 'o']);
});

test('dropping, the bot plays a number it holds twice, so it can win it back', () => {
  const r = dealt({ table: [[10, 'c']], hands: [[], [[3, 'o'], [3, 'e'], [12, 'b']], [], []] });
  assert.deepEqual(G.botMove(r, 1).card[0], 3);
});

// ---- in a match -----------------------------------------------------------------------

function botMatch() {
  const m = new Match('c', { game: 'cochina' });
  for (let i = 0; i < 4; i++) m.seats[i] = { token: null, name: `Bot ${i}`, bot: true };
  m.startRound();
  return m;
}

test('a match of bots plays itself to the target', () => {
  const m = botMatch();
  assert.equal(m.target, 3);
  let guard = 0;
  while (m.phase !== 'matchEnd' && guard++ < 5000) {
    if (m.phase === 'roundEnd') m.startRound();
    const p = m.pendingAuto();
    assert.ok(p.delay >= BOT_DELAY_MS);
    assert.ok(m.runAuto(p.key));
  }
  assert.equal(m.phase, 'matchEnd');
  assert.ok(m.scores.some((s) => s >= 3));
  assert.equal(m.history.length, m.roundNo);
  const wins = [0, 1].map((team) => m.history.filter((h) => h.team === team).length);
  assert.deepEqual(wins, m.scores);
});

test('a tied round scores nobody', () => {
  const m = botMatch();
  m.round.over = { reason: 'cards', team: null, cards: [18, 18] };
  m.afterMove();
  assert.deepEqual(m.scores, [0, 0]);
  assert.equal(m.phase, 'roundEnd');
  assert.equal(m.history[0].team, null);
});

test('a player sees their hand, both tops and pile sizes, never what is under them', () => {
  const m = botMatch();
  m.seats[1] = { token: 'me', name: 'Me', bot: false };
  m.round.piles = [[[1, 'o'], [2, 'o']], [[7, 'e']]];
  const v = m.stateFor('me', new Set(['me'])).round;
  assert.deepEqual(v.hand, m.round.hands[1]);
  assert.deepEqual(v.piles, [2, 1]);
  assert.deepEqual(v.tops, [[2, 'o'], [7, 'e']]);
  assert.equal(v.hands, null);
  assert.ok(!JSON.stringify(v).includes('"deck"'));
  const watcher = m.stateFor('nobody', new Set()).round;
  assert.equal(watcher.hand, null);
  assert.deepEqual(watcher.options, { play: false });
});
