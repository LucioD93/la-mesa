import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/slap.js';
import { DEAL_MS } from '../server/games/common.js';
import { Match } from '../server/match.js';
import { glance, transitions } from '../server/analytics.js';

const NOW = 1_000_000;
const card = (n, suit = 'o') => [n, suit];
/** A pile of cards that never match the first few counts, bottom first. */
const filler = (k) => Array.from({ length: k }, () => card(12, 'b'));

/** A round with the piles set by hand (bottom first: the last card is flipped next). Seat 0 starts. */
function dealt(hands) {
  const r = G.newRound({ starter: 0, now: NOW });
  r.hands = hands.map((h) => h.slice());
  return r;
}

const flip = (r, seat, now = NOW) => G.flip(r, seat, { now, rng: () => 0.5 });

// ---- dealing ----------------------------------------------------------------------

test('the whole deck is dealt face down, ten each, and nobody sees a card, their own included', () => {
  const r = G.newRound({ starter: 2 });
  assert.ok(r.hands.every((h) => h.length === 10));
  assert.equal(new Set(r.hands.flat().map(String)).size, 40);
  assert.equal(r.turn, 2);
  const view = G.game.roundView(r, 2);
  assert.equal(view.hand, null);
  assert.deepEqual(view.piles, [10, 10, 10, 10]);
  assert.ok(!JSON.stringify(view).includes('hands":['), 'no pile goes out');
  assert.deepEqual(view.options, { flip: true, slap: false });
  assert.deepEqual(G.game.roundView(r, 0).options, { flip: false, slap: false });
});

test('the count goes 1 to 7, sota, caballo, rey and round again', () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => G.calledAt(i)), [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 1, 2]);
});

test('a card matches the number called, and with snap on, also the number under it', () => {
  assert.equal(G.isMatch(card(4), 4), true);
  assert.equal(G.isMatch(card(4), 5, card(4, 'c')), G.SNAP);
  assert.equal(G.isMatch(card(4), 5, card(4, 'c'), true), true);
  assert.equal(G.isMatch(card(4), 5, card(6, 'c'), true), false);
  assert.equal(G.SNAP, false, 'off by default');
});

// ---- flipping ---------------------------------------------------------------------

test('cards go round the table onto the stack while the count is called', () => {
  const r = dealt([[...filler(3), card(5)], [...filler(3), card(7)], filler(4), filler(4)]);
  flip(r, 0);
  assert.deepEqual(r.flip, { n: 1, seat: 0, card: card(5), called: 1, match: false, at: NOW });
  assert.equal(r.turn, 1);
  assert.throws(() => flip(r, 0), /Not your turn/);
  flip(r, 1);
  assert.equal(r.flip.called, 2);
  assert.deepEqual(r.stack, [card(5), card(7)]);
  assert.deepEqual(r.hands.map((h) => h.length), [3, 3, 4, 4]);
  assert.equal(r.window, null);
});

test('a second tap, or one that crossed another move, flips nothing', () => {
  const r = dealt([filler(4), filler(4), filler(4), filler(4)]);
  const seen = r.seq;
  G.flip(r, 0, { now: NOW, after: seen });
  assert.throws(() => G.flip(r, 1, { now: NOW, after: seen }), /Too late/);
  assert.equal(r.flips, 1);
});

// ---- slapping a match -------------------------------------------------------------

/** Seat 0 flips a 1 as the count calls 1: a match. */
function matched() {
  const r = dealt([[...filler(3), card(1)], [...filler(3), card(2, 'c')], filler(4), filler(4)]);
  r.stack = [card(6, 'e'), card(7, 'e')]; // already there from before
  flip(r, 0);
  return r;
}

test('a match opens a window to slap, and nobody flips until it closes', () => {
  const r = matched();
  assert.equal(r.flip.match, true);
  assert.deepEqual(r.window, { n: 1, opened: NOW, until: NOW + G.SLAP_MS, slaps: [] });
  assert.throws(() => flip(r, 1), /Slap first/);
  assert.equal(G.game.roundView(r, 1).turn, null);
  assert.deepEqual(G.options(r, 3), { flip: false, slap: true });
});

