// Pure round logic for 4-player parchís in pairs (one die or two, 68 squares). Seats are colors:
// 0 yellow, 1 blue, 2 red, 3 green, so partners sit across. A piece's position is how far
// it has come from its own start, which makes every color's route the same numbers.

import { MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, nextSeat, teamOf } from './common.js';

export const PIECES = 4;
export const NEST = -1;
export const START = 0;
export const ENTRY = 63; // the last shared square of a color's route
export const GOAL = 71; // ENTRY + 7 squares of its own corridor + the goal itself
const RING = 68;
const COLOR_GAP = 17; // squares between one color's start and the next
const FIRST_START = 4; // square 5, counting from 0

// The house rules that vary most from table to table.
const LEAVE_ON = 5;
const SIX = 6;
const SIX_WHEN_ALL_OUT = 7;
const REPEATS_LIMIT = 3; // sixes with one die, doubles with two
const CAPTURE_BONUS = 20;
const GOAL_BONUS = 10;

// Squares 5, 12, 17 and the same three on each of the other arms.
const SAFE = new Set([0, 1, 2, 3].flatMap((c) => [4, 11, 16].map((s) => s + c * COLOR_GAP)));

export const ROLL_DELAY_MS = 800;
export const MOVE_DELAY_MS = 1000; // the die tumbling, plus a look at the result
export const PASS_PAUSE_MS = 600; // extra time to see a roll that couldn't be played
const HOP_MS = 120; // the client's hop per square
const MAX_HOP_MS = 1400;

export const ringOf = (color, pos) => (FIRST_START + color * COLOR_GAP + pos) % RING;
export const isSafe = (ring) => SAFE.has(ring);
const partnerOf = (color) => (color + 2) % SEATS;
const allHome = (round, color) => round.pieces[color].every((p) => p === GOAL);

// ---- the board -----------------------------------------------------------------

/** A square anyone can stand on: the ring is shared, a corridor belongs to its color. */
const cellOf = (color, pos) => {
  if (pos === NEST || pos === GOAL) return null;
  return pos <= ENTRY ? `r${ringOf(color, pos)}` : `c${color}:${pos}`;
};

function occupants(round, cell) {
  const out = [];
  round.pieces.forEach((pieces, color) =>
    pieces.forEach((pos, piece) => {
      if (cellOf(color, pos) === cell) out.push({ color, piece });
    }),
  );
  return out;
}

const isBarrier = (occ) => occ.length === 2 && occ[0].color === occ[1].color;

/** Where a piece ends up with these steps and who it sends home, or null if it can't go. */
function target(round, color, piece, steps) {
  const from = round.pieces[color][piece];
  if (from === GOAL) return null;
  const rivals = (occ) => occ.filter((o) => teamOf(o.color) !== teamOf(color));

  if (from === NEST) {
    if (steps !== LEAVE_ON) return null;
    const occ = occupants(round, cellOf(color, START));
    if (occ.length < 2) return { to: START, victim: null };
    // A full start square: leaving takes the rival that got there last.
    const victim = rivals(occ).sort((a, b) => round.arrived[b.color][b.piece] - round.arrived[a.color][a.piece])[0];
    return victim ? { to: START, victim } : null;
  }

  const to = from + steps;
  if (to > GOAL) return null;
  for (let pos = from + 1; pos <= to; pos++) {
    const cell = cellOf(color, pos);
    if (cell && isBarrier(occupants(round, cell))) return null;
  }
  if (to === GOAL) return { to, victim: null };
  const occ = occupants(round, cellOf(color, to));
  if (occ.length >= 2) return null;
  const onRing = to <= ENTRY;
  const victim = onRing && !isSafe(ringOf(color, to)) ? rivals(occ)[0] ?? null : null;
  return { to, victim };
}

/** Whose pieces this seat moves: their own, or their partner's once theirs are all home. */
const colorFor = (round, seat) => (allHome(round, seat) ? partnerOf(seat) : seat);

const isDie = (steps) => steps <= SIX_WHEN_ALL_OUT; // anything more is a bonus

