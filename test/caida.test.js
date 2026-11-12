import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/caida.js';
import { BOT_DELAY_MS } from '../server/games/common.js';
import { Match } from '../server/match.js';

/** A round ready to play, with the table and hands set by hand. Seat 1 plays first. */
function dealt({ table = [], hands = [[], [], [], []], deck = [], ...rest } = {}) {
  const r = G.newRound({ dealer: 0, ...rest });
  Object.assign(r, { table, hands, deck, deal: 1, turn: 1 });
  return r;
}

/** Stack the deck so the table comes out in this order (the deck deals from the end). */
function stacked(cards) {
  const r = G.newRound({ dealer: 0 });
  const rest = r.deck.filter((c) => !cards.some((s) => s[0] === c[0] && s[1] === c[1]));
  r.deck = [...rest, ...cards.slice().reverse()];
  return r;
}

const kinds = (r) => r.awards.map((a) => a.kind);

// ---- the table -----------------------------------------------------------------

test('a card on its own number scores that number, in the order the dealer called', () => {
  const up = stacked([[5, 'c'], [2, 'e'], [12, 'o'], [7, 'b']]);
  G.chooseOrder(up, 0, 1);
  assert.deepEqual(up.opening.slots.map((s) => s.hit), [false, true, false, false]);
  assert.deepEqual(up.points, [2, 0]);
  assert.deepEqual(kinds(up), ['table']);

  const down = stacked([[4, 'c'], [2, 'e'], [2, 'o'], [1, 'b'], [7, 'o']]);
  G.chooseOrder(down, 0, -1, () => 0);
  // Counting 4, 3, 2, 1: the 4 and the 1 land on their numbers, the second 2 is sent back.
  assert.deepEqual(down.table, [[4, 'c'], [2, 'e'], [1, 'b'], [7, 'o']]);
  assert.deepEqual(down.opening.slots.map((s) => s.spot), [4, 3, 2, 1]);
  assert.deepEqual(down.opening.slots.map((s) => s.hit), [true, false, false, false]);
  assert.deepEqual(down.points, [4, 0]); // a repeated card costs nothing
  assert.equal(down.opening.repeats, 1);
});

test('no card on its number is a mala echada, and pays the other team', () => {
  const r = stacked([[5, 'c'], [3, 'e'], [12, 'o'], [7, 'b']]);
  G.chooseOrder(r, 0, 1);
  assert.deepEqual(r.points, [0, 1]);
  assert.deepEqual(kinds(r), ['mala']);
});

test('the table always has four different numbers and the deal uses the rest of the count', () => {
  for (let i = 0; i < 200; i++) {
    const r = G.newRound({ dealer: 2 });
    G.chooseOrder(r, 2, i % 2 ? 1 : -1);
    assert.equal(new Set(r.table.map(([n]) => n)).size, G.TABLE_CARDS);
    assert.ok(r.hands.every((h) => h.length === 3));
    assert.equal(r.deck.length, 40 - 4 - 12);
    assert.equal(r.turn, 3);
  }
});

test('only the dealer calls the count, once, and nothing is dealt before it', () => {
  const r = G.newRound({ dealer: 1 });
  assert.ok(r.hands.every((h) => !h.length));
  assert.deepEqual(G.options(r, 1), { order: true, play: false, canto: null });
  assert.throws(() => G.chooseOrder(r, 0, 1), /Not your turn/);
  assert.throws(() => G.chooseOrder(r, 1, 2), /Unknown order/);
  assert.throws(() => G.play(r, 1, [1, 'o']), /Not your turn/);
  G.chooseOrder(r, 1, 1);
  assert.throws(() => G.chooseOrder(r, 2, 1), /Not your turn/);
});

// ---- captures ------------------------------------------------------------------