test('the slaps count in the order they arrive, and the last hand down takes the stack', () => {
  const r = matched();
  G.slap(r, 2, 1, NOW + 400);
  G.slap(r, 0, 1, NOW + 500);
  assert.deepEqual(r.window.slaps, [2, 0]);
  assert.equal(r.lastAction.place, 2);
  assert.throws(() => G.slap(r, 2, 1, NOW + 600), /already slapped/);
  assert.deepEqual(G.options(r, 2).slap, false);
  // The third hand down shuts the window: the fourth is last whatever it does.
  G.slap(r, 3, 1, NOW + 700);
  assert.equal(r.window, null);
  assert.deepEqual(r.lastAction, { n: r.seq, type: 'take', seat: 1, why: 'last', cards: 3, slaps: [2, 0, 3], back: false });
  // Turned over and slipped under the pile: the top of the stack is now the bottom card.
  assert.deepEqual(r.hands[1].slice(0, 3), [card(1), card(7, 'e'), card(6, 'e')]);
  assert.equal(r.hands[1].length, 7);
  assert.deepEqual(r.stack, []);
  assert.equal(r.taken[1], 1);
  // The player after them starts the count again.
  assert.equal(r.turn, 2);
  assert.equal(r.count, 0);
  flip(r, 2);
  assert.equal(r.flip.called, 1);
});

test('when the window runs out, whoever never slapped is last, the first in turn from the flipper', () => {
  const r = matched();
  G.slap(r, 3, 1, NOW + 300);
  assert.throws(() => G.slap(r, 1, 1, NOW + G.SLAP_MS + 1), /Too late/);
  G.closeWindow(r, NOW + G.SLAP_MS);
  assert.equal(r.lastAction.seat, 0, 'seat 0 flipped and sits first');
  assert.equal(r.hands[0].length, 3 + 3);
  assert.equal(r.turn, 1);
});

test('a slap meant for a card that is gone is ignored, never taken for a wrong one', () => {
  const r = matched();
  for (const s of [1, 2, 3]) G.slap(r, s, 1, NOW);
  assert.throws(() => G.slap(r, 2, 1, NOW), /Too late/, 'the stack was already taken');
  flip(r, 1);
  assert.throws(() => G.slap(r, 3, 1, NOW), /Too late/, 'a slap for the card before');
  assert.equal(r.falseSlaps[3], 0);
});

// ---- false slaps --------------------------------------------------------------------

test('slapping a card that does not match takes the stack, and the count starts after you', () => {
  const r = dealt([[...filler(3), card(5)], [...filler(3), card(7)], filler(4), filler(4)]);
  flip(r, 0);
  flip(r, 1);
  G.slap(r, 3, r.flip.n, NOW + 200);
  assert.deepEqual(r.lastAction, { n: r.seq, type: 'take', seat: 3, why: 'false', cards: 2, slaps: [], back: false });
  assert.deepEqual(r.hands[3].slice(0, 2), [card(7), card(5)]);
  assert.equal(r.falseSlaps[3], 1);
  assert.equal(r.turn, 0);
  assert.equal(r.count, 0);
});

// ---- running out ------------------------------------------------------------------------

test('out of cards, you are skipped, and living through the next slap wins the round', () => {
  // Seat 0 flips its last card; the 2 that seat 1 flips next is the number called.
  const r = dealt([[card(6)], [...filler(2), card(2)], filler(3), filler(3)]);
  flip(r, 0);
  assert.deepEqual(r.out, [0]);
  assert.equal(r.lastAction.out, true);
  assert.equal(r.over, null, 'not won yet');
  flip(r, 1);
  assert.equal(r.flip.match, true);
  G.slap(r, 0, 2, NOW);
  G.slap(r, 2, 2, NOW);
  G.slap(r, 1, 2, NOW);
  assert.equal(r.lastAction.seat, 3);
  assert.deepEqual(r.over, { reason: 'out', seat: 0 });
});

test('out of cards and last to slap, you pick up the stack and you are back in', () => {
  const r = dealt([[card(6)], [...filler(2), card(2)], filler(3), filler(3)]);
  flip(r, 0);
  flip(r, 1);
  for (const s of [1, 2, 3]) G.slap(r, s, 2, NOW);
  assert.equal(r.over, null);
  assert.deepEqual(r.out, []);
  assert.equal(r.lastAction.back, true);
  assert.deepEqual(r.hands[0], [card(2), card(6)]);
  assert.equal(r.turn, 1, 'the count starts again after them');
});

