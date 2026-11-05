// Pure round logic for 4-player Venezuelan caída (40-card Spanish deck). The dealer
// lays 4 cards on the table, then three deals of 3 cards each empty the deck. Playing
// a card takes the same number from the table and whatever follows it in sequence.
// Points land as they happen, and the first team to reach the target ends the game.

import {
  BOT_DELAY_MS,
  MoveError,
  PLAY_PHRASE_CHANCE,
  SEATS,
  TALK_PHRASE_CHANCE,
  isManguangua,
  nextSeat,
  shuffle,
  teamOf,
} from './common.js';
import { HAND_SIZE, NUMBERS, fullDeck, sameCard } from './truco.js';

export const DEALS = 3;
export const TABLE_CARDS = 4;
export const DEAL_PAUSE_MS = 1400; // extra time to see the table or a new hand before the first card
export const CAPTURE_PAUSE_MS = 900; // extra time to watch a capture leave the table

// The house rules that vary most from table to table.
const CLEAN_DEAL_POINTS = 1; // the dealer laid 4 different cards first try
const REPEAT_POINTS = 1; // the other team, per repeated card the dealer turned up
const MESA_LIMPIA_POINTS = 4;
const FREE_CARDS = 20; // half the deck: only the cards above this score
const PATRULLA_POINTS = 2;
const TOLETE_POINTS = 3;

/** What a caída or a Ronda of this number is worth. */
export const cardValue = (n) => (n <= 7 ? 1 : n - 8);

const CANTO_ORDER = ['ronda', 'patrulla', 'tolete'];

/** The best canto in a hand: a pair, three in a row or three of a kind. */
export function cantoOf(hand) {
  const [a, b, c] = hand.map(([n]) => n).sort((x, y) => NUMBERS.indexOf(x) - NUMBERS.indexOf(y));
  if (a === c) return { kind: 'tolete', points: TOLETE_POINTS };
  if (NUMBERS.indexOf(b) === NUMBERS.indexOf(a) + 1 && NUMBERS.indexOf(c) === NUMBERS.indexOf(b) + 1) {
    return { kind: 'patrulla', points: PATRULLA_POINTS };
  }
  if (a === b || b === c) return { kind: 'ronda', points: cardValue(b) };
  return null;
}

/** The cards a play takes: the same number, then the following numbers without a gap. */
export function takes(table, [n]) {
  const taken = [];
  for (let i = NUMBERS.indexOf(n); i < NUMBERS.length; i++) {
    const card = table.find(([m]) => m === NUMBERS[i]);
    if (!card) break;
    taken.push(card);
  }
  return taken;
}

// ---- dealing ------------------------------------------------------------------

/** A new round: the dealer still has to call the order the table is counted in. */
export function newRound({ dealer = 0, scores = [0, 0], target = 24, rng = Math.random } = {}) {
  return {
    dealer,
    turn: dealer,
    deck: shuffle(fullDeck(), rng),
    table: [],
    opening: null, // how the table was laid: { dir, slots: [{ card, spot, hit }], repeats }
    hands: [[], [], [], []],
    deal: 0, // 0 until the table is laid, then 1 to DEALS
    plays: 0,
    piles: [0, 0], // cards each team has captured
    points: [0, 0], // scored this round; the match only adds them when it ends
    base: scores.slice(),
    target,
    sung: [], // cantos of this deal: { seat, kind, points }
    lastDrop: null, // the card just played, if it stayed on the table
    lastCapture: null, // the seat that gets what's left at the end
    leftovers: 0,
    awards: [],
    seq: 0, // bumps on every action, identifies the moment for automatic moves
    lastCall: null,
    lastAction: null,
    over: null,
  };
}

function award(round, a) {
  if (round.over) return;
  round.points[a.team] += a.points;
  round.awards.push(a);
  if (round.base[a.team] + round.points[a.team] >= round.target) round.over = { reason: 'target', team: a.team };
}

function dealHands(round) {
  for (let s = 0; s < SEATS; s++) round.hands[s] = round.deck.splice(-HAND_SIZE);
  round.deal += 1;
  round.sung = [];
  round.lastCall = null;
}

// ---- what a seat may do right now ---------------------------------------------

