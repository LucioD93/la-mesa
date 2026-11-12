// Pure round logic for 4-player partnership rummy (one 52-card French deck, no jokers),
// scored like Rummy 500: a team adds what it melds and lays off, and loses what is still
// in both partners' hands when the round ends. Melds on the table belong to no one:
// anybody can lay off on any of them.

import { BOT_DELAY_MS, DEAL_MS, MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, nextSeat, shuffle, teamOf } from './common.js';

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 1 is the ace, 11-13 J Q K
export const HAND_SIZE = 7;
export const MIN_MELD = 3;
export const STEP_MS = 1000; // a bot's melds and discard after it has drawn

export const fullDeck = () => SUITS.flatMap((s) => RANKS.map((n) => [n, s]));
export const sameCard = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const key = ([n, s]) => `${n}${s}`;

/** Aces count 15, or 1 at the bottom of A-2-3. Faces and tens 10, the rest 5. */
export const cardPoints = ([n], lowAce = false) => (n === 1 ? (lowAce ? 1 : 15) : n >= 10 ? 10 : 5);

const bySuitRank = (a, b) => SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]) || a[0] - b[0];

/**
 * The meld these cards make, in table order, or null: a set (3 or 4 of a rank) or a run
 * (3 or more in a row of one suit; the ace goes below the 2 or above the king, not both).
 */
export function arrange(cards) {
  if (cards.length < MIN_MELD || new Set(cards.map(key)).size !== cards.length) return null;
  if (cards.every(([n]) => n === cards[0][0])) {
    return { kind: 'set', cards: cards.slice().sort((a, b) => SUITS.indexOf(a[1]) - SUITS.indexOf(b[1])) };
  }
  if (!cards.every(([, s]) => s === cards[0][1])) return null;
  for (const high of [false, true]) {
    const at = ([n]) => (high && n === 1 ? 14 : n);
    const sorted = cards.slice().sort((a, b) => at(a) - at(b));
    if (sorted.every((c, i) => !i || at(c) === at(sorted[i - 1]) + 1)) return { kind: 'run', cards: sorted };
  }
  return null;
}

/** What a meld's cards are worth where they sit. */
export const meldPoints = (meld, cards = meld.cards) =>
  cards.reduce((sum, c) => sum + cardPoints(c, meld.kind === 'run' && c[0] === 1 && sameCard(meld.cards[0], c)), 0);

export const handPoints = (hand) => hand.reduce((sum, c) => sum + cardPoints(c), 0);

// ---- dealing ------------------------------------------------------------------

export function newRound({ dealer = 0, rng = Math.random } = {}) {
  const deck = shuffle(fullDeck(), rng);
  const hands = [[], [], [], []];
  for (let s = 0; s < SEATS; s++) hands[s] = deck.splice(-HAND_SIZE).sort(bySuitRank);
  return {
    dealer,
    turn: nextSeat(dealer),
    drawn: false, // the player whose turn it is has drawn and must now discard
    stock: deck,
    discard: [deck.pop()],
    taken: null, // the card picked up from the discard pile this turn: it can't go straight back
    newCard: null, // what the player whose turn it is just drew
    hands,
    melds: [], // { kind, cards, team, seat }
    melded: [0, 0], // points each team has put down this round
    seq: 0,
    lastAction: null,
    over: null, // { reason: 'out' | 'stock', seat? }
  };
}

// ---- what a seat may do right now ---------------------------------------------

export function options(round, seat) {
  const mine = !round.over && round.turn === seat;
  return { draw: mine && !round.drawn, play: mine && round.drawn };
}

function inHand(hand, card) {
  const i = hand.findIndex((c) => sameCard(c, card));
  if (i === -1) throw new MoveError('You do not have that card');
  return i;
}

function checkPlay(round, seat) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  if (!round.drawn) throw new MoveError('Draw a card first');
}

function act(round, action) {
  round.seq += 1;
  round.lastAction = { n: round.seq, ...action };
}

/** Out of cards, by a meld, a lay-off or the last discard: the round ends. */
function checkOut(round, seat) {
  if (round.hands[seat].length) return false;
  round.over = { reason: 'out', seat };
  return true;
}

// ---- moves --------------------------------------------------------------------

