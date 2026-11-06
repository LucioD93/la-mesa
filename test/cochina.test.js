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

const NOW = 1_000_000;
const rest = () => [[1, 'o']]; // a card to keep a seat from running out

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
  assert.deepEqual(G.options(r, 1), { play: true, grab: false });
  assert.deepEqual(G.options(r, 0), { play: false, grab: false });
  assert.throws(() => G.play(r, 0, [1, 'o']), /Not your turn/);
  assert.throws(() => G.play(r, 1, [3, 'o']), /You do not have that card/);
});

// ---- playing ----------------------------------------------------------------------

test('a card with no match stays on the table and the turn moves on', () => {
  const r = dealt({ table: [[4, 'c']], hands: [rest(), [[2, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [2, 'o'], NOW);
  assert.deepEqual(r.table, [[4, 'c'], [2, 'o']]);
  assert.equal(r.grab, null);
  assert.equal(r.turn, 2);
  assert.equal(r.lastAction.open, false);
});

test('a matching card lands on the table and opens a window to grab, nothing is taken yet', () => {
  const r = dealt({ table: [[7, 'c'], [3, 'e']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [7, 'o'], NOW);
  assert.deepEqual(r.table, [[7, 'c'], [3, 'e'], [7, 'o']]);
  assert.deepEqual(r.piles, [[], []]);
  assert.equal(r.turn, 1);
  assert.equal(r.grab.until, NOW + G.GRAB_MS);
  assert.deepEqual(G.options(r, 1), { play: false, grab: true });
  assert.throws(() => G.play(r, 1, [6, 'b'], NOW), /Grab your cards first/);
});

test('each card is grabbed by hand, the played card goes on top, and the window closes when nothing is left', () => {
  const r = dealt({ table: [[7, 'c'], [3, 'e'], [7, 'b']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [7, 'o'], NOW);
  G.grab(r, 1, { card: [7, 'b'] }, NOW + 500);
  assert.deepEqual(r.piles[1], [[7, 'b'], [7, 'o']]);
  assert.deepEqual(r.table, [[7, 'c'], [3, 'e']]);
  assert.ok(r.grab, 'the 7 of cups is still there');
  assert.equal(r.lastAction.first, true);
  G.grab(r, 1, { card: [7, 'c'] }, NOW + 900);
  assert.deepEqual(r.piles[1], [[7, 'b'], [7, 'c'], [7, 'o']]);
  assert.deepEqual(r.table, [[3, 'e']]);
  assert.equal(r.grab, null);
  assert.equal(r.turn, 2);
  assert.equal(r.lastCapture, 1);
  assert.deepEqual(r.lastAction, { n: r.seq, type: 'grab', seat: 1, cards: [[7, 'c']], stolen: 0, first: false, closes: true });
});

test("grabbing the rivals' cochina steals matching top cards one by one", () => {
  const r = dealt({
    table: [[12, 'c']],
    hands: [rest(), [[5, 'o'], [6, 'b']], rest(), rest()],
    piles: [[[1, 'c'], [5, 'e'], [5, 'c']], [[10, 'e']]],
  });
  G.play(r, 1, [5, 'o'], NOW);
  G.grab(r, 1, { pile: true }, NOW + 300);
  assert.deepEqual(r.piles[0], [[1, 'c'], [5, 'e']]);
  assert.deepEqual(r.piles[1], [[10, 'e'], [5, 'c'], [5, 'o']]);
  assert.ok(r.grab, 'the newly exposed 5 can be stolen too');
  G.grab(r, 1, { pile: true }, NOW + 500);
  assert.deepEqual(r.piles[0], [[1, 'c']]);
  assert.deepEqual(r.piles[1], [[10, 'e'], [5, 'c'], [5, 'e'], [5, 'o']]);
  assert.deepEqual(r.steals, [0, 2]);
  assert.deepEqual(r.table, [[12, 'c']]);
  assert.equal(r.grab, null);
  assert.equal(r.lastAction.stolen, 1);
});

test('a steal and a table capture can come from the same card, in any order', () => {
  const r = dealt({ table: [[5, 'b']], hands: [rest(), [[5, 'e'], [1, 'b']], rest(), rest()], piles: [[[9, 'c'], [5, 'o']], []] });
  G.play(r, 1, [5, 'e'], NOW);
  G.grab(r, 1, { pile: true }, NOW + 100);
  assert.ok(r.grab);
  G.grab(r, 1, { card: [5, 'b'] }, NOW + 200);
  assert.deepEqual(r.piles[0], [[9, 'c']]);
  assert.deepEqual(r.piles[1], [[5, 'o'], [5, 'b'], [5, 'e']]);
  assert.equal(r.grab, null);
});

test('only the right things can be grabbed, by the player whose window it is, in time', () => {
  const r = dealt({ table: [[7, 'c'], [3, 'e']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()], piles: [[[2, 'b']], [[3, 'b']]] });
  G.play(r, 1, [7, 'o'], NOW);
  assert.throws(() => G.grab(r, 1, { card: [3, 'e'] }, NOW), /does not match/);
  assert.throws(() => G.grab(r, 1, { card: [7, 'o'] }, NOW), /does not match/); // your own card comes along by itself
  assert.throws(() => G.grab(r, 1, { card: [7, 'e'] }, NOW), /does not match/); // not on the table
  assert.throws(() => G.grab(r, 1, { pile: true }, NOW), /not yours to steal/);
  assert.throws(() => G.grab(r, 2, { card: [7, 'c'] }, NOW), /Nothing to grab/);
  assert.throws(() => G.grab(r, 1, { card: [7, 'c'] }, NOW + G.GRAB_MS + 1), /Too late/);
  assert.deepEqual(r.table, [[7, 'c'], [3, 'e'], [7, 'o']]);
});

test('each grab reaches the next number up: a 1 opens the 2s, a 2 opens the 3s', () => {
  const r = dealt({ table: [[1, 'c'], [2, 'e'], [3, 'b'], [5, 'o']], hands: [rest(), [[1, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [1, 'o'], NOW);
  assert.deepEqual(G.reach(r.grab), [1]);
  assert.throws(() => G.grab(r, 1, { card: [2, 'e'] }, NOW), /does not match/); // grab the 1 first
  G.grab(r, 1, { card: [1, 'c'] }, NOW + 100);
  assert.ok(r.grab, 'the 2 is next');
  assert.deepEqual(G.reach(r.grab), [1, 2]);
  assert.throws(() => G.grab(r, 1, { card: [3, 'b'] }, NOW + 150), /does not match/);
  G.grab(r, 1, { card: [2, 'e'] }, NOW + 200);
  G.grab(r, 1, { card: [3, 'b'] }, NOW + 300);
  assert.deepEqual(r.piles[1], [[1, 'c'], [2, 'e'], [3, 'b'], [1, 'o']]);
  assert.deepEqual(r.table, [[5, 'o']], 'no 4, so the 5 stays');
  assert.equal(r.grab, null);
  assert.equal(r.turn, 2);
});

test('the chain goes on to the rivals cochina, and from a steal to the table, and 7 is followed by 10', () => {
  const r = dealt({
    table: [[10, 'c'], [11, 'e']],
    hands: [rest(), [[6, 'o'], [1, 'b']], rest(), rest()],
    piles: [[[3, 'c'], [7, 'e'], [6, 'c']], []],
  });
  G.play(r, 1, [6, 'o'], NOW);
  G.grab(r, 1, { pile: true }, NOW + 100); // the 6 on top
  assert.deepEqual(G.reach(r.grab), [6, 7]);
  G.grab(r, 1, { pile: true }, NOW + 200); // the 7 under it
  G.grab(r, 1, { card: [10, 'c'] }, NOW + 300);
  G.grab(r, 1, { card: [11, 'e'] }, NOW + 400);
  assert.deepEqual(r.piles[0], [[3, 'c']]);
  assert.deepEqual(r.piles[1], [[6, 'c'], [7, 'e'], [10, 'c'], [11, 'e'], [6, 'o']]);
  assert.deepEqual(r.steals, [0, 2]);
  assert.deepEqual(r.table, []);
  assert.equal(r.grab, null);
});

test('a card with only the next number on the table opens nothing', () => {
  const r = dealt({ table: [[2, 'c']], hands: [rest(), [[1, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [1, 'o'], NOW);
  assert.equal(r.grab, null);
  assert.deepEqual(r.table, [[2, 'c'], [1, 'o']]);
});

test('too slow in a chain: the next numbers left behind count as missed', () => {
  const r = dealt({ table: [[4, 'c'], [5, 'e'], [5, 'b']], hands: [rest(), [[4, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [4, 'o'], NOW);
  G.grab(r, 1, { card: [4, 'c'] }, NOW);
  G.closeGrab(r);
  assert.deepEqual(r.table, [[5, 'e'], [5, 'b']]);
  assert.deepEqual(r.missed, [0, 2]);
});

test('the bot follows the chain in its window', () => {
  const r = dealt({ table: [[3, 'c'], [4, 'e']], hands: [rest(), [[3, 'o'], [1, 'b']], rest(), rest()] });
  G.play(r, 1, [3, 'o'], NOW);
  assert.deepEqual(G.botMove(r, 1), { type: 'grab', card: [3, 'c'] });
  G.grab(r, 1, { card: [3, 'c'] }, NOW);
  assert.deepEqual(G.botMove(r, 1), { type: 'grab', card: [4, 'e'] });
});

test('the bot counts the chain when it picks a card', () => {
  const r = dealt({ table: [[2, 'c'], [3, 'e'], [4, 'b'], [12, 'c'], [12, 'e']], hands: [[], [[2, 'o'], [12, 'o'], [6, 'b']], [], []] });
  assert.deepEqual(G.botMove(r, 1).card, [2, 'o']);
});

test('partners never steal from their own cochina', () => {
  const r = dealt({ table: [], hands: [rest(), [[4, 'o'], [1, 'b']], rest(), rest()], piles: [[], [[4, 'c']]] });
  G.play(r, 1, [4, 'o'], NOW);
  assert.equal(r.grab, null);
  assert.deepEqual(r.table, [[4, 'o']]);
});

test('too slow: what is left stays, and with nothing grabbed the played card stays on the table', () => {
  const r = dealt({ table: [[7, 'c']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()], piles: [[[7, 'e']], []] });
  G.play(r, 1, [7, 'o'], NOW);
  G.closeGrab(r);
  assert.deepEqual(r.table, [[7, 'c'], [7, 'o']]);
  assert.deepEqual(r.piles, [[[7, 'e']], []]);
  assert.deepEqual(r.missed, [0, 2]);
  assert.equal(r.lastAction.missed, 2);
  assert.equal(r.turn, 2);

  const half = dealt({ table: [[7, 'c'], [7, 'b']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()] });
  G.play(half, 1, [7, 'o'], NOW);
  G.grab(half, 1, { card: [7, 'c'] }, NOW);
  G.closeGrab(half);
  assert.deepEqual(half.table, [[7, 'b']]);
  assert.deepEqual(half.piles[1], [[7, 'c'], [7, 'o']]);
});

test('the round survives a save in the middle of a grab', () => {
  let r = dealt({ table: [[7, 'c'], [7, 'b']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()] });
  G.play(r, 1, [7, 'o'], NOW);
  r = JSON.parse(JSON.stringify(r));
  assert.throws(() => G.grab(r, 1, { card: [7, 'o'] }, NOW), /does not match/);
  G.grab(r, 1, { card: [7, 'c'] }, NOW);
  r = JSON.parse(JSON.stringify(r));
  G.grab(r, 1, { card: [7, 'b'] }, NOW);
  assert.deepEqual(r.table, []);
  assert.deepEqual(r.piles[1], [[7, 'c'], [7, 'b'], [7, 'o']]);
});

// ---- dealing again and the end ------------------------------------------------------

/** One move the way the bots make it, grabbing everything. */
function step(r) {
  const move = G.botMove(r, r.turn);
  if (move.type === 'grab') G.grab(r, r.turn, move, NOW);
  else G.play(r, r.turn, move.card, NOW);
}

test('empty hands get a new deal until the deck is out', () => {
  const r = G.newRound({ dealer: 3 });
  while (r.deal === 1) step(r);
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
  G.play(r, 0, [2, 'e'], NOW);
  G.play(r, 1, [4, 'c'], NOW);
  assert.ok(r.over);
  assert.equal(r.leftovers, 3);
  assert.deepEqual(r.piles[1], [[11, 'o'], [2, 'e'], [4, 'c'], [6, 'c']]);
  assert.deepEqual(r.over, { reason: 'cards', team: 1, cards: [2, 4] });
  assert.throws(() => G.play(r, 2, [1, 'o'], NOW), /Round is over/);
});

test('the last card of the round ends it once its window closes', () => {
  const r = dealt({ table: [[3, 'c']], hands: [[[3, 'e']], [], [], []] });
  r.turn = 0;
  G.play(r, 0, [3, 'e'], NOW);
  assert.equal(r.over, null);
  G.grab(r, 0, { card: [3, 'c'] }, NOW);
  assert.deepEqual(r.over, { reason: 'cards', team: 0, cards: [2, 0] });
});

test('every full round ends with all 40 cards in the cochinas, or on the table if nobody took', () => {
  for (let i = 0; i < 100; i++) {
    const r = G.newRound({ dealer: i % 4 });
    while (!r.over) step(r);
    assert.equal(r.deal, G.DEALS);
    assert.equal(r.piles[0].length + r.piles[1].length + r.table.length, 40);
    assert.deepEqual(r.over.cards, [r.piles[0].length, r.piles[1].length]);
  }
});

// ---- bot ----------------------------------------------------------------------------

test('the bot plays the card that steals the biggest cochina, over a table capture', () => {
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

test('in its window the bot grabs the cochina first, then the table', () => {
  const r = dealt({ table: [[5, 'b']], hands: [rest(), [[5, 'e'], [1, 'b']], rest(), rest()], piles: [[[9, 'c'], [5, 'o']], []] });
  G.play(r, 1, [5, 'e'], NOW);
  assert.deepEqual(G.botMove(r, 1), { type: 'grab', pile: true });
  G.grab(r, 1, { pile: true }, NOW);
  assert.deepEqual(G.botMove(r, 1), { type: 'grab', card: [5, 'b'] });
});

test('four bot grabs fit in the window', () => {
  assert.ok(G.BOT_FIRST_GRAB_MS + 3 * G.BOT_GRAB_MS <= G.GRAB_MS);
});

// ---- in a match -----------------------------------------------------------------------

function botMatch() {
  const m = new Match('c', { game: 'cochina' });
  for (let i = 0; i < 4; i++) m.seats[i] = { token: null, name: `Bot ${i}`, bot: true };
  m.startRound();
  return m;
}

/** Seat 1 holds a 7 that matches the 7 on the table. */
function sevenUp(m) {
  Object.assign(m.round, { table: [[7, 'c']], hands: [rest(), [[7, 'o'], [6, 'b']], rest(), rest()], turn: 1 });
}

test('a match of bots plays itself to the target, grabbing at its own pace', () => {
  const m = botMatch();
  assert.equal(m.target, 3);
  let guard = 0;
  let grabs = 0;
  while (m.phase !== 'matchEnd' && guard++ < 20000) {
    if (m.phase === 'roundEnd') m.startRound();
    const p = m.pendingAuto();
    if (m.round.grab) {
      grabs++;
      assert.equal(p.delay, m.round.grab.got ? G.BOT_GRAB_MS : G.BOT_FIRST_GRAB_MS);
    } else assert.ok(p.delay >= BOT_DELAY_MS);
    assert.ok(m.runAuto(p.key));
  }
  assert.equal(m.phase, 'matchEnd');
  assert.ok(grabs > 0);
  assert.ok(m.scores.some((s) => s >= 3));
  const wins = [0, 1].map((team) => m.history.filter((h) => h.team === team).length);
  assert.deepEqual(wins, m.scores);
});

test('a bot sometimes looks away and misses the rest', () => {
  const m = botMatch();
  sevenUp(m);
  G.play(m.round, 1, [7, 'o']);
  m.runAuto(m.pendingAuto().key, () => 0); // rolls under the miss chance
  assert.equal(m.round.grab, null);
  assert.equal(m.round.lastAction.missed, 1);
});

test("a player's window closes by itself when the time is up", () => {
  const m = botMatch();
  m.seats[1] = { token: 'me', name: 'Me', bot: false };
  sevenUp(m);
  m.handle('me', { t: 'play', card: [7, 'o'] }, new Set(['me']));
  const p = m.pendingAuto();
  assert.ok(p.delay > G.GRAB_MS - 200 && p.delay <= G.GRAB_MS);
  assert.ok(m.runAuto(p.key));
  assert.equal(m.round.grab, null);
  assert.equal(m.round.turn, 2);
  assert.deepEqual(m.round.table, [[7, 'c'], [7, 'o']]);
});

test('a grab message from the player in time takes the card', () => {
  const m = botMatch();
  m.seats[1] = { token: 'me', name: 'Me', bot: false };
  sevenUp(m);
  const online = new Set(['me']);
  m.handle('me', { t: 'play', card: [7, 'o'] }, online);
  assert.ok(m.handle('me', { t: 'grab', card: [7, 'c'] }, online));
  assert.deepEqual(m.round.piles[1], [[7, 'c'], [7, 'o']]);
  assert.equal(m.round.turn, 2);
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
  assert.equal(v.grab, null);
  assert.ok(!JSON.stringify(v).includes('"deck"'));
  const watcher = m.stateFor('nobody', new Set()).round;
  assert.equal(watcher.hand, null);
  assert.deepEqual(watcher.options, { play: false, grab: false });
});

test('an open window shows how long is left, not the server clock', () => {
  const m = botMatch();
  sevenUp(m);
  G.play(m.round, 1, [7, 'o']);
  const { grab } = m.stateFor('nobody', new Set()).round;
  assert.deepEqual(Object.keys(grab).sort(), ['card', 'left', 'n', 'nums', 'seat']);
  assert.deepEqual(grab.nums, [7]);
  assert.ok(grab.left > 0 && grab.left <= G.GRAB_MS);
});