test('out of cards, a false slap brings you back in too', () => {
  const r = dealt([[card(6)], [...filler(2), card(5)], filler(3), filler(3)]);
  flip(r, 0);
  flip(r, 1);
  G.slap(r, 0, r.flip.n, NOW);
  assert.deepEqual(r.out, []);
  assert.equal(r.hands[0].length, 2);
  assert.equal(r.turn, 1);
});

test('a player out who does not slap stays out, and two out at once go in the order they ran out', () => {
  const r = dealt([[card(6)], [card(6, 'c')], [...filler(1), card(3)], filler(3)]);
  flip(r, 0);
  flip(r, 1);
  assert.deepEqual(r.out, [0, 1]);
  flip(r, 2); // a 3 as the count calls 3
  G.slap(r, 1, 3, NOW);
  G.slap(r, 0, 3, NOW + 10);
  G.slap(r, 2, 3, NOW + 20);
  assert.deepEqual(r.over, { reason: 'out', seat: 0 }, 'seat 0 ran out first');
});

test('every card on the stack and none of them a match: whoever ran out first wins', () => {
  const r = dealt([[card(12)], [card(12, 'c')], [card(12, 'e')], [card(12, 'b')]]);
  for (const s of [0, 1, 2, 3]) flip(r, s);
  assert.deepEqual(r.over, { reason: 'allOut', seat: 0 });
});

// ---- bots and the clock ---------------------------------------------------------------

/** A match with a human in seat 0 and bots in the rest, a round dealt by hand. */
function table(hands) {
  const m = new Match('slap', { game: 'slap' });
  m.join('a', 'A');
  m.handle('a', { t: 'addBots' }, new Set(['a']));
  m.startRound();
  m.round = dealt(hands);
  return m;
}

test('the bots slap each at its own pace after the card shows, and the human who never does is last', () => {
  const m = table([[...filler(3), card(1)], filler(4), filler(4), filler(4)]);
  const now = Date.now();
  G.flip(m.round, 0, { now, rng: () => 0.5 });
  m.round.react = [100, 300, 200, 50]; // seat 0 is human: its time means nothing
  const due = [];
  for (let i = 0; i < 3; i++) {
    const p = m.pendingAuto();
    assert.match(p.key, /:slap:\d$/);
    const ms = m.round.react[Number(p.key.at(-1))];
    due.push(ms);
    // Once the card shows on the phones, and the slap would be back.
    const at = now + G.FLIP_MS + G.NET_MS + ms;
    assert.ok(p.delay <= at - now && p.delay >= at - Date.now() - 1);
    assert.equal(m.runAuto(p.key), true);
  }
  assert.deepEqual(due, [50, 200, 300], 'the quickest first');
  assert.deepEqual(m.round.lastAction.slaps, [3, 2, 1]);
  assert.equal(m.round.lastAction.seat, 0);
});

test('the window closes on time while a player still has not slapped', () => {
  const m = table([[...filler(3), card(1)], filler(4), filler(4), filler(4)]);
  G.flip(m.round, 0, { now: Date.now() - G.SLAP_MS - 10, rng: () => 0.5 });
  m.round.react = [null, null, null, null];
  const p = m.pendingAuto();
  assert.match(p.key, /:close:/);
  assert.equal(p.delay, 0);
  m.runAuto(p.key);
  assert.equal(m.round.lastAction.type, 'take');
  assert.equal(m.round.lastAction.seat, 0);
});

test('a bot flips after a beat, waits for the deal first, and a bot fooled by a card slaps it', () => {
  const m = table([filler(4), filler(4), filler(4), filler(4)]);
  m.round.turn = 1;
  m.round.at = Date.now();
  const first = m.pendingAuto();
  assert.match(first.key, /:flip:1$/);
  assert.ok(first.delay > G.BOT_FLIP_MS + DEAL_MS - 50);
  m.round.flips = 3; // not the first card: no deal to wait for
  assert.ok(m.pendingAuto().delay <= G.BOT_FLIP_MS);
  m.runAuto(m.pendingAuto().key, () => 0.5);
  assert.equal(m.round.lastAction.type, 'flip');
  assert.equal(m.round.flip.match, false);
  m.round.react = [null, null, 10, null];
  m.round.turn = 0; // the human's turn: only the fooled bot is due
  const fooled = m.pendingAuto();
  assert.match(fooled.key, /:slap:2$/);
  m.runAuto(fooled.key);
  assert.equal(m.round.lastAction.why, 'false');
  assert.equal(m.round.lastAction.seat, 2);
});

