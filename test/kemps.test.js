import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../server/games/kemps.js';
import { MoveError } from '../server/games/common.js';
import { Match } from '../server/match.js';

// Cards by name: rank then suit, `7H` is the 7 of hearts, `AS` the ace of spades.
const RANK = { A: 1, J: 11, Q: 12, K: 13 };
const C = (name) => [RANK[name.slice(0, -1)] ?? Number(name.slice(0, -1)), name.at(-1)];
const cards = (s) => s.split(' ').map(C);

const T0 = 1_000_000;

/** A round at time T0 with the hands, middle and anything else set by hand. */
function round({ hands, middle, ...rest } = {}) {
  const r = K.newRound({ dealer: 0, rng: seeded(1), now: T0 });
  r.at = T0;
  if (hands) r.hands = hands.map(cards);
  if (middle) r.middle = cards(middle);
  r.four = r.hands.map((h) => (K.isFour(h) ? { n: 0, at: T0 } : null));
  Object.assign(r, rest);
  return r;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const allBots = () => true;
const noBots = () => false;
const only = (...seats) => (s) => seats.includes(s);

// ---- the deal ----------------------------------------------------------------------

test('a deal gives 4 cards each and 4 to the middle, from one whole deck', () => {
  const r = K.newRound({ rng: seeded(3) });
  assert.ok(r.hands.every((h) => h.length === 4));
  assert.equal(r.middle.length, 4);
  assert.equal(r.deck.length, 32);
  const all = [...r.hands.flat(), ...r.middle, ...r.deck].map(String);
  assert.equal(new Set(all).size, 52);
  assert.equal(r.turn, null, 'nobody has the turn: everyone plays at once');
  assert.ok(r.signals.every((s) => K.SIGNS.includes(s)));
});

// ---- swapping -----------------------------------------------------------------------

test('a swap trades a hand card for a middle card, in the same places, for everyone to see', () => {
  const r = round({ hands: ['7H 7S 2C 9D', '3C 4C 5C 6C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS 7C QD 8H' });
  r.passed = [false, true, true, true];
  K.swap(r, 0, C('7C'), C('2C'), T0 + 500);
  assert.deepEqual(r.hands[0], cards('7H 7S 7C 9D'));
  assert.deepEqual(r.middle, cards('KS 2C QD 8H'));
  assert.deepEqual(r.known[0], [C('7C')]);
  assert.deepEqual(r.passed, [false, false, false, false], 'something new in the middle: everyone looks again');
  assert.equal(r.at, T0 + 500);
  assert.deepEqual(r.lastAction, { n: r.seq, type: 'swap', seat: 0, take: C('7C'), give: C('2C'), slot: 1 });
  // Giving back a card you took takes it off what everyone knows you hold.
  K.swap(r, 0, C('2C'), C('7C'));
  assert.deepEqual(r.known[0], [C('2C')]);
});

test('a card someone else took first, or one you do not hold, is refused', () => {
  const r = round({ hands: ['7H 7S 2C 9D', '3C 4C 5C 6C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS 7C QD 8H' });
  K.swap(r, 1, C('7C'), C('3C'));
  assert.throws(() => K.swap(r, 0, C('7C'), C('2C')), /That card is gone/);
  assert.throws(() => K.swap(r, 0, C('KS'), C('5C')), /You do not have that card/);
  assert.throws(() => K.swap(r, 0, C('KS'), C('5C')), MoveError);
});

test('getting four of a kind is noted, and lost again when one goes back', () => {
  const r = round({ hands: ['7H 7S 7D 9D', '3C 4C 5C 6C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS 7C QD 8H' });
  K.swap(r, 0, C('7C'), C('9D'), T0 + 100);
  assert.deepEqual(r.four[0], { n: r.seq, at: T0 + 100 });
  K.swap(r, 0, C('KS'), C('7H'));
  assert.equal(r.four[0], null);
});

// ---- the middle ----------------------------------------------------------------------

test('once everyone passes the middle is replaced, and otherwise after a while', () => {
  const r = round();
  const [first] = K.plan(r, noBots);
  assert.deepEqual([first.kind, first.at], ['refresh', T0 + K.IDLE_MS]);
  for (const s of [0, 1, 2]) K.pass(r, s, T0 + 1000 + s);
  assert.equal(K.plan(r, noBots)[0].at, T0 + K.IDLE_MS, 'one player still looking');
  K.pass(r, 3, T0 + 2000);
  assert.deepEqual(K.plan(r, noBots)[0], { at: T0 + 2000 + K.SETTLED_MS, kind: 'refresh', seat: -1 });
  const old = r.middle.slice();
  K.refresh(r, seeded(2), T0 + 3000);
  assert.equal(r.deck.length, 28);
  assert.deepEqual(r.discards, old);
  assert.equal(r.deals, 2);
  assert.deepEqual(r.passed, [false, false, false, false]);
});

test('an empty deck takes the discards back twice, and then the hand is dead', () => {
  const r = round();
  for (let i = 0; i < 8; i++) K.refresh(r);
  assert.equal(r.deck.length, 0);
  K.refresh(r);
  assert.equal(r.reshuffles, 1);
  assert.equal(r.lastAction.reshuffled, true);
  assert.equal(r.deck.length + r.middle.length + r.discards.length, 36);
  while (!r.over) K.refresh(r);
  assert.equal(r.reshuffles, K.MAX_RESHUFFLES);
  assert.deepEqual(r.over, { reason: 'deck', team: null });
});

// ---- gestures and calls ----------------------------------------------------------------

test('a gesture shows for the whole table; a player cannot flood it', () => {
  const r = round();
  K.gesture(r, 1, 'wink', T0, { cooldown: true });
  assert.deepEqual(r.gesture, { n: r.seq, seat: 1, sign: 'wink' });
  assert.throws(() => K.gesture(r, 1, 'nose', T0 + 100, { cooldown: true }), /Too fast/);
  K.gesture(r, 1, 'nose', T0 + K.GESTURE_COOLDOWN_MS, { cooldown: true });
  assert.throws(() => K.gesture(r, 1, 'dance'), /Unknown gesture/);
});

test('Kemps wins the hand when your partner holds four of a kind, and loses it when not', () => {
  const hands = ['2C 3C 4C 5C', '9H 9S 9D 9C', 'QH QS QD QC', '3D 4D 5D 6D'];
  assert.deepEqual(K.kemps(round({ hands }), 0).over, { reason: 'kemps', seat: 0, target: 2, right: true, team: 0, shown: null });
  assert.equal(K.kemps(round({ hands }), 3).over.team, 1, 'seat 3 called it on seat 1');
  assert.deepEqual(K.kemps(round({ hands }), 2).over, { reason: 'kemps', seat: 2, target: 0, right: false, team: 1, shown: null });
});

test('Stop Kemps wins the hand when that rival holds four of a kind, and gives it away when not', () => {
  const hands = ['2C 3C 4C 5C', '9H 9S 9D 9C', 'QH QS QD QC', '3D 4D 5D 6D'];
  assert.deepEqual(K.corta(round({ hands }), 0, 1).over, { reason: 'corta', seat: 0, target: 1, right: true, team: 0, shown: null });
  assert.deepEqual(K.corta(round({ hands }), 1, 0).over, { reason: 'corta', seat: 1, target: 0, right: false, team: 0, shown: null });
  assert.throws(() => K.corta(round({ hands }), 0, 2), /Pick a rival/);
  assert.throws(() => K.corta(round({ hands }), 0, 7), /Pick a rival/);
});

test('the gesture a player made after getting four is what gave them away', () => {
  const r = round({ hands: ['2C 3C 4C 5C', '9H 9S 9D 8C', 'QH QS QD QC', '3D 4D 5D 6D'], middle: '9C KS KD KH' });
  K.gesture(r, 1, 'ear', T0); // before: means nothing
  K.swap(r, 1, C('9C'), C('8C'), T0 + 100);
  K.gesture(r, 1, 'brow', T0 + 900);
  assert.equal(K.corta(structuredClone(r), 0, 1).over.shown, 'brow');
  assert.equal(K.kemps(r, 3).over.shown, 'brow');
});

// ---- bots ------------------------------------------------------------------------------

test('a bot goes for the number it holds most of', () => {
  assert.deepEqual(K.bestSwap(cards('7H 7S 2C 9D'), cards('KS 7C QD 8H')), { take: C('7C'), give: C('2C') });
  assert.deepEqual(K.bestSwap(cards('7H 3S 2C 9D'), cards('KS 7C QD 8H')), { take: C('7C'), give: C('3S') });
  assert.equal(K.bestSwap(cards('7H 7S 2C 9D'), cards('KS JC QD 8H')), null, 'nothing helps');
  assert.equal(K.bestSwap(cards('7H 7S 7C 7D'), cards('KS JC QD 8H')), null, 'already there');
});

test('a bot with four of a kind makes its team signal, and its partner calls Kemps', () => {
  const r = round({ hands: ['9H 9S 9D 9C', '2C 3C 4C 5C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS JC QD 8H' });
  r.signals = ['nose', 'ear'];
  const signal = K.plan(r, allBots).find((e) => e.seat === 0);
  assert.equal(signal.kind, 'gesture');
  assert.equal(signal.sign, 'nose');
  K.runEvent(r, signal, Math.random, signal.at);
  const call = K.plan(r, allBots).find((e) => e.kind === 'kemps');
  assert.equal(call.seat, 2);
  assert.ok(call.at - signal.at >= K.BOT_KEMPS_MS[0] && call.at - signal.at <= K.BOT_KEMPS_MS[1]);
  K.runEvent(r, call);
  assert.equal(r.over.right, true);
});

test("a bot partner calls on a person's signal, not on a bluff", () => {
  const r = round({ hands: ['9H 9S 9D 9C', '2C 3C 4C 5C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS JC QD 8H' });
  r.signals = ['nose', 'ear'];
  K.gesture(r, 0, 'wink', T0);
  assert.ok(!K.plan(r, only(2)).some((e) => e.kind === 'kemps'));
  K.gesture(r, 0, 'nose', T0 + 1000);
  assert.ok(K.plan(r, only(2)).some((e) => e.kind === 'kemps' && e.seat === 2));
});

test("a bot keeps signaling a person who hasn't called yet", () => {
  const r = round({ hands: ['2C 3C 4C 5C', '9H 9S 9D 9C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS JC QD 8H' });
  r.signals = ['nose', 'ear'];
  K.gesture(r, 1, 'ear', T0 + 1000);
  const again = K.plan(r, only(1)).find((e) => e.kind === 'gesture');
  assert.deepEqual([again.at, again.sign], [T0 + 1000 + K.BOT_RESIGNAL_MS, 'ear']);
});

test("bots don't know the other team's signal until it gives itself away", () => {
  const r = round({ hands: ['2C 3C 4C 5C', '9H 9S 9D 9C', '3D 4D 5D 6D', '3H 4H 5H 6H'], middle: 'KS JC QD 8H' });
  r.signals = ['nose', 'ear'];
  K.gesture(r, 1, 'ear', T0);
  assert.ok(!K.plan(r, only(0, 2)).some((e) => e.kind === 'corta'), 'nothing learned yet');
  // Every bot trusts what it learned some of the time; over many signals most get cut.
  let cut = 0;
  for (let salt = 0; salt < 200; salt++) {
    const caught = { ...structuredClone(r), learned: [null, 'ear'], salt };
    if (K.plan(caught, only(0, 2)).some((e) => e.kind === 'corta' && e.target === 1)) cut++;
  }
  assert.ok(cut > 120 && cut < 200, `${cut} of 200`);
});

test('a rival who visibly took all four of a number gets cut', () => {
  const r = round({ hands: ['2C 3C 4C 5C', '2D 3D 4D 5D', '3H 4H 5H 6H', 'KS 6D 7D 8D'], middle: '9H 9S 9D 9C' });
  for (const [take, give] of [['9H', '2D'], ['9S', '3D'], ['9D', '4D'], ['9C', '5D']]) K.swap(r, 1, C(take), C(give));
  assert.ok(K.plan(r, only(0)).some((e) => e.kind === 'corta' && e.target === 1));
  assert.ok(K.plan(r, only(3)).some((e) => e.kind === 'kemps'), 'and the partner calls it too');
});

test('a team of bots changes a signal that was caught; a team with a person keeps it', () => {
  const m = new Match('k', { game: 'kemps' });
  m.join('p', 'P');
  m.handle('p', { t: 'addBots' }, new Set(['p']));
  m.handle('p', { t: 'start' }, new Set(['p']));
  const signals = m.round.signals.slice();
  m.round.hands[1] = cards('9H 9S 9D 9C');
  m.round.four[1] = { n: 0, at: T0 };
  K.gesture(m.round, 1, signals[1], T0);
  K.kemps(m.round, 3);
  m.afterMove();
  assert.equal(m.round.over.shown, signals[1]);
  m.handle('p', { t: 'next' }, new Set(['p']));
  assert.equal(m.round.learned[1], signals[1]);
  assert.notEqual(m.round.signals[1], signals[1], 'the bots on team 1 pick another');
  assert.equal(m.round.signals[0], signals[0]);
  assert.equal(m.stateFor('p', new Set(['p'])).round.exposed, false);
  m.round.learned[0] = m.round.signals[0];
  assert.equal(m.stateFor('p', new Set(['p'])).round.exposed, true, "they caught ours: the page says so");
});

// ---- through a match ----------------------------------------------------------------------

function botMatch() {
  const m = new Match('km', { game: 'kemps' });
  m.join('p', 'P');
  m.handle('p', { t: 'addBots' }, new Set(['p']));
  m.handle('p', { t: 'start' }, new Set(['p']));
  return m;
}

test('a player only sees their own hand and their own team signal', () => {
  const m = botMatch();
  const mine = m.stateFor('p', new Set(['p'])).round;
  assert.deepEqual(mine.hand, m.round.hands[0]);
  assert.equal(mine.signal, m.round.signals[0]);
  assert.equal(mine.hands, null);
  assert.ok(!JSON.stringify(mine).includes('"signals"'));
  const watcher = m.stateFor('w', new Set(['p', 'w'])).round;
  assert.equal(watcher.hand, null);
  assert.equal(watcher.signal, null);
  assert.deepEqual(watcher.options, { swap: false, pass: false, kemps: false, corta: [] });
});

test('messages from the table: swap, pass, gesture, signal, the calls', () => {
  const m = botMatch();
  const on = new Set(['p']);
  const [take] = m.round.middle;
  const [give] = m.round.hands[0];
  assert.equal(m.handle('p', { t: 'swap', take, give }, on), true);
  assert.equal(m.handle('p', { t: 'pass' }, on), true);
  assert.equal(m.handle('p', { t: 'pass' }, on), false, 'a second pass changes nothing');
  assert.equal(m.handle('p', { t: 'gesture', sign: 'wink' }, on), true);
  const other = K.SIGNS.find((s) => s !== m.round.signals[0]);
  assert.equal(m.handle('p', { t: 'signal', sign: other }, on), true);
  assert.equal(m.round.signals[0], other);
  m.round.hands[1] = cards('9H 9S 9D 9C');
  assert.equal(m.handle('p', { t: 'corta', seat: 1 }, on), true);
  assert.equal(m.phase, 'roundEnd');
  assert.deepEqual(m.scores, [1, 0]);
  assert.deepEqual(m.history.at(-1), { round: 1, team: 0, reason: 'corta', seat: 0, target: 1, right: true });
  assert.ok(m.stateFor('p', on).round.hands, 'every hand shows once it is over');
});

test('bots play whole matches by themselves, and a match survives the trip through JSON', () => {
  const m = botMatch();
  m.seats[0] = { ...m.seats[1], name: 'Bot 0' };
  for (let i = 0; i < 20000 && m.phase !== 'matchEnd'; i++) {
    if (m.phase === 'roundEnd') m.startRound();
    const p = m.pendingAuto();
    assert.ok(p, 'the table always has something coming');
    assert.ok(m.runAuto(p.key));
    if (i % 50 === 0) assert.deepEqual(new Match(m.id, JSON.parse(JSON.stringify(m))).toJSON(), m.toJSON());
  }
  assert.equal(m.phase, 'matchEnd');
  assert.equal(Math.max(...m.scores), 5);
});