test('a card takes its number and what follows without a gap, including 7 to 10', () => {
  const table = [[5, 'c'], [6, 'o'], [7, 'b'], [10, 'e'], [12, 'o'], [2, 'c']];
  assert.deepEqual(G.takes(table, [5, 'o']), [[5, 'c'], [6, 'o'], [7, 'b'], [10, 'e']]);
  assert.deepEqual(G.takes(table, [12, 'c']), [[12, 'o']]);
  assert.deepEqual(G.takes(table, [3, 'c']), []);
});

test('a capture goes to the team pile and a card with no match stays', () => {
  const r = dealt({ table: [[5, 'c'], [6, 'o']], hands: [[], [[5, 'o'], [1, 'c'], [2, 'c']], [[4, 'o'], [1, 'b'], [2, 'b']], []] });
  G.play(r, 1, [5, 'o']);
  assert.deepEqual(r.table, []);
  assert.deepEqual(r.piles, [0, 3]);
  assert.equal(r.lastCapture, 1);
  G.play(r, 2, [4, 'o']);
  assert.deepEqual(r.table, [[4, 'o']]);
  assert.equal(r.turn, 3);
});

test('you can only play your own card on your turn', () => {
  const r = dealt({ hands: [[], [[5, 'o'], [1, 'c'], [2, 'c']], [[4, 'o'], [1, 'b'], [2, 'b']], []] });
  assert.throws(() => G.play(r, 2, [4, 'o']), /Not your turn/);
  assert.throws(() => G.play(r, 1, [4, 'o']), /do not have/);
});

// ---- caída and mesa limpia -----------------------------------------------------

test('taking the card just played is a caída, worth more for high cards', () => {
  assert.deepEqual([1, 7, 10, 11, 12].map(G.cardValue), [1, 1, 2, 3, 4]);
  const r = dealt({
    table: [[3, 'c']],
    hands: [[], [[12, 'o'], [1, 'c'], [2, 'c']], [[12, 'b'], [1, 'b'], [2, 'b']], []],
  });
  G.play(r, 1, [12, 'o']);
  assert.deepEqual(r.points, [0, 0]);
  G.play(r, 2, [12, 'b']);
  assert.deepEqual(r.points, [4, 0]);
  assert.deepEqual(r.table, [[3, 'c']]);
  assert.equal(r.lastAction.caida, 4);
  assert.equal(r.lastAction.mesa, 0);
});

test('a card that was already on the table is no caída', () => {
  const r = dealt({ table: [[5, 'c']], hands: [[], [[1, 'o'], [1, 'c'], [2, 'c']], [[5, 'b'], [1, 'b'], [2, 'b']], []] });
  G.play(r, 1, [1, 'o']);
  G.play(r, 2, [5, 'b']); // takes the old 5, not the 1 just played
  assert.deepEqual(r.points, [0, 0]);
});

test('clearing the table is mesa limpia, and it adds to a caída', () => {
  const r = dealt({ hands: [[], [[6, 'o'], [1, 'c'], [2, 'c']], [[6, 'b'], [1, 'b'], [2, 'b']], []] });
  G.play(r, 1, [6, 'o']);
  G.play(r, 2, [6, 'b']);
  assert.deepEqual(kinds(r), ['caida', 'mesa']);
  assert.deepEqual(r.points, [5, 0]);
});

test('there is no mesa limpia in the last deal', () => {
  const r = dealt({ hands: [[], [[6, 'o'], [1, 'c'], [2, 'c']], [[6, 'b'], [1, 'b'], [2, 'b']], []] });
  r.deal = G.DEALS;
  G.play(r, 1, [6, 'o']);
  G.play(r, 2, [6, 'b']);
  assert.deepEqual(kinds(r), ['caida']);
  assert.equal(r.lastAction.mesa, 0);
});

// ---- cantos --------------------------------------------------------------------

