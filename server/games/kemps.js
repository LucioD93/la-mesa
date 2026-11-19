// Pure round logic for Kemps (kimi in Spanish), 2 vs 2 with a French deck. There are no
// turns: everyone holds 4 cards and swaps with the 4 face up in the middle at the same
// time, one card at a time, after four of a kind. Holding it isn't enough: your partner
// has to see your secret signal and call Kemps for you. The other team can call Stop
// Kemps (corta) on a player they think holds it. When nobody wants the middle, four new
// cards replace it.
//
// The table moves on its own clock: bots swap, signal and call at their own pace, and the
// middle is replaced once everyone has passed or nobody has swapped for a while. Every one
// of those is planned from the round alone (`plan`), so the same round always gives the
// same next move and the room only has to wait for it.

import { DEAL_MS, MoveError, SEATS, nextSeat, shuffle, teamOf } from './common.js';
import { fullDeck, sameCard } from './rummy.js';

export const HAND_SIZE = 4;
export const MIDDLE = 4;
// The gestures a player can make at the table. Each team's signal is one of them, known
// only to its two players; the rest are for bluffing.
export const SIGNS = ['wink', 'nose', 'ear', 'tongue', 'brow', 'shrug'];

export const IDLE_MS = 12_000; // nobody swapped for this long: the middle is replaced anyway
export const SETTLED_MS = 900; // everyone passed: the middle is replaced this long after the last pass
export const SHOW_MS = 700; // new cards in the middle land before anyone's bot reaches for them
export const MAX_RESHUFFLES = 2; // the discards go back in the deck this often, then the round is dead
export const GESTURE_COOLDOWN_MS = 700; // a player's gestures, so nobody floods the table

// How bots behave. Times are from the moment that prompts them, picked at random in the range.
export const BOT_SWAP_MS = [1100, 2600];
export const BOT_SIGNAL_MS = [600, 1500]; // after getting four of a kind
export const BOT_RESIGNAL_MS = 4500; // a human partner hasn't called yet: signal again
export const BOT_KEMPS_MS = [800, 1700]; // after seeing the partner's signal
export const BOT_CORTA_MS = [1300, 2500]; // after seeing a rival make the signal it learned
export const BOT_CORTA_CHANCE = 0.65; // a bot doesn't always trust what it learned
export const BOT_DECOY_CHANCE = 0.12; // after each move, a bot may make a gesture that means nothing
export const BOT_DECOY_MS = [1500, 6000];
export const BOT_PUBLIC_MS = 700; // someone visibly took all four of a number from the middle

const partnerOf = (seat) => (seat + 2) % SEATS;
export const isFour = (hand) => hand.length === HAND_SIZE && hand.every((c) => c[0] === hand[0][0]);