export function options(round, seat) {
  const opts = { order: false, play: false, canto: null };
  if (round.over || round.turn !== seat) return opts;
  if (!round.deal) {
    opts.order = true;
    return opts;
  }
  opts.play = true;
  // A canto is sung on your turn, before your first card of the deal.
  if (round.hands[seat].length === HAND_SIZE && !round.sung.some((s) => s.seat === seat)) {
    opts.canto = cantoOf(round.hands[seat])?.kind ?? null;
  }
  return opts;
}

// ---- moves --------------------------------------------------------------------

/**
 * The dealer calls the count, 1 to 4 (dir 1) or 4 to 1 (dir -1), and lays the table. A
 * card landing on its own number scores that number. A number already on the table goes
 * back into the deck and pays the other team.
 */
export function chooseOrder(round, seat, dir, rng = Math.random) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat || round.deal) throw new MoveError('Not your turn');
  if (dir !== 1 && dir !== -1) throw new MoveError('Unknown order');
  const slots = [];
  let repeats = 0;
  while (slots.length < TABLE_CARDS) {
    const card = round.deck.pop();
    if (slots.some((s) => s.card[0] === card[0])) {
      repeats += 1;
      round.deck.splice(Math.floor(rng() * round.deck.length), 0, card); // never back on top
      continue;
    }
    const spot = dir === 1 ? slots.length + 1 : TABLE_CARDS - slots.length;
    slots.push({ card, spot, hit: card[0] === spot });
  }
  round.table = slots.map((s) => s.card);
  round.opening = { dir, slots, repeats };
  round.seq += 1;
  dealHands(round);
  round.turn = nextSeat(seat);

  const team = teamOf(seat);
  const hits = slots.filter((s) => s.hit).reduce((sum, s) => sum + s.spot, 0);
  if (hits) award(round, { kind: 'table', team, points: hits });
  if (repeats) award(round, { kind: 'repeats', team: 1 - team, points: repeats * REPEAT_POINTS });
  else award(round, { kind: 'clean', team, points: CLEAN_DEAL_POINTS });
  return round;
}

export function sing(round, seat) {
  if (round.over) throw new MoveError('Round is over');
  if (!options(round, seat).canto) throw new MoveError('You cannot sing now');
  const canto = cantoOf(round.hands[seat]);
  round.sung.push({ seat, ...canto });
  round.seq += 1;
  round.lastCall = { n: round.seq, seat, what: canto.kind };
  return round;
}

/** Once everyone has played from this deal: the best canto pays, and equal ones both do. */
function settleCantos(round) {
  const best = [null, null];
  for (const s of round.sung) {
    const b = best[teamOf(s.seat)];
    const rank = CANTO_ORDER.indexOf(s.kind);
    const beats = !b || rank > CANTO_ORDER.indexOf(b.kind) || (rank === CANTO_ORDER.indexOf(b.kind) && s.points > b.points);
    if (beats) best[teamOf(s.seat)] = s;
  }
  const rank = (s) => (s ? CANTO_ORDER.indexOf(s.kind) : -1);
  for (const team of [0, 1]) {
    const s = best[team];
    if (s && rank(s) >= rank(best[1 - team])) award(round, { kind: s.kind, team, seat: s.seat, points: s.points });
  }
}

export function play(round, seat, card) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat || !round.deal) throw new MoveError('Not your turn');
  const hand = round.hands[seat];
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx === -1) throw new MoveError('You do not have that card');
  const [played] = hand.splice(idx, 1);
  round.plays += 1;
  round.seq += 1;

  const team = teamOf(seat);
  const taken = takes(round.table, played);
  const caida = round.lastDrop?.[0] === played[0] ? cardValue(played[0]) : 0;
  let mesa = 0;
  round.lastDrop = null;
  if (taken.length) {
    round.table = round.table.filter((c) => !taken.includes(c));
    round.piles[team] += taken.length + 1;
    round.lastCapture = seat;
    if (!round.table.length) mesa = MESA_LIMPIA_POINTS;
  } else {
    round.table.push(played);
    round.lastDrop = played;
  }
  round.lastAction = { n: round.seq, type: 'play', seat, card: played, taken, caida, mesa };

  if (round.hands.every((h) => h.length === HAND_SIZE - 1)) settleCantos(round);
  if (caida) award(round, { kind: 'caida', team, seat, points: caida });
  if (mesa) award(round, { kind: 'mesa', team, seat, points: mesa });
  if (round.over) return round;

  round.turn = nextSeat(seat);
  if (round.hands.every((h) => !h.length)) {
    if (round.deck.length) dealHands(round);
    else finish(round);
  }
  return round;
}

