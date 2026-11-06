// Pure round logic for 4-player roba la cochina (40-card Spanish deck). Partners share
// one pile, the cochina, face up so its top card shows. A card lands on the table, and
// then its player has a moment to grab every card of that number from the table, and
// the rivals' whole cochina if its top card matches. Each grab reaches one number further:
// grab a 1 and the 2s are fair game, grab a 2 and so are the 3s. What they don't grab in time stays.
// Four cards on the table, then three deals of 3 cards each empty the deck. The team
// with the bigger cochina wins the round.

import { BOT_DELAY_MS, MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, nextSeat, shuffle, teamOf } from './common.js';
import { HAND_SIZE, NUMBERS, fullDeck, sameCard } from './truco.js';

export const DEALS = 3;
export const TABLE_CARDS = 4;
export const DEAL_PAUSE_MS = 1400; // extra time to see the table or a new hand before the first card
export const CAPTURE_PAUSE_MS = 600; // extra time to see a capture land before the next card

// How fast you have to be. The window opens when your card lands and closes early once
// there is nothing left to grab.
export const GRAB_MS = 3000;
// Bots wait for their card to land on everyone's screen (the flight is 1.2s), then grab
// one thing at a time. Four grabs still fit in the window.
export const BOT_FIRST_GRAB_MS = 1300;
export const BOT_GRAB_MS = 550;
export const BOT_MISS_CHANCE = 0.1; // now and then a bot looks away and misses the rest

/**
 * What these numbers could grab: the table cards of those numbers, and the rivals'
 * cochina. `played` is the card itself, already on the table. Cards are compared by value,
 * since the round goes through JSON between moves.
 */
export function targets(round, seat, nums, played = null) {
  const top = round.piles[1 - teamOf(seat)].at(-1);
  return { taken: round.table.filter((c) => nums.includes(c[0]) && !(played && sameCard(c, played))), steals: nums.includes(top?.[0]) };
}

/**
 * The numbers an open window reaches: the played number, and once something is grabbed,
 * every number up to the one after the highest grabbed (7 is followed by 10).
 */
export function reach(g) {
  const from = NUMBERS.indexOf(g.card[0]);
  const to = g.high == null ? from : Math.min(NUMBERS.indexOf(g.high) + 1, NUMBERS.length - 1);
  return NUMBERS.slice(from, to + 1);
}

const hasTargets = ({ taken, steals }) => taken.length > 0 || steals;

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
    missed: [0, 0], // cards and cochinas each team was too slow to grab
    grab: null, // the window to grab in: { n, seat, card, until, got }
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
  const mine = !round.over && round.turn === seat;
  return { play: mine && !round.grab, grab: mine && !!round.grab };
}

// ---- moves --------------------------------------------------------------------

/** A card goes down on the table. If it matches something, the grab window opens. */
export function play(round, seat, card, now = Date.now()) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  if (round.grab) throw new MoveError('Grab your cards first');
  const hand = round.hands[seat];
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx === -1) throw new MoveError('You do not have that card');
  const [played] = hand.splice(idx, 1);
  round.plays += 1;
  round.seq += 1;
  round.table.push(played);
  const open = hasTargets(targets(round, seat, [played[0]], played));
  round.lastAction = { n: round.seq, type: 'play', seat, card: played, open };
  if (open) round.grab = { n: round.seq, seat, card: played, until: now + GRAB_MS, got: 0, high: null };
  else endTurn(round);
  return round;
}

/**
 * Take one thing: `card`, a table card of a number in reach, or `pile`, the rivals'
 * cochina. The played card goes on top of your cochina with the first thing you take.
 */
export function grab(round, seat, { card, pile }, now = Date.now()) {
  const g = round.grab;
  if (round.over || !g || g.seat !== seat) throw new MoveError('Nothing to grab');
  if (now > g.until) throw new MoveError('Too late');
  const team = teamOf(seat);
  const mine = round.piles[team];
  const { taken, steals } = targets(round, seat, reach(g), g.card);
  let got;
  if (pile) {
    if (!steals) throw new MoveError('That cochina is not yours to steal');
    // Steal the exposed card, not the whole stack. That exposes the next card,
    // which can be stolen too when its rank matches the card that was played.
    got = [round.piles[1 - team].pop()];
    round.steals[team] += 1;
  } else {
    const target = Array.isArray(card) && taken.find((c) => sameCard(c, card));
    if (!target) throw new MoveError('That card does not match');
    round.table = round.table.filter((c) => !sameCard(c, target));
    got = [target];
  }
  if (!g.got) {
    round.table = round.table.filter((c) => !sameCard(c, g.card));
    mine.push(g.card);
  }
  mine.splice(mine.length - 1, 0, ...got); // under the played card, which stays on top
  g.got += 1;
  g.high = Math.max(g.high ?? 0, got[0][0]); // the next number up is in reach now
  round.lastCapture = seat;
  round.seq += 1;
  // Grabbing the last thing ends the window, and this grab stays the last action so the table sees it.
  const closes = !hasTargets(targets(round, seat, reach(g), g.card));
  round.lastAction = { n: round.seq, type: 'grab', seat, cards: pile ? [] : got, stolen: pile ? 1 : 0, first: g.got === 1, closes };
  if (closes) shut(round);
  return round;
}

