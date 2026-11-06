// Pure hand logic for 4-player Venezuelan truco (40-card Spanish deck, 3 cards
// each, one card turned up as the vira). Seats 0 & 2 are team 0, seats 1 & 3 are
// team 1. Play goes seat 0 -> 1 -> 2 -> 3. Cards are [number, suit] with suit one
// of o(ros), c(opas), e(spadas), b(astos).

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

export { MoveError, SEATS, nextSeat, shuffle, teamOf };

export const HAND_SIZE = 3;
export const TRICK_PAUSE_MS = 1400; // extra time to see a finished trick before the next card
export const SUITS = ['o', 'c', 'e', 'b'];
export const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const sameCard = (a, b) => a[0] === b[0] && a[1] === b[1];

// What a hand is worth at each truco level: 0 nobody called, 1 truco, 2 retruco,
// 3 vale nueve, 4 vale juego (the whole game, resolved in settle).
const TRUCO_VALUE = [1, 3, 6, 9];
// What the caller scores when that level is refused.
const REFUSED_VALUE = [null, 1, 3, 6, 9];
const FLOR_POINTS = 3;
const RESERVADA_POINTS = 5;

export function fullDeck() {
  return SUITS.flatMap((s) => NUMBERS.map((n) => [n, s]));
}

// ---- the vira and what it makes of each card ---------------------------------

/** The 11 and 10 of the vira's suit; the 12 stands in if the vira is one of them. */
export function pieces(vira) {
  const [n, s] = vira;
  return { perico: [n === 11 ? 12 : 11, s], perica: [n === 10 ? 12 : 10, s] };
}

/** Trick strength, higher wins. Equal numbers mean the cards tie (parda). */
export function rank(card, vira) {
  const { perico, perica } = pieces(vira);
  if (sameCard(card, perico)) return 100;
  if (sameCard(card, perica)) return 99;
  const [n, s] = card;
  if (n === 1 && s === 'e') return 98;
  if (n === 1 && s === 'b') return 97;
  if (n === 7 && s === 'e') return 96;
  if (n === 7 && s === 'o') return 95;
  if (n === 3) return 90;
  if (n === 2) return 80;
  if (n === 1) return 70;
  if (n === 12) return 60;
  if (n === 11) return 50;
  if (n === 10) return 40;
  if (n === 7) return 30;
  return n * 3; // 6, 5, 4
}

/** Envido and flor value of a single card. */
export function cardPoints(card, vira) {
  const { perico, perica } = pieces(vira);
  if (sameCard(card, perico)) return 30;
  if (sameCard(card, perica)) return 29;
  return card[0] <= 7 ? card[0] : 0;
}

const isPiece = (card, vira) => cardPoints(card, vira) >= 29;

export function envidoValue(cards, vira) {
  const pts = cards.map((c) => cardPoints(c, vira)).sort((a, b) => b - a);
  if (pts[0] >= 29) return pts[0] + (pts[1] >= 29 ? pts[1] % 10 : pts[1]);
  let best = pts[0];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i][1] === cards[j][1]) best = Math.max(best, 20 + cardPoints(cards[i], vira) + cardPoints(cards[j], vira));
    }
  }
  return best;
}

/** null, 'flor' or 'reservada' (perico and perica together). */
export function florType(cards, vira) {
  const rest = cards.filter((c) => !isPiece(c, vira));
  if (rest.length === 1) return 'reservada';
  if (rest.length === 2) return rest[0][1] === rest[1][1] ? 'flor' : null;
  return rest[0][1] === rest[1][1] && rest[1][1] === rest[2][1] ? 'flor' : null;
}

export function florValue(cards, vira) {
  const pts = cards.map((c) => cardPoints(c, vira)).sort((a, b) => b - a);
  if (pts[0] < 29) return 20 + pts[0] + pts[1] + pts[2];
  // With two pieces, only the last digit of the lower one counts (46 at most).
  return pts[0] + (pts[1] >= 29 ? pts[1] % 10 : pts[1]) + pts[2];
}

// ---- dealing ------------------------------------------------------------------

