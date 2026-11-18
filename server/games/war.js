// Pure round logic for War in pairs (one 52-card French deck, aces high). Everyone gets 13
// cards face down and nobody looks at them. In a battle all four turn up their top card at
// once, and the highest card takes all four for its team. When the highest card is tied
// between the teams, it's war: the tied players lay one card face down and turn up another,
// until one team's card is highest. The team that takes more cards wins the round.

import { DEAL_MS, MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, nextSeat, shuffle, teamOf } from './common.js';
import { fullDeck } from './rummy.js';

export const HAND_SIZE = 13;
export const ACE = 14; // aces beat kings

// The cards stay up a moment once a battle is decided, so everyone sees who took it.
// The last card can still be in the air (the flight is 1.2s).
export const COLLECT_MS = 2200;
// Bots turn their card a beat after a battle opens, then one after the other.
export const BOT_OPEN_MS = 900;
export const BOT_NEXT_MS = 350;
export const WAR_PAUSE_MS = 1400; // the table shouts ¡Guerra! first
export const SLOW_MS = 15_000; // a battle waits on everyone, so a slow player is mocked sooner

export const rankOf = ([n]) => (n === 1 ? ACE : n);

// ---- dealing ------------------------------------------------------------------

export function newRound({ dealer = 0, rng = Math.random } = {}) {
  const deck = shuffle(fullDeck(), rng);
  const hands = [[], [], [], []];
  for (let s = 0; s < SEATS; s++) hands[s] = deck.splice(-HAND_SIZE);
  const round = {
    dealer,
    hands, // face down, the last card is the one turned next
    table: [[], [], [], []], // each seat's cards in this battle, in order: { card, up }
    fighting: [], // the seats in this battle, or in the war going on in it
    toFlip: [], // those still to turn a card
    war: 0, // how many wars deep this battle is
    result: null, // the battle is decided and its cards wait to be taken: { team (null: nobody), seat }
    won: [0, 0], // cards each team has taken
    wars: [0, 0], // wars each team has won
    lost: 0, // cards of wars nobody could finish
    battles: 0,
    seq: 0, // bumps on every action, identifies the moment for automatic moves
    lastAction: null,
    over: null,
  };
  openBattle(round);
  return round;
}

/** Everyone with cards left turns one up. */
function openBattle(round) {
  round.fighting = [0, 1, 2, 3].filter((s) => round.hands[s].length);
  round.toFlip = round.fighting.slice();
  round.war = 0;
}

export function options(round, seat) {
  return { flip: !round.over && !round.result && round.toFlip.includes(seat) };
}

// ---- moves --------------------------------------------------------------------

/** Turn your top card up. In a war, one goes face down first, unless it's your last. */
export function flip(round, seat) {
  if (round.over) throw new MoveError('Round is over');
  if (round.result) throw new MoveError('Wait for the cards to be taken');
  if (!round.toFlip.includes(seat)) throw new MoveError(round.fighting.includes(seat) ? 'You already turned your card' : 'You are not in this war');
  const hand = round.hands[seat];
  const down = round.war > 0 && hand.length > 1;
  if (down) round.table[seat].push({ card: hand.pop(), up: false });
  const card = hand.pop();
  round.table[seat].push({ card, up: true });
  round.toFlip = round.toFlip.filter((s) => s !== seat);
  round.seq += 1;
  round.lastAction = { n: round.seq, type: 'flip', seat, card, down };
  if (!round.toFlip.length) decide(round);
  return round;
}

/** The card a seat is fighting with: its last one turned up. */
export const topCard = (round, seat) => round.table[seat].findLast((c) => c.up)?.card ?? null;

/** Everyone has turned: the highest card takes the battle, or a tie between the teams goes to war. */
function decide(round) {
  const best = Math.max(...round.fighting.map((s) => rankOf(topCard(round, s))));
  const leaders = round.fighting.filter((s) => rankOf(topCard(round, s)) === best);
  const teams = new Set(leaders.map(teamOf));
  if (teams.size === 1) return settleBattle(round, leaders[0]);
  // Only the tied players fight on, and only with cards left to fight with.
  const able = leaders.filter((s) => round.hands[s].length);
  const still = new Set(able.map(teamOf));
  if (still.size === 2) {
    round.war += 1;
    round.fighting = able;
    round.toFlip = able.slice();
    round.lastAction = { n: round.seq, type: 'war', seats: leaders, rank: best, war: round.war };
    return;
  }
  // One side ran out of cards mid-war: the other takes it, or nobody does.
  settleBattle(round, able.length ? able[0] : null, leaders);
}

