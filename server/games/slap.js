// Pure round logic for the slap game (Irish Snap, manotazo) on the 40-card Spanish deck,
// every player for themselves. The whole deck is dealt face down and nobody sees their own
// cards. In turn, each player flips their top card onto the middle stack while the count
// goes 1, 2, 3 … 7, sota, caballo, rey and round again. When the card is the number just
// called, everyone slaps the stack, and the last hand down takes it under their pile. A
// slap on any other card takes it too. Run out of cards, then live through the next slap,
// and you win the round.

import { DEAL_MS, MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, shuffle } from './common.js';
import { NUMBERS, fullDeck } from './truco.js';

// ---- the house rules ----------------------------------------------------------

/** The count, called one number per card: the deck's numbers in order, then round again. */
export const COUNT = NUMBERS;
/** Snap: also slap when a card is the same number as the one under it. Off: only the count matches. */
export const SNAP = false;
/** Out of cards, you still have to live through the next slap to win. Off: running out wins on the spot. */
export const SLAP_TO_WIN = true;

// ---- how fast you have to be ---------------------------------------------------

// The server keeps the slaps in the order they reach it, and the last hand down takes the
// stack. Once three hands are down the fourth is last whatever it does, so the window shuts
// there; a player who never slaps is last when it runs out.
export const SLAP_MS = 3000;
// From the server's flip to the card face up on everyone's screen: the client's flip
// (public/js/slap.js) plus the state's trip to the phone.
export const FLIP_MS = 450;
// A phone's slap also has to travel back. Bots wait for the whole round trip, so a player on
// an ordinary connection races them on reflexes, not on distance to the server.
export const NET_MS = 250;
// How long a bot takes to react once the card shows: somewhere in this range, and now and
// then it looks away for a while longer.
export const BOT_REACT_MS = [350, 1100];
export const BOT_SLOW_CHANCE = 0.1;
export const BOT_SLOW_MS = 1200;
// Now and then a bot slaps a card that doesn't match, and takes the stack for it.
export const BOT_FOOLED_CHANCE = 0.01;
// A bot flips faster than it plays a card in the other games: there's nothing to think about.
export const BOT_FLIP_MS = 1100;
export const TAKE_PAUSE_MS = 900; // to see who took the stack before the next card
export const DEAL_PAUSE_MS = 600;

/** The number called with the flip after `count` flips since the stack was last taken. */
export const calledAt = (count) => COUNT[count % COUNT.length];

/** Whether a card calls for a slap: the number called, or with SNAP, the number under it. */
export const isMatch = (card, called, under = null, snap = SNAP) => card[0] === called || (snap && !!under && under[0] === card[0]);

/** The next seat after `seat` with cards to flip, `seat` itself last; null when nobody has any. */
export function nextWithCards(round, seat) {
  for (let k = 1; k <= SEATS; k++) {
    const s = (seat + k) % SEATS;
    if (round.hands[s].length) return s;
  }
  return null;
}

// ---- dealing ------------------------------------------------------------------

export function newRound({ starter = 0, rng = Math.random, now = Date.now() } = {}) {
  const deck = shuffle(fullDeck(), rng);
  // Dealt one at a time round the table from the starter, so the 40 cards come out even.
  const hands = [[], [], [], []];
  deck.forEach((card, i) => hands[(starter + i) % SEATS].push(card));
  return {
    starter,
    turn: starter,
    hands, // face down, bottom first: the last card is the next one flipped
    stack: [], // face up in the middle, bottom first
    count: 0, // cards flipped since the stack was last taken: picks the number called next
    flips: 0, // cards flipped this round, and the id of the latest flip
    flip: null, // the card on top: { n, seat, card, called, match, at }
    window: null, // a match to slap: { n, opened, until, slaps (seats, in the order they got there) }
    react: null, // each seat's reaction time to this flip, if it were a bot; never shown
    out: [], // seats with no cards, in the order they ran out
    taken: [0, 0, 0, 0], // stacks each player picked up
    falseSlaps: [0, 0, 0, 0],
    at: now, // when the last thing happened, for the bots' pace
    seq: 0,
    lastAction: null,
    over: null,
  };
}

export function options(round, seat) {
  const playing = !round.over && seat !== -1;
  return {
    flip: playing && !round.window && round.turn === seat,
    // You can always slap a card on the stack: only a match makes it right.
    slap: playing && round.stack.length > 0 && !round.window?.slaps.includes(seat),
  };
}