/** Deal a hand. `mano` leads the first trick and wins ties. */
export function newRound({ mano = 0, rng = Math.random } = {}) {
  const deck = shuffle(fullDeck(), rng);
  const hands = [];
  for (let s = 0; s < SEATS; s++) hands.push(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE));
  return {
    vira: deck[SEATS * HAND_SIZE],
    hands,
    dealt: hands.map((h) => h.slice()), // envido and flor count cards already played
    mano,
    turn: mano,
    tricks: [newTrick(mano)],
    truco: { level: 0, owner: null }, // owner: the team allowed to raise next
    envido: null, // { stake, floor, falta, raised, status: 'pending'|'accepted'|'refused', caller }
    flor: [], // seats that sang flor
    pending: null, // bet waiting for an answer: { kind, by, team, level? }
    parked: null, // truco waiting while an envido called in reply to it is settled
    seq: 0, // bumps on every action, identifies the moment for automatic moves
    lastCall: null,
    lastAction: null,
    over: null,
  };
}

function newTrick(leader) {
  return { leader, cards: [], winnerTeam: null, winnerSeat: null };
}

export const currentTrick = (round) => round.tricks[round.tricks.length - 1];

// ---- what a seat may do right now ---------------------------------------------

/** Flor is sung before your first card, on your turn or when answering a bet. */
function florWindow(round, seat) {
  if (round.hands[seat].length !== HAND_SIZE || round.flor.includes(seat)) return false;
  return round.pending ? round.pending.team === teamOf(seat) : round.turn === seat;
}

const canSingFlor = (round, seat) =>
  florWindow(round, seat) && florType(round.dealt[seat], round.vira) === 'flor';

/** Envido is called before your first card, on your turn or in reply to a truco. */
function canOpenEnvido(round, seat) {
  if (round.envido || round.flor.length || round.hands[seat].length !== HAND_SIZE) return false;
  if (!round.pending) return round.turn === seat;
  return round.pending.kind === 'truco' && round.pending.team === teamOf(seat);
}

function envidoRaises(envido) {
  if (envido.falta) return [];
  const raises = ['falta'];
  if (!envido.raised.includes('cinco')) raises.unshift('cinco');
  if (!envido.raised.length) raises.unshift('envido');
  return raises;
}

export function options(round, seat) {
  const opts = { play: false, flor: false, envido: [], truco: 0, mazo: false, answer: false };
  if (round.over || seat < 0) return opts;
  const team = teamOf(seat);
  const p = round.pending;
  if (p) {
    if (p.team !== team) return opts;
    opts.answer = true;
    opts.flor = canSingFlor(round, seat);
    if (p.kind === 'envido') opts.envido = envidoRaises(round.envido);
    else {
      if (canOpenEnvido(round, seat)) opts.envido = ['envido', 'falta'];
      if (p.level < 4) opts.truco = p.level + 1;
    }
    return opts;
  }
  if (round.turn !== seat) return opts;
  opts.play = true;
  opts.mazo = true;
  opts.flor = canSingFlor(round, seat);
  if (canOpenEnvido(round, seat)) opts.envido = ['envido', 'falta'];
  const { level, owner } = round.truco;
  if (level < 4 && (level === 0 || owner === team)) opts.truco = level + 1;
  return opts;
}

// ---- moves --------------------------------------------------------------------

function called(round, seat, what) {
  round.seq += 1;
  round.lastCall = { n: round.seq, seat, what };
}

export function play(round, seat, card) {
  if (round.over) throw new MoveError('Hand is over');
  if (round.pending) throw new MoveError('Answer the bet first');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  const hand = round.hands[seat];
  const idx = hand.findIndex((c) => sameCard(c, card));
  if (idx === -1) throw new MoveError('You do not have that card');
  const [played] = hand.splice(idx, 1);
  const trick = currentTrick(round);
  trick.cards.push({ seat, card: played });
  round.seq += 1;
  round.lastAction = { type: 'play', seat, card: played };
  if (trick.cards.length === SEATS) finishTrick(round, trick);
  else round.turn = nextSeat(seat);
  return round;
}