/** Every move the steps still pending allow. `uses` says which of them a move spends. */
export function legalMoves(round, seat) {
  if (round.over || !round.pending.length) return [];
  const color = colorFor(round, seat);
  const moves = [];
  const addMoves = (steps, uses, fits = () => true) =>
    round.pieces[color].forEach((from, piece) => {
      const t = fits(from) && target(round, color, piece, steps);
      if (t) moves.push({ color, piece, from, to: t.to, captures: !!t.victim, uses });
    });
  for (const steps of new Set(round.pending)) addMoves(steps, [steps]);
  // Two dice adding up to 5 bring a piece out between them.
  const dice = round.pending.filter(isDie);
  if (dice.length === 2 && dice[0] + dice[1] === LEAVE_ON) addMoves(LEAVE_ON, dice, (from) => from === NEST);
  // A 5 has to bring a piece out if one can come out.
  const leaving = moves.filter((m) => m.from === NEST);
  if (leaving.length) return leaving;
  // The roll that goes again (a 6, or a double) has to open a barrier if one can open.
  if (round.again) {
    const opening = moves.filter((m) => {
      const cell = cellOf(color, m.from);
      return isDie(m.uses[0]) && cell && isBarrier(occupants(round, cell));
    });
    if (opening.length) return opening;
  }
  return moves;
}

// ---- dealing ------------------------------------------------------------------

export function newRound({ starter = 0, dice = 1 } = {}) {
  return {
    starter,
    dice,
    turn: starter,
    stage: 'roll', // roll | move
    pieces: Array.from({ length: SEATS }, () => Array(PIECES).fill(NEST)),
    arrived: Array.from({ length: SEATS }, () => Array(PIECES).fill(0)), // when each piece reached its square
    pending: [], // steps still to be moved this turn: the dice, then any bonuses
    again: false, // this roll goes again: a 6, or a double
    repeats: 0, // rolls in a row that went again
    lastMoved: null, // the piece the third one sends home: { color, piece }
    captures: [0, 0],
    seq: 0, // bumps on every action, identifies the moment for automatic moves
    lastRoll: null,
    lastAction: null,
    over: null,
  };
}

// ---- what a seat may do right now ---------------------------------------------

export function options(round, seat) {
  const mine = !round.over && round.turn === seat;
  return {
    roll: mine && round.stage === 'roll',
    moves: mine && round.stage === 'move' ? legalMoves(round, seat) : [],
  };
}

// ---- moves --------------------------------------------------------------------

function endTurn(round) {
  round.turn = nextSeat(round.turn);
  round.stage = 'roll';
  round.pending = [];
  round.again = false;
  round.repeats = 0;
  round.lastMoved = null;
}

/** Steps no piece can use are lost, then wait for a move, another roll, or the next player. */
function advance(round) {
  if (!legalMoves(round, round.turn).length) round.pending = [];
  if (round.pending.length) round.stage = 'move';
  else if (round.again) {
    round.again = false;
    round.stage = 'roll';
  } else endTurn(round);
}

export function roll(round, seat, rng = Math.random) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat || round.stage !== 'roll') throw new MoveError('Not your turn');
  const values = Array.from({ length: round.dice }, () => 1 + Math.floor(rng() * 6));
  const again = round.dice === 1 ? values[0] === SIX : values[0] === values[1];
  round.seq += 1;
  round.repeats = again ? round.repeats + 1 : 0;
  round.lastRoll = { n: round.seq, seat, values, passed: false, penalty: false };

  if (round.repeats === REPEATS_LIMIT) {
    round.lastRoll.penalty = true;
    const last = round.lastMoved;
    // A piece already in its corridor is out of danger.
    if (last && round.pieces[last.color][last.piece] <= ENTRY) {
      const from = round.pieces[last.color][last.piece];
      round.pieces[last.color][last.piece] = NEST;
      round.lastAction = { n: round.seq, type: 'penalty', seat, ...last, from, to: NEST };
    }
    endTurn(round);
    return round;
  }

  const allOut = !round.pieces[colorFor(round, seat)].includes(NEST);
  round.again = again;
  // A 6 only counts 7 with one die: with two, doubles take over from sixes.
  round.pending = round.dice === 1 && again && allOut ? [SIX_WHEN_ALL_OUT] : values;
  advance(round);
  round.lastRoll.passed = round.turn !== seat || round.stage === 'roll';
  return round;
}

/** `steps` picks which pending steps to use; without it, the first that fits. */
export function move(round, seat, color, piece, steps) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat || round.stage !== 'move') throw new MoveError('Not your turn');
  const found = legalMoves(round, seat).find((m) => m.color === color && m.piece === piece && (steps === undefined || m.uses.includes(steps)));
  if (!found) throw new MoveError('That piece cannot move');
  const { to, victim } = target(round, color, piece, found.uses.reduce((sum, n) => sum + n, 0));
  const from = round.pieces[color][piece];

  round.seq += 1;
  for (const n of found.uses) round.pending.splice(round.pending.indexOf(n), 1);
  round.pieces[color][piece] = to;
  round.arrived[color][piece] = round.seq;
  round.lastMoved = { color, piece };
  let captured = null;
  if (victim) {
    captured = { ...victim, from: round.pieces[victim.color][victim.piece] };
    round.pieces[victim.color][victim.piece] = NEST;
    round.captures[teamOf(seat)] += 1;
    round.pending.push(CAPTURE_BONUS);
  }
  if (to === GOAL) round.pending.push(GOAL_BONUS);
  round.lastAction = { n: round.seq, type: 'move', seat, color, piece, from, to, captured };

  if (allHome(round, color) && allHome(round, partnerOf(color))) {
    round.over = { team: teamOf(color) };
    round.pending = [];
    return round;
  }
  advance(round);
  return round;
}