/** How long each seat takes to slap this card if it's a bot; null for a bot that leaves it. */
function reactions(match, rng) {
  return Array.from({ length: SEATS }, () => {
    if (!match && rng() >= BOT_FOOLED_CHANCE) return null;
    const [lo, hi] = BOT_REACT_MS;
    return Math.round(lo + rng() * (hi - lo) + (rng() < BOT_SLOW_CHANCE ? BOT_SLOW_MS : 0));
  });
}

// ---- moves --------------------------------------------------------------------

/**
 * Turn your top card over onto the stack, as the next number is called. `after` is the
 * moment (`seq`) you tapped in: a second tap never flips a second card, and a tap that
 * crossed a false slap, which moves the turn, doesn't flip out of turn.
 */
export function flip(round, seat, { now = Date.now(), rng = Math.random, after = round.seq } = {}) {
  if (round.over) throw new MoveError('Round is over');
  if (after !== round.seq) throw new MoveError('Too late');
  if (round.window) throw new MoveError('Slap first');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  const card = round.hands[seat].pop();
  const called = calledAt(round.count);
  const match = isMatch(card, called, round.stack.at(-1));
  round.stack.push(card);
  round.count += 1;
  round.flips += 1;
  round.seq += 1;
  round.at = now;
  round.flip = { n: round.flips, seat, card, called, match, at: now };
  round.react = reactions(match, rng);
  const out = !round.hands[seat].length;
  if (out) round.out.push(seat);
  round.lastAction = { n: round.seq, type: 'flip', seat, card, called, match, out };
  if (out && !SLAP_TO_WIN) return finish(round, seat, 'out');
  if (match) {
    round.window = { n: round.flips, opened: now, until: now + SLAP_MS, slaps: [] };
    return round;
  }
  round.turn = nextWithCards(round, seat);
  // Every card is on the stack and none of them matched: whoever ran out first wins.
  if (round.turn === null) finish(round, round.out[0], 'allOut');
  return round;
}

/**
 * A hand on the stack. `n` is the flip it was meant for: a slap that gets here after the
 * next card is ignored, so a slow hand is never a wrong one. On a match it joins the
 * slaps in the order it arrived; on any other card it takes the stack.
 */
export function slap(round, seat, n, now = Date.now()) {
  if (round.over) throw new MoveError('Round is over');
  if (n !== round.flip?.n || !round.stack.length) throw new MoveError('Too late');
  const w = round.window;
  if (!w) return take(round, seat, 'false', now);
  if (w.slaps.includes(seat)) throw new MoveError('You already slapped');
  if (now > w.until) throw new MoveError('Too late');
  w.slaps.push(seat);
  round.seq += 1;
  round.at = now;
  round.lastAction = { n: round.seq, type: 'slap', seat, place: w.slaps.length };
  if (w.slaps.length === SEATS - 1) closeWindow(round, now);
  return round;
}

/**
 * The window is over: the last hand down takes the stack. Whoever never slapped is last;
 * with two or more of them, the first in turn from the player who flipped.
 */
export function closeWindow(round, now = Date.now()) {
  const w = round.window;
  const flipper = round.flip.seat;
  const missing = Array.from({ length: SEATS }, (_, k) => (flipper + k) % SEATS).filter((s) => !w.slaps.includes(s));
  const taker = missing[0];
  // A player who was out, slapped in time and isn't taking the stack has won.
  const winner = SLAP_TO_WIN ? round.out.find((s) => s !== taker && w.slaps.includes(s)) : undefined;
  take(round, taker, 'last', now);
  if (winner !== undefined) finish(round, winner, 'out');
  return round;
}

/** `seat` picks up the stack, turns it over and puts it under its pile; the count starts again after it. */
function take(round, seat, why, now) {
  const w = round.window;
  const cards = round.stack.length;
  round.hands[seat].unshift(...round.stack.reverse());
  round.stack = [];
  round.taken[seat] += 1;
  if (why === 'false') round.falseSlaps[seat] += 1;
  const wasOut = round.out.includes(seat);
  round.out = round.out.filter((s) => s !== seat);
  round.count = 0;
  round.window = null;
  round.react = null;
  round.turn = nextWithCards(round, seat);
  round.seq += 1;
  round.at = now;
  round.lastAction = { n: round.seq, type: 'take', seat, why, cards, slaps: w?.slaps ?? [], back: wasOut };
  return round;
}

function finish(round, seat, reason) {
  round.window = null;
  round.react = null;
  round.over = { reason, seat };
  return round;
}

// ---- the table playing itself ----------------------------------------------------

/**
 * What the bots do next, and when (a server timestamp): a bot's slap, the window closing, a
 * bot fooled into slapping a card that doesn't match, or a bot's flip. `bot(seat)` says
 * which seats are bots right now. Null when the table waits on a player.
 */