function finishTrick(round, trick) {
  const best = [-1, -1];
  for (const { seat, card } of trick.cards) best[teamOf(seat)] = Math.max(best[teamOf(seat)], rank(card, round.vira));
  if (best[0] !== best[1]) {
    const team = best[0] > best[1] ? 0 : 1;
    trick.winnerTeam = team;
    trick.winnerSeat = trick.cards.find(({ seat, card }) => teamOf(seat) === team && rank(card, round.vira) === best[team]).seat;
  }
  const winner = handWinner(round);
  if (winner != null) return finish(round, { reason: 'tricks', team: winner, level: round.truco.level });
  // A tied trick is led again by whoever led it.
  const leader = trick.winnerSeat ?? trick.leader;
  round.tricks.push(newTrick(leader));
  round.turn = leader;
}

/** The team that has taken the hand, or null if it is still open. */
function handWinner(round) {
  const [a, b, c] = round.tricks.map((t) => t.winnerTeam);
  const played = round.tricks.length;
  if (played < 2) return null;
  if (played === 2) {
    if (a === null) return b; // first tied: the second decides (null if tied too)
    if (b === null || a === b) return a;
    return null;
  }
  if (c !== null) return c;
  return a ?? teamOf(round.mano); // third tied: first trick won, or the mano
}

function finish(round, over) {
  round.over = over;
  round.pending = null;
  round.parked = null;
}

export function call(round, seat, what) {
  if (round.over) throw new MoveError('Hand is over');
  const opts = options(round, seat);
  switch (what) {
    case 'flor':
      if (!opts.flor) throw new MoveError('You cannot sing flor now');
      round.flor.push(seat);
      // Flor cancels the envido, whatever state it was in.
      if (round.envido) {
        round.envido = null;
        if (round.pending?.kind === 'envido') round.pending = round.parked;
        round.parked = null;
      }
      break;
    case 'envido':
    case 'cinco':
    case 'falta':
      if (!opts.envido.includes(what)) throw new MoveError('You cannot call that now');
      callEnvido(round, seat, what);
      break;
    case 'truco':
      if (!opts.truco) throw new MoveError('You cannot raise now');
      round.pending = { kind: 'truco', by: seat, team: 1 - teamOf(seat), level: opts.truco };
      break;
    case 'mazo':
      if (!opts.mazo) throw new MoveError('You cannot fold now');
      finish(round, { reason: 'mazo', team: 1 - teamOf(seat), level: round.truco.level, seat });
      break;
    default:
      throw new MoveError('Unknown call');
  }
  called(round, seat, what === 'truco' ? `truco${opts.truco}` : what);
  return round;
}

function callEnvido(round, seat, what) {
  const team = teamOf(seat);
  const e = round.envido;
  if (!e) {
    // Called in reply to a truco, the envido goes first and the truco waits.
    if (round.pending) round.parked = round.pending;
    round.envido = {
      stake: what === 'falta' ? null : 2,
      floor: 1, // what the caller scores if it is refused
      falta: what === 'falta',
      raised: [],
      status: 'pending',
      caller: team,
    };
  } else {
    e.floor = e.stake;
    e.caller = team;
    e.raised.push(what);
    if (what === 'falta') e.falta = true;
    else e.stake += what === 'envido' ? 2 : 5;
  }
  round.pending = { kind: 'envido', by: seat, team: 1 - team };
}

export function answer(round, seat, yes) {
  const p = round.pending;
  if (round.over) throw new MoveError('Hand is over');
  if (!p || p.team !== teamOf(seat)) throw new MoveError('Nothing to answer');
  if (p.kind === 'envido') {
    round.envido.status = yes ? 'accepted' : 'refused';
    round.pending = round.parked;
    round.parked = null;
  } else if (yes) {
    round.truco = { level: p.level, owner: p.team };
    round.pending = null;
  } else {
    finish(round, { reason: 'refused', team: teamOf(p.by), level: p.level, seat });
  }
  called(round, seat, yes ? 'quiero' : 'noquiero');
  return round;
}

// ---- scoring ------------------------------------------------------------------

/** First seat from the mano whose value is the highest. */
function bestFromMano(round, seats, valueOf) {
  const order = [0, 1, 2, 3].map((i) => (round.mano + i) % SEATS).filter((s) => seats.includes(s));
  return order.reduce((best, s) => (valueOf(s) > valueOf(best) ? s : best), order[0]);
}