test('the table waits on a human to flip, and mocks them sooner than in the other games', () => {
  const m = table([filler(4), filler(4), filler(4), filler(4)]);
  assert.equal(m.pendingAuto(), null);
  assert.equal(m.waitingOn().seat, 0);
  assert.ok(G.game.slowTurnMs < 60_000);
});

test('no bot reaction time ever reaches a player', () => {
  const m = table([[...filler(3), card(1)], filler(4), filler(4), filler(4)]);
  m.handle('a', { t: 'flip', n: m.round.seq }, new Set(['a']));
  assert.ok(m.round.react.every((ms) => ms > 0));
  const seen = JSON.stringify(m.stateFor('a', new Set(['a'])));
  assert.ok(!seen.includes('"react"'));
  assert.ok(!seen.includes('until'));
});

// ---- the match ------------------------------------------------------------------------

test('every player for themselves: a score per seat, the round winner scores 1, first to the target wins', () => {
  const m = new Match('solo', { game: 'domino' });
  m.join('a', 'A');
  m.handle('a', { t: 'game', game: 'slap' }, new Set(['a']));
  assert.deepEqual(m.scores, [0, 0, 0, 0]);
  assert.equal(m.stateFor('a', new Set()).solo, true);
  assert.equal(m.handle('a', { t: 'teamName', name: 'Los Panas' }, new Set()), false, 'no teams to name');
  m.handle('a', { t: 'addBots' }, new Set(['a']));
  m.handle('a', { t: 'target', target: 1 }, new Set(['a']));
  m.handle('a', { t: 'start' }, new Set(['a']));
  m.round = dealt([[card(12)], [card(12, 'c')], [card(12, 'e')], [card(12, 'b')]]);
  m.round.turn = 0;
  m.handle('a', { t: 'flip', n: m.round.seq }, new Set(['a']));
  m.round.react = [null, null, null, null]; // no bot fooled into slapping
  for (let i = 0; i < 3; i++) m.runAuto(m.pendingAuto().key, () => 0.5);
  assert.equal(m.phase, 'matchEnd');
  assert.deepEqual(m.scores, [1, 0, 0, 0]);
  assert.deepEqual(m.history.at(-1).seat, 0);
  m.handle('a', { t: 'lobby' }, new Set(['a']));
  assert.deepEqual(m.scores, [0, 0, 0, 0]);
  m.handle('a', { t: 'game', game: 'truco' }, new Set(['a']));
  assert.deepEqual(m.scores, [0, 0], 'back to two teams');
});

test('analytics names the winning seat, not a team, in a game without teams', () => {
  const m = new Match('solo', { game: 'slap' });
  m.join('a', 'A');
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  const before = glance(m);
  m.scores = [0, 1, 3, 2];
  m.phase = 'matchEnd';
  const done = transitions(before, glance(m)).find(([name]) => name === 'match_finished');
  assert.equal(done[1].winner_seat, 2);
  assert.equal('winner_team' in done[1], false);
});

test('a slap game runs through the match with bots on every seat but one, to the end of a round', () => {
  const m = new Match('slap', { game: 'slap' });
  m.join('a', 'A');
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  for (let i = 0; i < 5000 && m.phase === 'playing'; i++) {
    const r = m.round;
    if (r.window && !r.window.slaps.includes(0) && i % 3 === 0) m.handle('a', { t: 'slap', n: r.flip.n }, new Set());
    else if (G.options(r, 0).flip) m.handle('a', { t: 'flip', n: r.seq }, new Set());
    else m.runAuto(m.pendingAuto().key);
    assert.equal(r.hands.flat().length + r.stack.length, 40, 'no card is lost');
  }
  assert.equal(m.phase, 'roundEnd');
  assert.equal(m.scores.reduce((a, b) => a + b), 1);
});