test('the cantos in a hand', () => {
  const c = (...ns) => {
    const canto = G.cantoOf(ns.map((n) => [n, 'o']));
    return canto && [canto.kind, canto.points];
  };
  assert.deepEqual(c(6, 6, 3), ['ronda', 1]);
  assert.deepEqual(c(12, 3, 12), ['ronda', 4]);
  assert.deepEqual(c(12, 12, 1), ['ronda', 4]); // the 12 isn't next to the 1
  assert.deepEqual(c(4, 4, 4), ['trivilin', 5]);
  assert.deepEqual(c(3, 1, 2), ['patrulla', 6]);
  assert.deepEqual(c(7, 11, 10), ['patrulla', 6]); // there are no 8s or 9s
  assert.deepEqual(c(3, 4, 3), ['vigia', 7]);
  assert.deepEqual(c(10, 7, 7), ['vigia', 7]);
  assert.deepEqual(c(12, 1, 11), ['registro', 8]);
  assert.equal(c(1, 3, 12), null);
  assert.equal(c(12, 1, 2), null); // the sequence doesn't wrap around
});

/** Everyone plays one card from the deal, singing first if they're told to. */
function firstCards(r, singers) {
  for (const seat of [1, 2, 3, 0]) {
    if (singers.includes(seat)) G.sing(r, seat);
    G.play(r, seat, r.hands[seat][2]);
  }
}

const quiet = [[1, 'o'], [3, 'o'], [5, 'o']];

test('a canto pays once everyone has played, and only if it was sung', () => {
  const hands = [quiet, [[6, 'e'], [6, 'o'], [11, 'c']], quiet.map(([n]) => [n, 'c']), [[10, 'c'], [10, 'b'], [12, 'b']]];
  const r = dealt({ table: [[4, 'e']], hands: hands.map((h) => h.slice()), deck: [[2, 'o']] });
  G.sing(r, 1);
  assert.deepEqual(r.points, [0, 0]);
  assert.throws(() => G.sing(r, 1), /cannot sing/);
  G.play(r, 1, [11, 'c']);
  G.play(r, 2, [5, 'c']);
  G.play(r, 3, [12, 'b']); // had a Ronda of 10s and said nothing
  assert.deepEqual(r.points, [0, 0]);
  G.play(r, 0, [5, 'o']); // the second 5: that's a caída off nobody, the 12 was last
  assert.equal(r.awards.find((a) => a.kind === 'ronda').team, 1);
  assert.deepEqual(r.points, [0, 1]);
});

test('you cannot sing out of turn, without a canto, or after your first card', () => {
  const r = dealt({ table: [[4, 'e']], hands: [quiet.slice(), [[6, 'e'], [6, 'o'], [11, 'c']], [[1, 'b'], [3, 'b'], [5, 'b']], []] });
  assert.throws(() => G.sing(r, 2), /cannot sing/);
  G.play(r, 1, [11, 'c']);
  assert.throws(() => G.sing(r, 1), /cannot sing/);
  assert.throws(() => G.sing(r, 2), /cannot sing/);
});

test('only the best canto at the table pays', () => {
  const cantos = (r) => r.awards.filter((a) => !['caida', 'mesa'].includes(a.kind)).map((a) => [a.kind, a.seat, a.points]);
  const pair = (n, third = 3) => [[n, 'o'], [n, 'c'], [third, 'b']];
  const r = dealt({ hands: [[[1, 'e'], [11, 'e'], [12, 'e']], pair(12), [[5, 'o'], [6, 'o'], [7, 'o']], [[2, 'e'], [2, 'c'], [3, 'c']]] });
  firstCards(r, [1, 2, 3, 0]); // ronda, patrulla, vigía and registro: the registro takes it
  assert.deepEqual(cantos(r), [['registro', 0, 8]]);

  // The same points: a higher pair, then a higher third card.
  const pairs = dealt({ hands: [pair(2, 12), pair(5), pair(2, 11), quiet.slice()] });
  firstCards(pairs, [0, 1, 2]);
  assert.deepEqual(cantos(pairs), [['ronda', 1, 1]]);
  const thirds = dealt({ hands: [pair(5, 12), pair(5, 10), quiet.slice(), quiet.slice()] });
  firstCards(thirds, [0, 1]);
  assert.deepEqual(cantos(thirds), [['ronda', 0, 1]]);

  // The same cards: the dealer (seat 0) loses to the seat on its right.
  const same = dealt({ hands: [pair(5, 12), pair(5, 12), quiet.slice(), quiet.slice()] });
  firstCards(same, [0, 1]);
  assert.deepEqual(cantos(same), [['ronda', 1, 1]]);
});