// ---- bot ----------------------------------------------------------------------

/** How many rivals could land on this ring square with a die. */
function threats(round, color, ring) {
  let n = 0;
  round.pieces.forEach((pieces, c) => {
    if (teamOf(c) === teamOf(color)) return;
    for (const pos of pieces) {
      if (pos < START || pos > ENTRY) continue;
      const gap = (ring - ringOf(c, pos) + RING) % RING;
      if (gap >= 1 && gap <= SIX_WHEN_ALL_OUT && pos + gap <= ENTRY) n += 1;
    }
  });
  return n;
}

function moveWorth(round, { color, piece, from, to, captures }) {
  let worth = to / 20;
  if (captures) worth += 100;
  if (to === GOAL) worth += 60;
  else if (to > ENTRY) worth += 25; // in the corridor nobody can touch it
  if (from === NEST) worth += 40;
  if (to <= ENTRY) {
    const ring = ringOf(color, to);
    if (isSafe(ring)) worth += 20;
    else worth -= 12 * threats(round, color, ring);
    if (occupants(round, cellOf(color, to)).some((o) => o.color === color && o.piece !== piece)) worth += 12;
  }
  if (from >= START && from <= ENTRY) {
    const ring = ringOf(color, from);
    if (!isSafe(ring)) worth += 10 * threats(round, color, ring); // run away
    else worth -= 8;
  }
  return worth;
}

export function botMove(round, seat) {
  if (round.stage === 'roll') return { type: 'roll' };
  const moves = legalMoves(round, seat);
  const best = moves.reduce((a, b) => (moveWorth(round, b) > moveWorth(round, a) ? b : a), moves[0]);
  return { type: 'move', color: best.color, piece: best.piece, steps: best.uses[0] };
}

export function applyMove(round, seat, m, rng = Math.random) {
  if (m.type === 'roll') return roll(round, seat, rng);
  return move(round, seat, m.color, m.piece, m.steps);
}

export const hopTime = (from, to) => Math.min((from === NEST || to === NEST ? 1 : to - from) * HOP_MS, MAX_HOP_MS);

export const game = {
  id: 'parchis',
  targets: [1, 2, 3], // games won: one takes a while
  defaultTarget: 1,
  variants: [1, 2], // how many dice
  defaultVariant: 2,

  newRound(match, rng) {
    const starter = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(starter);
    return newRound({ starter, dice: match.variant });
  },

  handle(round, seat, msg) {
    if (msg.t === 'roll') roll(round, seat);
    else if (msg.t === 'move') move(round, seat, msg.color, msg.piece, msg.steps);
    else return false;
    return true;
  },

  settle(match) {
    const r = match.round;
    match.scores[r.over.team] += 1;
    match.history.push({ round: match.roundNo, team: r.over.team, captures: r.captures });
  },

  pendingAuto(match) {
    const r = match.round;
    if (!match.seats[r.turn]?.bot) return null;
    const la = r.lastAction?.n === r.seq ? r.lastAction : null;
    const passed = r.lastRoll?.n === r.seq && r.lastRoll.passed;
    return {
      delay: (r.stage === 'roll' ? ROLL_DELAY_MS : MOVE_DELAY_MS) + (la ? hopTime(la.from, la.to) : 0) + (passed ? PASS_PAUSE_MS : 0),
      key: `${match.roundNo}:${r.seq}`,
    };
  },

  runAuto(match, rng) {
    const r = match.round;
    const seat = r.turn;
    const m = botMove(r, seat);
    const phrase = m.type === 'move' && isManguangua(match.seats[seat]) && rng() < PLAY_PHRASE_CHANCE;
    applyMove(r, seat, m, rng);
    if (phrase) r.lastAction.phrase = true;
  },

  roundView(r, seat) {
    return {
      starter: r.starter,
      dice: r.dice,
      turn: r.over ? null : r.turn,
      stage: r.stage,
      pieces: r.pieces,
      pending: r.pending,
      captures: r.captures,
      seq: r.seq,
      lastRoll: r.lastRoll,
      lastAction: r.lastAction,
      over: r.over,
      hand: seat !== -1 ? [] : null, // no hand to hold: the pieces are all on the board
      options: options(r, seat),
      hands: null,
    };
  },
};