/** The deck is out: the last capture takes what's left, then the cards are counted. */
function finish(round) {
  round.leftovers = round.table.length;
  round.piles[teamOf(round.lastCapture ?? round.dealer)] += round.leftovers;
  const [a, b] = round.piles;
  if (a !== b) {
    const team = a > b ? 0 : 1;
    const extra = round.piles[team] - FREE_CARDS;
    award(round, { kind: 'cards', team, points: extra, cards: [round.piles[team], round.piles[1 - team]] });
  }
  round.over ??= { reason: 'cards' };
}

// ---- bot ----------------------------------------------------------------------

/** Take the most, punish a caída, and don't leave a valuable card for the next rival. */
function cardWorth(round, card) {
  const taken = takes(round.table, card);
  if (!taken.length) return -cardValue(card[0]) * 1.5;
  const caida = round.lastDrop?.[0] === card[0] ? cardValue(card[0]) : 0;
  const mesa = taken.length === round.table.length ? MESA_LIMPIA_POINTS : 0;
  return 1 + taken.length + caida * 4 + mesa * 3;
}

/** The bot only looks at its own cards and the table. */
export function botMove(round, seat, rng = Math.random) {
  const opts = options(round, seat);
  if (opts.order) return { type: 'order', dir: rng() < 0.5 ? 1 : -1 };
  if (opts.canto) return { type: 'canto' };
  const hand = round.hands[seat];
  return { type: 'play', card: hand.reduce((best, c) => (cardWorth(round, c) > cardWorth(round, best) ? c : best), hand[0]) };
}

export function applyMove(round, seat, move, rng = Math.random) {
  if (move.type === 'order') return chooseOrder(round, seat, move.dir, rng);
  if (move.type === 'canto') return sing(round, seat);
  return play(round, seat, move.card);
}

export const game = {
  id: 'caida',
  targets: [12, 24],
  defaultTarget: 24,

  newRound(match, rng) {
    const dealer = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(dealer);
    return newRound({ dealer, scores: match.scores, target: match.target, rng });
  },

  handle(round, seat, msg) {
    if (msg.t === 'play' && Array.isArray(msg.card)) play(round, seat, msg.card);
    else if (msg.t === 'call' && msg.what === 'canto') sing(round, seat);
    else if (msg.t === 'order') chooseOrder(round, seat, msg.dir);
    else return false;
    return true;
  },

  settle(match) {
    const r = match.round;
    match.scores = match.scores.map((s, team) => s + r.points[team]);
    match.history.push({ round: match.roundNo, awards: r.awards });
  },

  pendingAuto(match) {
    const r = match.round;
    if (!match.seats[r.turn]?.bot) return null;
    const newDeal = r.deal && r.hands.every((h) => h.length === HAND_SIZE) && !r.sung.length;
    const captured = r.lastAction?.n === r.seq && r.lastAction.taken.length;
    return {
      delay: BOT_DELAY_MS + (newDeal ? DEAL_PAUSE_MS : 0) + (captured ? CAPTURE_PAUSE_MS : 0),
      key: `${match.roundNo}:${r.seq}`,
    };
  },

  waitingOn: (match) => ({ seat: match.round.turn, key: `${match.roundNo}:${match.round.seq}` }),

  runAuto(match, rng) {
    const r = match.round;
    const seat = r.turn;
    const move = botMove(r, seat, rng);
    const phrase = isManguangua(match.seats[seat]) && rng() < (move.type === 'play' ? PLAY_PHRASE_CHANCE : TALK_PHRASE_CHANCE);
    applyMove(r, seat, move, rng);
    if (phrase && move.type !== 'order') (move.type === 'play' ? r.lastAction : r.lastCall).phrase = true;
  },

  roundView(r, seat) {
    return {
      dealer: r.dealer,
      turn: r.over ? null : r.turn,
      table: r.table,
      opening: r.opening,
      deal: r.deal,
      plays: r.plays,
      piles: r.piles,
      points: r.points,
      // Who sang what is public; what their canto is worth waits for the end of the deal.
      sung: r.sung.map(({ seat: s, kind }) => ({ seat: s, kind })),
      lastCall: r.lastCall,
      lastAction: r.lastAction,
      over: r.over,
      awards: r.awards,
      hand: seat !== -1 ? r.hands[seat] : null,
      options: options(r, seat),
      hands: null, // nine cards each are long gone: the result shows the awards instead
    };
  },
};