test('cantos start over with each deal', () => {
  const r = dealt({
    table: [[4, 'e']],
    hands: [[[1, 'e']], [[6, 'c']], [[7, 'o']], [[11, 'o']]],
    deck: [[1, 'c'], [1, 'b'], [2, 'o'], [3, 'c'], [3, 'b'], [5, 'c'], [5, 'b'], [10, 'c'], [10, 'b'], [12, 'c'], [12, 'b'], [2, 'c']],
  });
  r.sung = [{ seat: 1, kind: 'ronda', points: 1 }];
  for (const seat of [1, 2, 3, 0]) G.play(r, seat, r.hands[seat][0]);
  assert.equal(r.deal, 2);
  assert.deepEqual(r.sung, []);
  assert.equal(r.turn, 1);
  assert.ok(r.hands.every((h) => h.length === 3));
});

// ---- the end of a round --------------------------------------------------------

test('the last capture takes what is left, and cards above 20 score', () => {
  const r = dealt({ table: [[2, 'o']], hands: [[[12, 'o']], [[4, 'c']], [[2, 'c']], [[6, 'c']]] });
  r.piles = [24, 12];
  G.play(r, 1, [4, 'c']);
  G.play(r, 2, [2, 'c']); // takes the 2, leaving the 4
  G.play(r, 3, [6, 'c']);
  G.play(r, 0, [12, 'o']);
  assert.equal(r.leftovers, 3); // the 4, the 6 and the 12 go to seat 2's team
  assert.deepEqual(r.piles, [29, 12]);
  assert.deepEqual(r.awards.at(-1), { kind: 'cards', team: 0, points: 9, cards: [29, 12] });
  assert.deepEqual(r.over, { reason: 'cards' });
});

test('an even count scores nothing', () => {
  const r = dealt({ table: [[2, 'o']], hands: [[], [[2, 'c']], [], []] });
  r.piles = [20, 18];
  r.hands = [[], [[2, 'c']], [], []];
  G.play(r, 1, [2, 'c']);
  assert.deepEqual(r.piles, [20, 20]);
  assert.ok(!kinds(r).includes('cards'));
  assert.ok(r.over);
});

test('reaching the target ends the round on the spot, and points carry to the match', () => {
  const r = dealt({
    scores: [22, 0],
    target: 24,
    table: [[3, 'c']],
    hands: [[], [[10, 'o'], [1, 'c'], [2, 'c']], [[10, 'b'], [1, 'b'], [2, 'b']], []],
  });
  G.play(r, 1, [10, 'o']);
  G.play(r, 2, [10, 'b']);
  assert.deepEqual(r.over, { reason: 'target', team: 0 });
  assert.throws(() => G.play(r, 3, [1, 'o']), /Round is over/);
});

test('a dealer can win the game with the table alone', () => {
  const m = new Match('win', { game: 'caida', target: 24 });
  for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
  m.nextStarter = 0;
  m.scores = [21, 0];
  m.startRound();
  const cards = [[1, 'o'], [2, 'o'], [3, 'o'], [7, 'o']];
  m.round.deck = [...m.round.deck.filter((c) => !cards.some((s) => s[0] === c[0] && s[1] === c[1])), ...cards.slice().reverse()];
  assert.equal(m.handle('a', { t: 'order', dir: 1 }, new Set()), true);
  assert.equal(m.phase, 'matchEnd');
  assert.deepEqual(m.scores, [27, 0]); // 1 + 2 + 3
});