export function draw(round, seat, from) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat || round.drawn) throw new MoveError('Not your turn');
  if (from !== 'stock' && from !== 'discard') throw new MoveError('Draw from the deck or the discard pile');
  if (from === 'discard' && !round.discard.length) throw new MoveError('The discard pile is empty');
  const card = from === 'stock' ? round.stock.pop() : round.discard.pop();
  round.hands[seat].push(card);
  round.drawn = true;
  round.taken = from === 'discard' ? card : null;
  round.newCard = card;
  act(round, { type: 'draw', seat, from, card: from === 'discard' ? card : null });
  return round;
}

export function meld(round, seat, cards) {
  checkPlay(round, seat);
  const hand = round.hands[seat];
  if (!Array.isArray(cards)) throw new MoveError('That is not a meld');
  cards.forEach((c) => inHand(hand, c));
  const m = arrange(cards.map((c) => hand[inHand(hand, c)]));
  if (!m) throw new MoveError('That is not a meld');
  round.hands[seat] = hand.filter((c) => !cards.some((x) => sameCard(c, x)));
  const placed = { ...m, team: teamOf(seat), seat };
  round.melds.push(placed);
  round.melded[teamOf(seat)] += meldPoints(placed);
  act(round, { type: 'meld', seat, meld: round.melds.length - 1, cards: m.cards });
  checkOut(round, seat);
  return round;
}

/** The meld with this card added, or null if it doesn't fit. */
export function layoffFit(meldOnTable, card) {
  const m = arrange([...meldOnTable.cards, card]);
  return m && m.kind === meldOnTable.kind ? m : null;
}

export function layoff(round, seat, card, index) {
  checkPlay(round, seat);
  const hand = round.hands[seat];
  const i = inHand(hand, card);
  const target = round.melds[index];
  if (!target) throw new MoveError('There is no such meld');
  const m = layoffFit(target, hand[i]);
  if (!m) throw new MoveError('That card does not fit there');
  const [played] = hand.splice(i, 1);
  target.cards = m.cards;
  round.melded[teamOf(seat)] += meldPoints(target, [played]);
  act(round, { type: 'layoff', seat, meld: index, card: played });
  checkOut(round, seat);
  return round;
}

export function discard(round, seat, card) {
  checkPlay(round, seat);
  const hand = round.hands[seat];
  const i = inHand(hand, card);
  if (sameCard(hand[i], round.taken) && hand.length > 1) throw new MoveError('You just took that card');
  const [played] = hand.splice(i, 1);
  round.discard.push(played);
  act(round, { type: 'discard', seat, card: played });
  if (checkOut(round, seat)) return round;
  // Nobody can draw from an empty deck: the round is counted as it stands.
  if (!round.stock.length) {
    round.over = { reason: 'stock' };
    return round;
  }
  round.turn = nextSeat(seat);
  round.drawn = false;
  round.taken = null;
  round.newCard = null;
  return round;
}

// ---- scoring ------------------------------------------------------------------

/** Melded points less what both partners still hold. */
export function roundScore(round) {
  return [0, 1].map((team) => {
    const held = round.hands.reduce((sum, h, s) => sum + (teamOf(s) === team ? handPoints(h) : 0), 0);
    return { melded: round.melded[team], held, points: round.melded[team] - held };
  });
}

// ---- bot ----------------------------------------------------------------------

/** Every meld these cards could make (sets of 3 or 4, runs of 3 or more). */
export function candidateMelds(hand) {
  const out = [];
  for (const n of RANKS) {
    const same = hand.filter((c) => c[0] === n);
    if (same.length >= MIN_MELD) out.push(same);
    if (same.length === 4) for (let skip = 0; skip < 4; skip++) out.push(same.filter((_, i) => i !== skip));
  }
  for (const s of SUITS) {
    const has = (n) => hand.find((c) => c[1] === s && c[0] === (n === 14 ? 1 : n));
    for (let lo = 1; lo <= 12; lo++) {
      const run = [];
      for (let n = lo; n <= 14 && has(n); n++) {
        run.push(has(n));
        if (run.length >= MIN_MELD) out.push(run.slice());
      }
    }
  }
  return out;
}

/** The melds that put down the most points together. */
export function bestMelds(hand) {
  const cands = candidateMelds(hand).map(arrange).filter(Boolean);
  let best = { points: 0, melds: [] };
  const search = (from, used, chosen, points) => {
    if (points > best.points) best = { points, melds: chosen.slice() };
    for (let i = from; i < cands.length; i++) {
      const m = cands[i];
      if (m.cards.some((c) => used.has(key(c)))) continue;
      m.cards.forEach((c) => used.add(key(c)));
      chosen.push(m);
      search(i + 1, used, chosen, points + meldPoints(m));
      chosen.pop();
      m.cards.forEach((c) => used.delete(key(c)));
    }
  };
  search(0, new Set(), [], 0);
  return best.melds;
}

