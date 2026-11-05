// Pure round logic for 4-player roba la cochina (40-card Spanish deck). Partners share
// one pile, the cochina, face up so its top card shows. Playing a card takes the same
// number from the table, and steals the rivals' whole cochina if it matches their top
// card. Four cards on the table, then three deals of 3 cards each empty the deck. The
// team with the bigger cochina wins the round.

import { BOT_DELAY_MS, MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, nextSeat, shuffle, teamOf } from './common.js';
import { HAND_SIZE, fullDeck, sameCard } from './truco.js';

export const DEALS = 3;
export const TABLE_CARDS = 4;
export const DEAL_PAUSE_MS = 1400; // extra time to see the table or a new hand before the first card
export const CAPTURE_PAUSE_MS = 900; // extra time to watch a capture leave the table
export const STEAL_PAUSE_MS = 600; // and a bit more to watch a cochina change hands

/** What a play would do: the table cards of its number, and whether it steals. */
export function takes(round, seat, [n]) {
  const top = round.piles[1 - teamOf(seat)].at(-1);
  return { taken: round.table.filter(([m]) => m === n), steals: top?.[0] === n };
}

// ---- dealing ------------------------------------------------------------------

export function newRound({ dealer = 0, rng = Math.random } = {}) {
  const deck = shuffle(fullDeck(), rng);
  const round = {
    dealer,
    turn: nextSeat(dealer),
    deck,
    table: deck.splice(-TABLE_CARDS),
    hands: [[], [], [], []],
    deal: 0,
    plays: 0,
    piles: [[], []], // each team's cochina, bottom first: the last card is the one that shows
    steals: [0, 0], // times each team stole the other's cochina
    lastCapture: null, // the seat that gets what's left at the end
    leftovers: 0,
    seq: 0, // bumps on every action, identifies the moment for automatic moves
    lastAction: null,
    over: null,
  };
  dealHands(round);
  return round;
}

function dealHands(round) {
  for (let s = 0; s < SEATS; s++) round.hands[s] = round.deck.splice(-HAND_SIZE);
  round.deal += 1;
}

export function options(round, seat) {
  return { play: !round.over && round.turn === seat };
}

// ---- moves --------------------------------------------------------------------

export function play(round, seat, card) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  const hand = round.hands[seat];
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx === -1) throw new MoveError('You do not have that card');
  const [played] = hand.splice(idx, 1);
  round.plays += 1;
  round.seq += 1;

  const team = teamOf(seat);
  const { taken, steals } = takes(round, seat, played);
  const stolen = steals ? round.piles[1 - team].length : 0;
  if (steals) {
    // Their cochina goes on top of ours, so their old top card is gone from view.
    round.piles[team].push(...round.piles[1 - team]);
    round.piles[1 - team] = [];
    round.steals[team] += 1;
  }
  if (taken.length || steals) {
    round.table = round.table.filter((c) => !taken.includes(c));
    round.piles[team].push(...taken, played); // the card you played ends up on top
    round.lastCapture = seat;
  } else round.table.push(played);
  round.lastAction = { n: round.seq, type: 'play', seat, card: played, taken, stolen, steals };

  round.turn = nextSeat(seat);
  if (round.hands.every((h) => !h.length)) {
    if (round.deck.length) dealHands(round);
    else finish(round);
  }
  return round;
}

/** The deck is out: the last capture takes what's left, then the cochinas are compared. */
function finish(round) {
  round.leftovers = round.table.length;
  if (round.lastCapture !== null) {
    // Slipped underneath, so the top card stays the one that was played.
    round.piles[teamOf(round.lastCapture)].unshift(...round.table);
    round.table = [];
  }
  const [a, b] = round.piles.map((p) => p.length);
  round.over = { reason: 'cards', team: a === b ? null : a > b ? 0 : 1, cards: [a, b] };
}

// ---- bot ----------------------------------------------------------------------

/**
 * Steal the biggest cochina, take the most, and don't leave our new top card where a
 * rival may hold its number. The bot only looks at its own cards, the table and the tops.
 */
function cardWorth(round, seat, card) {
  const team = teamOf(seat);
  const { taken, steals } = takes(round, seat, card);
  const hand = round.hands[seat];
  // Copies of this number nobody at the table has seen: a rival could steal with one.
  const seen = 1 + taken.length + hand.filter((c) => c !== card && c[0] === card[0]).length;
  const risk = (4 - seen) / 4;
  if (!taken.length && !steals) {
    // Dropping a card hands its number to the next rival. A twin in hand can win it back.
    const twin = hand.some((c) => c !== card && c[0] === card[0]);
    return -1 - risk + (twin ? 0.5 : 0) - round.piles[team].length * 0.01;
  }
  const after = round.piles[team].length + taken.length + 1 + (steals ? round.piles[1 - team].length : 0);
  return 2 + taken.length * 2 + (steals ? 4 + round.piles[1 - team].length * 2 : 0) - after * risk * 0.4;
}

export function botMove(round, seat) {
  const hand = round.hands[seat];
  return { type: 'play', card: hand.reduce((best, c) => (cardWorth(round, seat, c) > cardWorth(round, seat, best) ? c : best), hand[0]) };
}

export const game = {
  id: 'cochina',
  targets: [1, 3, 5],
  defaultTarget: 3,

  newRound(match, rng) {
    const dealer = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(dealer);
    return newRound({ dealer, rng });
  },

  handle(round, seat, msg) {
    if (msg.t !== 'play' || !Array.isArray(msg.card)) return false;
    play(round, seat, msg.card);
    return true;
  },

  settle(match) {
    const { team, cards } = match.round.over;
    if (team !== null) match.scores[team] += 1;
    match.history.push({ round: match.roundNo, team, cards, steals: match.round.steals });
  },

  pendingAuto(match) {
    const r = match.round;
    if (!match.seats[r.turn]?.bot) return null;
    const newDeal = r.hands.every((h) => h.length === HAND_SIZE);
    const la = r.lastAction?.n === r.seq ? r.lastAction : null;
    const captured = la && (la.taken.length || la.steals);
    return {
      delay: BOT_DELAY_MS + (newDeal ? DEAL_PAUSE_MS : 0) + (captured ? CAPTURE_PAUSE_MS : 0) + (la?.steals ? STEAL_PAUSE_MS : 0),
      key: `${match.roundNo}:${r.seq}`,
    };
  },

  runAuto(match, rng) {
    const r = match.round;
    const seat = r.turn;
    const move = botMove(r, seat);
    const phrase = isManguangua(match.seats[seat]) && rng() < PLAY_PHRASE_CHANCE;
    play(r, seat, move.card);
    if (phrase) r.lastAction.phrase = true;
  },

  roundView(r, seat) {
    return {
      dealer: r.dealer,
      turn: r.over ? null : r.turn,
      table: r.table,
      deal: r.deal,
      plays: r.plays,
      // Only the top of each cochina shows, and how big it is.
      piles: r.piles.map((p) => p.length),
      tops: r.piles.map((p) => p.at(-1) ?? null),
      steals: r.steals,
      leftovers: r.leftovers,
      lastCapture: r.lastCapture,
      lastAction: r.lastAction,
      over: r.over,
      hand: seat !== -1 ? r.hands[seat] : null,
      options: options(r, seat),
      hands: null, // the deck is gone by the end: the result shows the cochinas instead
    };
  },
};