/** The team's flor: a sung one counts, and a reservada counts without being sung. */
function florAward(round) {
  const seats = [0, 1, 2, 3].filter(
    (s) => round.flor.includes(s) || florType(round.dealt[s], round.vira) === 'reservada',
  );
  if (!seats.length) return null;
  const valueOf = (s) => florValue(round.dealt[s], round.vira);
  const winner = bestFromMano(round, seats, valueOf);
  const reservada = florType(round.dealt[winner], round.vira) === 'reservada';
  return {
    kind: reservada ? 'reservada' : 'flor',
    team: teamOf(winner),
    seat: winner,
    points: reservada ? RESERVADA_POINTS : FLOR_POINTS,
    value: valueOf(winner),
  };
}

function envidoAward(round, falta) {
  const e = round.envido;
  if (!e) return null;
  if (e.status === 'refused') return { kind: 'envido', team: e.caller, points: e.floor, refused: true };
  const valueOf = (s) => envidoValue(round.dealt[s], round.vira);
  const winner = bestFromMano(round, [0, 1, 2, 3], valueOf);
  const team = teamOf(winner);
  const rival = bestFromMano(round, [0, 1, 2, 3].filter((s) => teamOf(s) !== team), valueOf);
  return {
    kind: 'envido',
    team,
    seat: winner,
    points: e.falta ? falta : e.stake,
    value: valueOf(winner),
    rivalValue: valueOf(rival),
  };
}

/**
 * Score a finished hand. Flor counts first, then envido, then truco, and nothing
 * more is added once a team reaches the target.
 */
export function settle(round, scores, target) {
  const totals = scores.slice();
  const awards = [];
  const add = (award) => {
    if (!award || totals.some((s) => s >= target)) return;
    totals[award.team] += award.points;
    awards.push(award);
  };
  add(florAward(round));
  add(envidoAward(round, Math.max(target - Math.max(...totals), 1)));
  const { reason, team, level } = round.over;
  const points =
    reason === 'refused'
      ? REFUSED_VALUE[level]
      : level === 4
        ? Math.max(target - totals[team], 1)
        : TRUCO_VALUE[level];
  add({ kind: 'truco', team, points, reason, level });
  return { scores: totals, awards };
}

// ---- bot ----------------------------------------------------------------------

/** Rough worth of what the seat still holds, plus the tricks its team has won. */
function handStrength(round, seat) {
  const team = teamOf(seat);
  const won = round.tricks.filter((t) => t.winnerTeam === team).length;
  const lost = round.tricks.filter((t) => t.winnerTeam === 1 - team).length;
  const cards = round.hands[seat].reduce((sum, c) => {
    const r = rank(c, round.vira);
    return sum + (r >= 95 ? 1.5 : r >= 90 ? 1 : r >= 80 ? 0.6 : r >= 70 ? 0.3 : 0);
  }, 0);
  return cards + won * 1.5 - lost;
}

function botAnswer(round, seat, rng) {
  const p = round.pending;
  if (p.kind === 'envido') {
    const value = envidoValue(round.dealt[seat], round.vira);
    const raises = envidoRaises(round.envido);
    if (value >= 36 && raises.includes('falta')) return { type: 'call', what: 'falta' };
    if (value >= 33 && raises.includes('envido')) return { type: 'call', what: 'envido' };
    return { type: 'answer', yes: value >= (round.envido.falta ? 31 : 27) };
  }
  const strength = handStrength(round, seat);
  const opts = options(round, seat);
  const value = envidoValue(round.dealt[seat], round.vira);
  if (opts.envido.includes('envido') && value >= 29) return { type: 'call', what: 'envido' };
  if (opts.truco && strength >= 2.6 + p.level * 0.5) return { type: 'call', what: 'truco' };
  const bluff = rng() < 0.15;
  return { type: 'answer', yes: bluff || strength >= 0.9 + p.level * 0.3 };
}

function botCard(round, seat) {
  const byRank = round.hands[seat].slice().sort((a, b) => rank(a, round.vira) - rank(b, round.vira));
  const trick = currentTrick(round);
  if (!trick.cards.length) {
    // Lead strong to close out a hand already started, otherwise keep the best back.
    return round.tricks.length > 1 ? byRank[byRank.length - 1] : byRank[Math.floor(byRank.length / 2)];
  }
  const team = teamOf(seat);
  const bestOf = (t) =>
    Math.max(-1, ...trick.cards.filter((c) => teamOf(c.seat) === t).map((c) => rank(c.card, round.vira)));
  if (bestOf(team) > bestOf(1 - team)) return byRank[0];
  return byRank.find((c) => rank(c, round.vira) > bestOf(1 - team)) ?? byRank[0];
}