/** A number in [0, 1) that only depends on its parts: bots' choices repeat with the round. */
function noise(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
const within = ([lo, hi], x) => Math.round(lo + (hi - lo) * x);

// ---- dealing ------------------------------------------------------------------

/**
 * `signals` and `learned` carry over from the last round: each team's signal, and the
 * gesture each team was seen making before its last call went right.
 */
export function newRound({ dealer = 0, rng = Math.random, signals = null, learned = [null, null], now = Date.now() } = {}) {
  const deck = shuffle(fullDeck(), rng);
  const hands = [[], [], [], []];
  for (let s = 0; s < SEATS; s++) hands[s] = deck.splice(-HAND_SIZE);
  const at = now + DEAL_MS;
  return {
    dealer,
    turn: null, // nobody's turn: everyone plays at once
    deck,
    middle: deck.splice(-MIDDLE),
    discards: [],
    hands,
    signals: signals ?? [0, 1].map(() => SIGNS[Math.floor(rng() * SIGNS.length)]),
    learned,
    salt: Math.floor(rng() * 1e9), // varies the bots' timing from round to round
    at, // the middle's latest change (or the deal, once it's on the table)
    moves: 0, // swaps and new middles: the bots plan their next swap from this
    deals: 1, // middles laid out so far
    reshuffles: 0,
    passed: [false, false, false, false],
    passAt: null,
    known: [[], [], [], []], // cards each seat visibly took from the middle and still holds
    four: hands.map((h) => (isFour(h) ? { n: 0, at } : null)), // { n, at }: when each seat got four of a kind, while it holds it
    gestures: [null, null, null, null], // each seat's latest gesture: { n, sign, at, moves }
    gesture: null, // the latest one at the table, for the client: { n, seat, sign }
    seq: 0, // bumps on every change, identifies the moment for automatic moves
    lastAction: null, // the latest swap or new middle
    over: null,
  };
}

export function options(round, seat) {
  const live = !round.over && seat !== -1;
  return {
    swap: live,
    pass: live && !round.passed[seat],
    kemps: live,
    corta: live ? [(seat + 1) % SEATS, (seat + 3) % SEATS] : [],
  };
}

// ---- moves --------------------------------------------------------------------

function live(round) {
  if (round.over) throw new MoveError('Round is over');
}

/** Take `take` from the middle and leave `give` from your hand in its place. */
export function swap(round, seat, take, give, now = Date.now()) {
  live(round);
  const slot = round.middle.findIndex((c) => sameCard(c, take));
  if (slot === -1) throw new MoveError('That card is gone');
  const hand = round.hands[seat];
  const i = hand.findIndex((c) => sameCard(c, give));
  if (i === -1) throw new MoveError('You do not have that card');
  const [taken, given] = [round.middle[slot], hand[i]];
  round.middle[slot] = given;
  hand[i] = taken;
  const known = round.known[seat].filter((c) => !sameCard(c, given));
  round.known[seat] = [...known, taken];
  round.four[seat] = isFour(hand) ? round.four[seat] ?? { n: round.seq + 1, at: now } : null;
  round.passed = [false, false, false, false]; // there's something new in the middle
  round.passAt = null;
  round.at = now;
  round.moves += 1;
  round.seq += 1;
  round.lastAction = { n: round.seq, type: 'swap', seat, take: taken, give: given, slot };
  return round;
}

/** Nothing in the middle for you. Once everyone has passed, it's replaced. */
export function pass(round, seat, now = Date.now()) {
  live(round);
  if (round.passed[seat]) throw new MoveError('You already passed');
  round.passed[seat] = true;
  round.passAt = now;
  round.seq += 1;
  return round;
}

/** The middle goes to the discards and four new cards take its place. */
export function refresh(round, rng = Math.random, now = Date.now()) {
  live(round);
  round.discards.push(...round.middle);
  const reshuffled = round.deck.length < MIDDLE;
  if (reshuffled) {
    if (round.reshuffles >= MAX_RESHUFFLES) {
      round.middle = [];
      round.seq += 1;
      round.over = { reason: 'deck', team: null };
      return round;
    }
    round.deck = shuffle([...round.deck, ...round.discards], rng);
    round.discards = [];
    round.reshuffles += 1;
  }
  round.middle = round.deck.splice(-MIDDLE);
  round.deals += 1;
  round.passed = [false, false, false, false];
  round.passAt = null;
  round.at = now + SHOW_MS;
  round.moves += 1;
  round.seq += 1;
  round.lastAction = { n: round.seq, type: 'refresh', reshuffled };
  return round;
}

/** A gesture for the whole table to see. Only your partner knows whether it means anything. */
export function gesture(round, seat, sign, now = Date.now(), { cooldown = false } = {}) {
  live(round);
  if (!SIGNS.includes(sign)) throw new MoveError('Unknown gesture');
  const last = round.gestures[seat];
  if (cooldown && last && now - last.at < GESTURE_COOLDOWN_MS) throw new MoveError('Too fast');
  round.seq += 1;
  round.gestures[seat] = { n: round.seq, sign, at: now, moves: round.moves };
  round.gesture = { n: round.seq, seat, sign };
  return round;
}

/** Change your team's secret signal. Only your partner sees it. */
export function setSignal(round, seat, sign) {
  live(round);
  if (!SIGNS.includes(sign)) throw new MoveError('Unknown gesture');
  const team = teamOf(seat);
  if (round.signals[team] === sign) return round;
  round.signals[team] = sign;
  round.seq += 1;
  return round;
}

/** The gesture `seat` made since getting four of a kind, if any: what gave it away. */
function shownBy(round, seat) {
  const g = round.gestures[seat];
  const four = round.four[seat];
  return g && four && g.n > four.n ? g.sign : null;
}

/** Your partner holds four of a kind: your team wins the hand. If not, theirs does. */
export function kemps(round, seat) {
  live(round);
  const partner = partnerOf(seat);
  const right = isFour(round.hands[partner]);
  round.seq += 1;
  round.over = { reason: 'kemps', seat, target: partner, right, team: right ? teamOf(seat) : 1 - teamOf(seat), shown: right ? shownBy(round, partner) : null };
  return round;
}

/** A rival holds four of a kind: your team wins the hand. If not, theirs does. */
export function corta(round, seat, target) {
  live(round);
  if (!Number.isInteger(target) || target < 0 || target >= SEATS || teamOf(target) === teamOf(seat)) throw new MoveError('Pick a rival');
  const right = isFour(round.hands[target]);
  round.seq += 1;
  round.over = { reason: 'corta', seat, target, right, team: right ? teamOf(seat) : teamOf(target), shown: right ? shownBy(round, target) : null };
  return round;
}

// ---- bots ---------------------------------------------------------------------

/** How many of each number, biggest first: [3, 1] beats [2, 2] beats [2, 1, 1]. */
function shape(hand) {
  const n = {};
  for (const [r] of hand) n[r] = (n[r] ?? 0) + 1;
  return Object.values(n).sort((a, b) => b - a);
}
const better = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/** The swap that brings this hand closest to four of a kind, or null when none helps. */
export function bestSwap(hand, middle) {
  if (isFour(hand)) return null;
  let best = null;
  let bestShape = shape(hand);
  for (const take of middle) {
    for (const give of hand) {
      if (give[0] === take[0]) continue;
      const after = shape(hand.map((c) => (c === give ? take : c)));
      if (better(after, bestShape)) [best, bestShape] = [{ take, give }, after];
    }
  }
  return best;
}

/** Four cards of one number that `seat` visibly took from the middle and still holds. */
const publicFour = (round, seat) => isFour(round.known[seat]);

/**
 * What the bots, and the table itself, will do next, earliest first: { at, kind, seat, ... }.
 * `isBot(seat)` says who the bots are. Only what a bot may know goes in: its own hand,
 * the middle, the gestures and what each seat visibly took.
 */
export function plan(round, isBot) {
  if (round.over) return [];
  const events = [];
  const add = (at, kind, seat, extra = {}) => events.push({ at, kind, seat, ...extra });
  let content = true; // every bot is done with the middle
  for (let s = 0; s < SEATS; s++) {
    if (!isBot(s)) continue;
    const team = teamOf(s);
    const p = partnerOf(s);
    const pg = round.gestures[p];
    // The partner made our signal, or visibly holds four of a kind: call it.
    if (pg && pg.sign === round.signals[team]) add(pg.at + within(BOT_KEMPS_MS, noise(round.salt, pg.n, s, 'kemps')), 'kemps', s);
    else if (publicFour(round, p)) add(round.at + BOT_PUBLIC_MS, 'kemps', s);
    // A rival makes the signal its team was caught with, or visibly holds four: stop them.
    for (const o of [(s + 1) % SEATS, (s + 3) % SEATS]) {
      const g = round.gestures[o];
      const caught = g && g.sign === round.learned[teamOf(o)] && noise(round.salt, g.n, s, 'trust') < BOT_CORTA_CHANCE;
      if (caught) add(g.at + within(BOT_CORTA_MS, noise(round.salt, g.n, s, 'corta')), 'corta', s, { target: o });
      else if (publicFour(round, o)) add(round.at + BOT_PUBLIC_MS + within([100, 600], noise(round.salt, round.moves, s, 'see')), 'corta', s, { target: o });
    }
    const mine = round.gestures[s];
    const four = round.four[s];
    if (four) {
      // Signal the partner, and again now and then while a human partner misses it.
      const signaled = mine && mine.n > four.n;
      if (!signaled) add(four.at + within(BOT_SIGNAL_MS, noise(round.salt, four.n, s, 'signal')), 'gesture', s, { sign: round.signals[team] });
      else if (!isBot(p)) add(mine.at + BOT_RESIGNAL_MS, 'gesture', s, { sign: round.signals[team] });
      continue;
    }
    const move = bestSwap(round.hands[s], round.middle);
    if (move) {
      content = false;
      add(round.at + within(BOT_SWAP_MS, noise(round.salt, round.moves, s, 'swap')), 'swap', s, move);
    }
    // Now and then a gesture that means nothing, so the signal doesn't stand out.
    if ((!mine || mine.moves !== round.moves) && noise(round.salt, round.moves, s, 'decoy') < BOT_DECOY_CHANCE) {
      const decoys = SIGNS.filter((x) => x !== round.signals[team]);
      const sign = decoys[Math.floor(noise(round.salt, round.moves, s, 'which') * decoys.length)];
      add(round.at + within(BOT_DECOY_MS, noise(round.salt, round.moves, s, 'when')), 'gesture', s, { sign });
    }
  }
  // The middle is replaced once everyone is done with it, or nobody has touched it for a while.
  const passed = round.passed.every((p, s) => p || isBot(s));
  if (content && passed) add(Math.max(round.at, (round.passAt ?? round.at) + SETTLED_MS), 'refresh', -1);
  else add(round.at + IDLE_MS, 'refresh', -1);
  // Ties go to the table's own move first, then the lower seat.
  return events.sort((a, b) => a.at - b.at || a.seat - b.seat);
}

/** Play one planned event. */
export function runEvent(round, ev, rng = Math.random, now = Date.now()) {
  if (ev.kind === 'refresh') refresh(round, rng, now);
  else if (ev.kind === 'swap') swap(round, ev.seat, ev.take, ev.give, now);
  else if (ev.kind === 'gesture') gesture(round, ev.seat, ev.sign, now);
  else if (ev.kind === 'kemps') kemps(round, ev.seat);
  else if (ev.kind === 'corta') corta(round, ev.seat, ev.target);
  return round;
}

/**
 * Move the round's clock so its latest moment is `now`. Played out ahead of time (the
 * testing tools' scenarios), its times are wherever the bots' own pace took them.
 */
export function rebase(round, now = Date.now()) {
  const times = [round.at, round.passAt, ...round.gestures.map((g) => g?.at), ...round.four.map((f) => f?.at)].filter((x) => x != null);
  const shift = now - Math.max(...times);
  round.at += shift;
  if (round.passAt != null) round.passAt += shift;
  for (const g of round.gestures) if (g) g.at += shift;
  for (const f of round.four) if (f) f.at += shift;
  return round;
}

/** Signals for the next round: a team of bots whose signal was caught picks another. */
function nextSignals(match, rng) {
  const prev = match.round?.signals ? match.round : null;
  if (!prev) return { signals: null, learned: [null, null] };
  const learned = prev.learned.slice();
  const { over } = prev;
  if (over?.right && over.shown) learned[teamOf(over.target)] = over.shown; // the target is who held it
  const signals = prev.signals.map((sign, team) => {
    const bots = [team, team + 2].every((s) => match.seats[s]?.bot);
    if (!bots || learned[team] !== sign) return sign;
    const others = SIGNS.filter((x) => x !== sign);
    return others[Math.floor(rng() * others.length)];
  });
  return { signals, learned };
}

const eventKey = (match, ev) => `${match.roundNo}:${match.round.seq}:${ev.kind}:${ev.seat}`;
const botsOf = (match) => (s) => !!match.seats[s]?.bot;

export const game = {
  id: 'kemps',
  flag: 'kemps', // not offered until it's on in PostHog
  targets: [3, 5, 7],
  defaultTarget: 5,

  newRound(match, rng) {
    const dealer = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(dealer);
    return newRound({ dealer, rng, ...nextSignals(match, rng) });
  },

  handle(round, seat, msg) {
    if (msg.t === 'swap') swap(round, seat, msg.take, msg.give);
    else if (msg.t === 'pass') {
      if (round.passed[seat]) return false; // a second tap, or one sent before the first landed
      pass(round, seat);
    }
    else if (msg.t === 'gesture') gesture(round, seat, msg.sign, Date.now(), { cooldown: true });
    else if (msg.t === 'signal') setSignal(round, seat, msg.sign);
    else if (msg.t === 'kemps') kemps(round, seat);
    else if (msg.t === 'corta') corta(round, seat, Number(msg.seat));
    else return false;
    return true;
  },

  settle(match) {
    const { reason, team, seat, target, right } = match.round.over;
    if (team !== null) match.scores[team] += 1;
    match.history.push({ round: match.roundNo, team, reason, seat: seat ?? null, target: target ?? null, right: right ?? null });
  },

  pendingAuto(match) {
    const [ev] = plan(match.round, botsOf(match));
    return ev ? { delay: Math.max(ev.at - Date.now(), 0), key: eventKey(match, ev) } : null;
  },

  // The middle is always on a clock, so the table never waits on anyone.
  waitingOn: () => null,

  runAuto(match, rng) {
    const [ev] = plan(match.round, botsOf(match));
    if (ev) runEvent(match.round, ev, rng);
  },

  roundView(r, seat, revealed) {
    return {
      dealer: r.dealer,
      turn: null,
      middle: r.middle,
      deck: r.deck.length,
      deals: r.deals,
      reshuffles: r.reshuffles,
      passed: r.passed,
      known: r.known,
      gesture: r.gesture,
      lastAction: r.lastAction,
      // Your own team's signal, and whether the other team has been seen to catch it.
      signal: seat !== -1 ? r.signals[teamOf(seat)] : null,
      exposed: seat !== -1 && r.learned[teamOf(seat)] === r.signals[teamOf(seat)],
      over: r.over,
      hand: seat !== -1 ? r.hands[seat] : null,
      options: options(r, seat),
      hands: revealed ? r.hands : null,
    };
  },
};