/** Time is up: whatever is left stays where it is, and the turn moves on. */
export function closeGrab(round) {
  const g = round.grab;
  const { taken, steals } = targets(round, g.seat, reach(g), g.card);
  const missed = taken.length + (steals ? 1 : 0);
  round.missed[teamOf(g.seat)] += missed;
  round.seq += 1;
  round.lastAction = { n: round.seq, type: 'close', seat: g.seat, card: g.card, got: g.got, missed };
  shut(round);
  return round;
}

function shut(round) {
  round.grab = null;
  endTurn(round);
}

function endTurn(round) {
  round.turn = nextSeat(round.turn);
  if (round.hands.every((h) => !h.length)) {
    if (round.deck.length) dealHands(round);
    else finish(round);
  }
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

/** What a card takes if every grab is made: its number, then each next number in sight. */
function haul(round, seat, card) {
  const nums = [card[0]];
  if (!hasTargets(targets(round, seat, nums))) return { taken: [], steals: false };
  const top = round.piles[1 - teamOf(seat)].at(-1);
  for (let i = NUMBERS.indexOf(card[0]) + 1; i < NUMBERS.length; i++) {
    if (!round.table.some((c) => c[0] === NUMBERS[i]) && top?.[0] !== NUMBERS[i]) break;
    nums.push(NUMBERS[i]);
  }
  return targets(round, seat, nums);
}

/**
 * Steal the biggest cochina, take the most, and don't leave our new top card where a
 * rival may hold its number. The bot only looks at its own cards, the table and the tops.
 */
function cardWorth(round, seat, card) {
  const team = teamOf(seat);
  const { taken, steals } = haul(round, seat, card);
  const hand = round.hands[seat];
  // Copies of this number nobody at the table has seen: a rival could steal with one.
  const seen = 1 + taken.filter((c) => c[0] === card[0]).length + hand.filter((c) => c !== card && c[0] === card[0]).length;
  const risk = (4 - seen) / 4;
  if (!taken.length && !steals) {
    // Dropping a card hands its number to the next rival. A twin in hand can win it back.
    const twin = hand.some((c) => c !== card && c[0] === card[0]);
    return -1 - risk + (twin ? 0.5 : 0) - round.piles[team].length * 0.01;
  }
  const after = round.piles[team].length + taken.length + 1 + (steals ? round.piles[1 - team].length : 0);
  return 2 + taken.length * 2 + (steals ? 4 + round.piles[1 - team].length * 2 : 0) - after * risk * 0.4;
}

/** The bot's next move: grab the cochina first (it's worth more), then the table, or play. */
export function botMove(round, seat) {
  if (round.grab) {
    const { taken, steals } = targets(round, seat, reach(round.grab), round.grab.card);
    return steals ? { type: 'grab', pile: true } : { type: 'grab', card: taken[0] };
  }
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
    if (msg.t === 'play' && Array.isArray(msg.card)) play(round, seat, msg.card);
    else if (msg.t === 'grab') grab(round, seat, { card: msg.card, pile: msg.pile === true });
    else return false;
    return true;
  },

  settle(match) {
    const { team, cards } = match.round.over;
    if (team !== null) match.scores[team] += 1;
    match.history.push({ round: match.roundNo, team, cards, steals: match.round.steals });
  },

  pendingAuto(match) {
    const r = match.round;
    const bot = !!match.seats[r.turn]?.bot;
    const key = `${match.roundNo}:${r.seq}:${bot ? 'bot' : 'player'}`;
    // A player's window closes on time; a bot grabs at its own pace.
    if (r.grab) return { delay: bot ? (r.grab.got ? BOT_GRAB_MS : BOT_FIRST_GRAB_MS) : Math.max(r.grab.until - Date.now(), 0), key };
    if (!bot) return null;
    const newDeal = r.hands.every((h) => h.length === HAND_SIZE);
    const la = r.lastAction?.n === r.seq ? r.lastAction : null;
    const captured = la?.type === 'grab' || (la?.type === 'close' && la.got);
    return { delay: BOT_DELAY_MS + (newDeal ? DEAL_PAUSE_MS : 0) + (captured ? CAPTURE_PAUSE_MS : 0), key };
  },

  // A grab window always has a timer, so this is only ever a player choosing a card.
  waitingOn: (match) => ({ seat: match.round.turn, key: `${match.roundNo}:${match.round.seq}` }),

  runAuto(match, rng) {
    const r = match.round;
    const seat = r.turn;
    if (r.grab && !match.seats[seat]?.bot) return void closeGrab(r);
    if (r.grab) {
      if (rng() < BOT_MISS_CHANCE) return void closeGrab(r);
      // The bot's clock is its own pacing, which always fits in the window.
      return void grab(r, seat, botMove(r, seat), r.grab.until);
    }
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
      missed: r.missed,
      // Time left rather than a deadline, so the client's clock doesn't matter.
      // The numbers in reach, which grow as the player grabs.
      grab: r.grab && { n: r.grab.n, seat: r.grab.seat, card: r.grab.card, nums: reach(r.grab), left: Math.max(r.grab.until - Date.now(), 0) },
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