/** The bot only looks at its own cards and the table. */
export function botMove(round, seat, rng = Math.random) {
  const opts = options(round, seat);
  if (opts.flor) return { type: 'call', what: 'flor' };
  if (opts.answer) return botAnswer(round, seat, rng);
  if (opts.envido.length) {
    const value = envidoValue(round.dealt[seat], round.vira);
    if (value >= 29 && rng() < 0.85) return { type: 'call', what: value >= 35 ? 'falta' : 'envido' };
  }
  if (opts.truco) {
    const strength = handStrength(round, seat);
    const wants = strength >= 2 + round.truco.level * 0.6 && rng() < 0.7;
    if (wants || rng() < 0.04) return { type: 'call', what: 'truco' };
  }
  return { type: 'play', card: botCard(round, seat) };
}

export function applyMove(round, seat, move) {
  if (move.type === 'play') return play(round, seat, move.card);
  if (move.type === 'answer') return answer(round, seat, move.yes);
  return call(round, seat, move.what);
}

/** The bot that should act now, if any. A human on the team answers its bets. */
export function botActor(match) {
  const r = match.round;
  if (r.pending) {
    const team = [0, 1, 2, 3].filter((s) => teamOf(s) === r.pending.team);
    return team.every((s) => match.seats[s]?.bot) ? nextSeat(r.pending.by) : null;
  }
  return match.seats[r.turn]?.bot ? r.turn : null;
}

export const game = {
  id: 'truco',
  targets: [12, 24, 32],
  defaultTarget: 24,

  newRound(match, rng) {
    const mano = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(mano);
    return newRound({ mano, rng });
  },

  handle(round, seat, msg) {
    if (msg.t === 'play' && Array.isArray(msg.card)) play(round, seat, msg.card);
    else if (msg.t === 'call') call(round, seat, msg.what);
    else if (msg.t === 'answer') answer(round, seat, !!msg.yes);
    else return false;
    return true;
  },

  settle(match) {
    const { scores, awards } = settle(match.round, match.scores, match.target);
    match.scores = scores;
    match.round.awards = awards;
    match.history.push({ round: match.roundNo, awards });
  },

  pendingAuto(match) {
    if (botActor(match) == null) return null;
    const r = match.round;
    const trickJustEnded = r.tricks.length > 1 && !currentTrick(r).cards.length;
    return {
      delay: BOT_DELAY_MS + (trickJustEnded && !r.pending ? TRICK_PAUSE_MS : 0),
      key: `${match.roundNo}:${r.seq}`,
    };
  },

  waitingOn(match) {
    const r = match.round;
    const seat = r.pending ? [nextSeat(r.pending.by), nextSeat(r.pending.by + 2)].find((s) => !match.seats[s]?.bot) : r.turn;
    return { seat, key: `${match.roundNo}:${r.seq}` };
  },

  runAuto(match, rng) {
    const r = match.round;
    const seat = botActor(match);
    const move = botMove(r, seat, rng);
    const phrase = isManguangua(match.seats[seat]) && rng() < (move.type === 'play' ? PLAY_PHRASE_CHANCE : TALK_PHRASE_CHANCE);
    applyMove(r, seat, move);
    if (phrase) (move.type === 'play' ? r.lastAction : r.lastCall).phrase = true;
  },

  roundView(r, seat, revealed) {
    return {
      vira: r.vira,
      pieces: pieces(r.vira),
      mano: r.mano,
      turn: r.over ? null : r.turn,
      tricks: r.tricks,
      truco: r.truco,
      // The envido's result stays hidden until the hand ends.
      envido: r.envido && { status: r.envido.status, stake: r.envido.stake, falta: r.envido.falta },
      flor: r.flor,
      pending: r.pending,
      lastCall: r.lastCall,
      lastAction: r.lastAction,
      over: r.over,
      awards: r.awards ?? null,
      hand: seat !== -1 ? r.hands[seat] : null,
      options: options(r, seat),
      hands: revealed ? r.dealt : null,
    };
  },
};