const layoffs = (round, hand) => {
  for (const card of hand) {
    const index = round.melds.findIndex((m) => layoffFit(m, card));
    if (index !== -1) return { card, index };
  }
  return null;
};

/** Cards that almost make a meld: a pair, or two of a suit one or two apart. */
function keepers(hand) {
  return hand.filter((c) =>
    hand.some((d) => d !== c && (d[0] === c[0] || (d[1] === c[1] && Math.abs(d[0] - c[0]) <= 2))),
  );
}

/** Would this card meld with what's in hand, or go on the table? */
const wanted = (round, hand, card) =>
  round.melds.some((m) => layoffFit(m, card)) ||
  candidateMelds([...hand, card]).some((cards) => cards.some((c) => sameCard(c, card)));

/** The bot only looks at its own cards, the discard pile and the table. */
export function botMove(round, seat) {
  const hand = round.hands[seat];
  if (!round.drawn) {
    const top = round.discard.at(-1);
    return { type: 'draw', from: top && wanted(round, hand, top) ? 'discard' : 'stock' };
  }
  const [first] = bestMelds(hand);
  if (first) return { type: 'meld', cards: first.cards };
  const off = layoffs(round, hand);
  if (off) return { type: 'layoff', ...off };
  // Throw the highest card that isn't helping, never the one just taken.
  const free = hand.filter((c) => hand.length === 1 || !sameCard(c, round.taken));
  const keep = keepers(hand);
  const pool = free.filter((c) => !keep.includes(c)).length ? free.filter((c) => !keep.includes(c)) : free;
  const card = pool.reduce((a, b) => (cardPoints(b) > cardPoints(a) ? b : a));
  return { type: 'discard', card };
}

export function applyMove(round, seat, move) {
  if (move.type === 'draw') return draw(round, seat, move.from);
  if (move.type === 'meld') return meld(round, seat, move.cards);
  if (move.type === 'layoff') return layoff(round, seat, move.card, move.index);
  return discard(round, seat, move.card);
}

export const game = {
  id: 'rummy',
  targets: [150, 300],
  defaultTarget: 300,

  newRound(match, rng) {
    const dealer = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(dealer);
    return newRound({ dealer, rng });
  },

  handle(round, seat, msg) {
    if (msg.t === 'draw') draw(round, seat, msg.from);
    else if (msg.t === 'meld') meld(round, seat, msg.cards);
    else if (msg.t === 'layoff' && Array.isArray(msg.card)) layoff(round, seat, msg.card, Number(msg.meld));
    else if (msg.t === 'discard' && Array.isArray(msg.card)) discard(round, seat, msg.card);
    else return false;
    return true;
  },

  settle(match) {
    const r = match.round;
    const score = roundScore(r);
    match.scores = match.scores.map((s, team) => s + score[team].points);
    match.history.push({ round: match.roundNo, score, out: r.over.seat ?? null });
  },

  pendingAuto(match) {
    const r = match.round;
    if (!match.seats[r.turn]?.bot) return null;
    // The round's first move waits for the deal.
    return { delay: (r.drawn ? STEP_MS : BOT_DELAY_MS) + (r.seq ? 0 : DEAL_MS), key: `${match.roundNo}:${r.seq}` };
  },

  waitingOn: (match) => ({ seat: match.round.turn, key: `${match.roundNo}:${match.round.seq}` }),

  runAuto(match, rng) {
    const r = match.round;
    const seat = r.turn;
    const move = botMove(r, seat);
    applyMove(r, seat, move);
    if (move.type === 'meld' && isManguangua(match.seats[seat]) && rng() < PLAY_PHRASE_CHANCE) r.lastAction.phrase = true;
  },

  roundView(r, seat, revealed) {
    const mine = seat !== -1 && seat === r.turn;
    return {
      dealer: r.dealer,
      turn: r.over ? null : r.turn,
      drawn: r.drawn,
      stock: r.stock.length,
      discard: r.discard.slice(-3), // the top card and a little of what's under it
      discards: r.discard.length,
      taken: mine ? r.taken : null,
      newCard: mine ? r.newCard : null,
      melds: r.melds,
      melded: r.melded,
      lastAction: r.lastAction,
      over: r.over,
      score: r.over ? roundScore(r) : null,
      hand: seat !== -1 ? r.hands[seat] : null,
      options: options(r, seat),
      hands: revealed ? r.hands : null,
    };
  },
};