// ---- whole games ---------------------------------------------------------------

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('bots play whole rounds and every card is accounted for', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = seeded(seed);
    const r = G.newRound({ dealer: seed % 4, target: 1000, rng });
    let guard = 0;
    while (!r.over) {
      assert.ok(guard++ < 100, 'the round ends');
      G.applyMove(r, r.turn, G.botMove(r, r.turn, rng), rng);
    }
    assert.equal(r.piles[0] + r.piles[1], 40);
    assert.equal(r.deck.length, 0);
    assert.ok(r.hands.every((h) => !h.length));
    assert.equal(r.plays, 36);
    assert.equal(r.deal, G.DEALS);
    for (const team of [0, 1]) {
      assert.equal(r.awards.filter((a) => a.team === team).reduce((sum, a) => sum + a.points, 0), r.points[team]);
    }
  }
});

test('a bot sings, takes a caída over a plain capture, and hides its high cards', () => {
  const r = dealt({ table: [[2, 'c'], [3, 'b']], hands: [[], [[6, 'e'], [6, 'o'], [12, 'c']], [], []] });
  assert.deepEqual(G.botMove(r, 1), { type: 'canto' });
  G.sing(r, 1);
  const move = G.botMove(r, 1);
  assert.deepEqual(move.card[0], 6); // not the 12, which the next rival could catch

  const c = dealt({ table: [[2, 'c'], [3, 'b'], [10, 'b']], hands: [[], [[2, 'o'], [10, 'e'], [1, 'c']], [], []] });
  c.lastDrop = [10, 'b'];
  assert.deepEqual(G.botMove(c, 1).card, [10, 'e']);
});

test('a match with four bots runs to the end through the game object', () => {
  const m = new Match('bots', { game: 'caida' });
  m.handle('a', { t: 'addBots' }, new Set());
  m.join('a', 'A');
  m.startRound();
  let guard = 0;
  const rng = seeded(7);
  while (m.phase !== 'matchEnd') {
    assert.ok(guard++ < 5000, 'the match ends');
    if (m.phase === 'roundEnd') {
      m.startRound(rng);
      continue;
    }
    const p = m.pendingAuto();
    assert.ok(p.delay >= BOT_DELAY_MS);
    assert.equal(m.runAuto(p.key, rng), true);
  }
  assert.ok(m.scores.some((s) => s >= m.target));
  assert.ok(m.history.length >= 1);
  // Saved and loaded mid-game it's the same game.
  assert.equal(new Match('bots', JSON.parse(JSON.stringify(m))).game, 'caida');
});

// ---- views ---------------------------------------------------------------------

test('nobody sees the deck, other hands, or what a sung canto is worth', () => {
  const m = new Match('v', { game: 'caida' });
  for (const t of ['a', 'b', 'c', 'd']) m.join(t, t);
  m.startRound();
  const dealer = m.round.dealer;
  m.handle(m.seats[dealer].token, { t: 'order', dir: 1 }, new Set());
  const first = (dealer + 1) % 4;
  m.round.hands[first] = [[12, 'o'], [12, 'c'], [3, 'b']];
  m.handle(m.seats[first].token, { t: 'call', what: 'canto' }, new Set());

  const other = m.stateFor(m.seats[(first + 1) % 4].token, new Set());
  assert.equal(other.round.deck, undefined);
  assert.equal(other.round.hands, null);
  assert.deepEqual(other.round.sung, [{ seat: first, kind: 'ronda' }]);
  // The opening table's awards are public, and can be worth the same as this canto.
  assert.equal(other.round.awards.some((a) => a.kind === 'ronda'), false);
  assert.equal(other.seats[first].count, 3);

  const watcher = m.stateFor('nobody', new Set());
  assert.equal(watcher.round.hand, null);
  assert.deepEqual(watcher.round.options, { order: false, play: false, canto: null });
});
