// Pure round logic for 4-player Venezuelan caída (40-card Spanish deck). The dealer
// lays 4 cards on the table, then three deals of 3 cards each empty the deck. Playing
// a card takes the same number from the table and whatever follows it in sequence.
// Points land as they happen, and the first team to reach the target ends the game.

import {
  BOT_DELAY_MS,
  DEAL_MS,
  REDEAL_MS,
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
export const DEAL_PAUSE_MS = 600; // extra time to see the table and a new hand once dealt
export const CAPTURE_PAUSE_MS = 900; // extra time to watch a capture leave the table

// The house rules that vary most from table to table.
const MALA_ECHADA_POINTS = 1; // the other team, when no card lands on its number
const MESA_LIMPIA_POINTS = 4; // not in the last deal
const FREE_CARDS = 20; // half the deck: only the cards above this score
const TRIVILIN_POINTS = 5;
const PATRULLA_POINTS = 6;
const VIGIA_POINTS = 7;
const REGISTRO_POINTS = 8;

/** What a caída or a Ronda of this number is worth. */
export const cardValue = (n) => (n <= 7 ? 1 : n - 8);

/**
 * The canto in a hand: a pair (ronda), a pair and the number next to it (vigía), three in
 * a row (patrulla), three of a kind (trivilín) or 1-11-12 (registro). `high` breaks a tie
 * between two of the same canto.
 */
export function cantoOf(hand) {
  const [a, b, c] = hand.map(([n]) => NUMBERS.indexOf(n)).sort((x, y) => x - y);
  if (a === c) return { kind: 'trivilin', points: TRIVILIN_POINTS, high: [a] };
  if (b === a + 1 && c === b + 1) return { kind: 'patrulla', points: PATRULLA_POINTS, high: [c] };
  if ([a, b, c].map((i) => NUMBERS[i]).join() === '1,11,12') return { kind: 'registro', points: REGISTRO_POINTS, high: [] };
  if (a !== b && b !== c) return null;
  const third = a === b ? c : a;
  if (Math.abs(third - b) === 1) return { kind: 'vigia', points: VIGIA_POINTS, high: [b, third] };
  return { kind: 'ronda', points: cardValue(NUMBERS[b]), high: [b, third] };
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
 * card landing on its own number scores that number, and with none it's a mala echada
 * that pays the other team. A number already on the table goes back into the deck.
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
  else award(round, { kind: 'mala', team: 1 - team, points: MALA_ECHADA_POINTS });
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

/**
 * Whether sung canto `a` beats `b`: more points, then higher cards, then whoever sits
 * closer to the dealer's right, so the dealer loses a tie.
 */
function beats(round, a, b) {
  if (a.points !== b.points) return a.points > b.points;
  const high = a.high ?? [];
  for (let i = 0; i < high.length; i++) if (high[i] !== b.high[i]) return high[i] > b.high[i];
  const fromDealer = (seat) => (seat - round.dealer + SEATS - 1) % SEATS;
  return fromDealer(a.seat) < fromDealer(b.seat);
}

/** Once everyone has played from this deal: only the best canto pays. */
function settleCantos(round) {
  const best = round.sung.reduce((b, s) => (!b || beats(round, s, b) ? s : b), null);
  if (best) award(round, { kind: best.kind, team: teamOf(best.seat), seat: best.seat, points: best.points });
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
    if (!round.table.length && round.deal < DEALS) mesa = MESA_LIMPIA_POINTS;
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
  const mesa = taken.length === round.table.length && round.deal < DEALS ? MESA_LIMPIA_POINTS : 0;
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

  handle(round, seat, msg, rng) {
    if (msg.t === 'play' && Array.isArray(msg.card)) play(round, seat, msg.card);
    else if (msg.t === 'call' && msg.what === 'canto') sing(round, seat);
    else if (msg.t === 'order') chooseOrder(round, seat, msg.dir, rng);
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
      delay: BOT_DELAY_MS + (newDeal ? DEAL_PAUSE_MS + (r.deal === 1 ? DEAL_MS : REDEAL_MS) : 0) + (captured ? CAPTURE_PAUSE_MS : 0),
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