function settleBattle(round, seat, tied = null) {
  const team = seat === null ? null : teamOf(seat);
  const cards = round.table.reduce((n, stack) => n + stack.length, 0);
  round.result = { team, seat, cards, war: round.war, ...(tied && { tied }) };
  round.lastAction = { n: round.seq, type: 'win', ...round.result };
}

/** The decided battle's cards go to the team that took them, and the next battle opens. */
export function collect(round) {
  const { team, seat, cards, war } = round.result;
  if (team === null) round.lost += cards;
  else {
    round.won[team] += cards;
    if (war) round.wars[team] += 1;
  }
  round.table = [[], [], [], []];
  round.result = null;
  round.battles += 1;
  round.seq += 1;
  round.lastAction = { n: round.seq, type: 'collect', team, seat, cards };
  openBattle(round);
  if (!round.fighting.length) finish(round);
  return round;
}

function finish(round) {
  const [a, b] = round.won;
  round.toFlip = [];
  round.over = { reason: 'cards', team: a === b ? null : a > b ? 0 : 1, cards: [a, b] };
}

export const game = {
  id: 'war',
  targets: [1, 3, 5],
  defaultTarget: 3,
  slowTurnMs: SLOW_MS,

  newRound(match, rng) {
    const dealer = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(dealer);
    return newRound({ dealer, rng });
  },

  handle(round, seat, msg) {
    if (msg.t !== 'flip') return false;
    flip(round, seat);
    return true;
  },

  settle(match) {
    const { team, cards } = match.round.over;
    if (team !== null) match.scores[team] += 1;
    match.history.push({ round: match.roundNo, team, cards, wars: match.round.wars });
  },

  pendingAuto(match) {
    const r = match.round;
    if (r.result) return { delay: COLLECT_MS, key: `${match.roundNo}:${r.seq}:collect` };
    const bot = r.toFlip.find((s) => match.seats[s]?.bot);
    if (bot === undefined) return null;
    const la = r.lastAction;
    let delay = BOT_NEXT_MS;
    if (!la) delay = DEAL_MS + BOT_OPEN_MS; // the round's first battle waits for the deal
    else if (la.type === 'war') delay = WAR_PAUSE_MS;
    else if (la.type === 'collect') delay = BOT_OPEN_MS;
    return { delay, key: `${match.roundNo}:${r.seq}:${bot}` };
  },

  // A battle waits on everyone; the slow one is the first human still to turn a card.
  waitingOn: (match) => {
    const r = match.round;
    const seat = r.toFlip.find((s) => !match.seats[s]?.bot) ?? r.toFlip[0];
    return { seat, key: `${match.roundNo}:${r.seq}` };
  },

  runAuto(match, rng) {
    const r = match.round;
    if (r.result) return void collect(r);
    const seat = r.toFlip.find((s) => match.seats[s]?.bot);
    const phrase = isManguangua(match.seats[seat]) && rng() < PLAY_PHRASE_CHANCE;
    flip(r, seat);
    if (phrase) r.lastAction.phrase = true;
  },

  roundView(r, seat) {
    return {
      dealer: r.dealer,
      turn: null, // everyone turns at once
      // Face-down cards stay secret until the round is over.
      table: r.table.map((stack) => stack.map((c) => (c.up ? c.card : null))),
      fighting: r.fighting,
      toFlip: r.toFlip,
      war: r.war,
      result: r.result,
      won: r.won,
      wars: r.wars,
      lost: r.lost,
      battles: r.battles,
      lastAction: r.lastAction,
      over: r.over,
      hand: seat !== -1 ? r.hands[seat].length : null, // nobody looks at their own cards, only how many are left
      options: options(r, seat),
      hands: null, // every card is played by the end
    };
  },
};