export function nextAuto(round, bot) {
  if (round.over) return null;
  const w = round.window;
  const f = round.flip;
  const slapAt = (s) => f.at + FLIP_MS + NET_MS + round.react[s];
  const slappers = round.react ? [0, 1, 2, 3].filter((s) => bot(s) && round.react[s] != null && !w?.slaps.includes(s)) : [];
  let next = w ? { kind: 'close', at: w.until } : null;
  // Only while the card is still on top: the next flip, or a take, draws new reactions.
  if (w || round.stack.length) {
    for (const s of slappers) if (!next || slapAt(s) < next.at) next = { kind: 'slap', seat: s, at: slapAt(s) };
  }
  if (!w && bot(round.turn)) {
    const la = round.lastAction?.n === round.seq ? round.lastAction : null;
    const pause = !round.flips ? DEAL_MS + DEAL_PAUSE_MS : la?.type === 'take' ? TAKE_PAUSE_MS : 0;
    const at = round.at + BOT_FLIP_MS + pause;
    if (!next || at < next.at) next = { kind: 'flip', seat: round.turn, at };
  }
  return next;
}

/**
 * Play what `nextAuto` said. It happens now, so the table's clock never runs ahead of the
 * server's, but a bot's slap counts as in time: it was due before the window shut.
 */
export function runNext(round, next, rng, now = Date.now()) {
  if (next.kind === 'close') return closeWindow(round, now);
  if (next.kind === 'slap') return slap(round, next.seat, round.flip.n, round.window ? Math.min(now, round.window.until) : now);
  return flip(round, next.seat, { now, rng });
}

export const game = {
  id: 'slap',
  solo: true, // every player for themselves: four scores, no teams
  targets: [1, 3, 5],
  defaultTarget: 3,

  newRound(match, rng) {
    const starter = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = (starter + 1) % SEATS;
    return newRound({ starter, rng });
  },

  handle(round, seat, msg, rng) {
    if (msg.t === 'flip') flip(round, seat, { rng, after: Number(msg.n) });
    else if (msg.t === 'slap') slap(round, seat, Number(msg.n));
    else return false;
    return true;
  },

  settle(match) {
    const r = match.round;
    match.scores[r.over.seat] += 1;
    match.history.push({ round: match.roundNo, seat: r.over.seat, reason: r.over.reason, flips: r.flips, taken: r.taken, falseSlaps: r.falseSlaps });
  },

  pendingAuto(match) {
    const next = nextAuto(match.round, (s) => !!match.seats[s]?.bot);
    if (!next) return null;
    return { delay: Math.max(next.at - Date.now(), 0), key: `${match.roundNo}:${match.round.seq}:${next.kind}:${next.seat ?? ''}` };
  },

  // A window always has a timer, so this is only ever a player whose turn it is to flip.
  waitingOn: (match) => ({ seat: match.round.turn, key: `${match.roundNo}:${match.round.seq}` }),
  slowTurnMs: 20_000, // a flip takes no thinking

  runAuto(match, rng) {
    const r = match.round;
    const next = nextAuto(r, (s) => !!match.seats[s]?.bot);
    const phrase = next.kind === 'flip' && isManguangua(match.seats[next.seat]) && rng() < PLAY_PHRASE_CHANCE;
    runNext(r, next, rng);
    if (phrase && r.lastAction.type === 'flip') r.lastAction.phrase = true;
  },

  roundView(r, seat) {
    return {
      starter: r.starter,
      seq: r.seq, // a flip names the moment it was sent in
      turn: r.over || r.window ? null : r.turn,
      // Nobody sees a face-down card, their own included: only how many each has.
      piles: r.hands.map((h) => h.length),
      stack: r.stack.length,
      top: r.stack.slice(-3), // what shows of the stack: the top card and a couple under it
      count: r.count,
      next: calledAt(r.count), // the number the next flip calls
      flip: r.flip && { n: r.flip.n, seat: r.flip.seat, card: r.flip.card, called: r.flip.called, match: r.flip.match },
      // Time left rather than a deadline, so the client's clock doesn't matter.
      window: r.window && { n: r.window.n, slaps: r.window.slaps, left: Math.max(r.window.until - Date.now(), 0) },
      out: r.out,
      taken: r.taken,
      falseSlaps: r.falseSlaps,
      flips: r.flips,
      lastAction: r.lastAction,
      over: r.over,
      hand: null, // never shown, not even to its owner
      options: options(r, seat),
      hands: null,
    };
  },
};

