// Pure round logic for 4-player partner dominoes (double-six set, 7 tiles each,
// no boneyard). Seats 0 & 2 are team 0, seats 1 & 3 are team 1. Play goes
// seat 0 -> 1 -> 2 -> 3.

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

export const HAND_SIZE = 7;
export const AUTO_PASS_DELAY_MS = 1300;
export const STUCK_PLAYER_DELAY_MS = 3000; // long enough to try an illegal tile before the forced pass

export const pips = (tile) => tile[0] + tile[1];
export const sameTile = (a, b) =>
  (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
export const handPips = (hand) => hand.reduce((sum, t) => sum + pips(t), 0);

export function fullSet() {
  const tiles = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push([a, b]);
  return tiles;
}

/**
 * Deal a new round. With no `starter` (first round of a match) whoever holds
 * the double six opens and must play it. Otherwise `starter` opens with any tile.
 */
export function newRound({ starter = null, rng = Math.random } = {}) {
  const deck = shuffle(fullSet(), rng);
  const hands = [];
  for (let s = 0; s < SEATS; s++) hands.push(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE));

  let turn = starter;
  let mustPlay = null;
  if (starter == null) {
    turn = hands.findIndex((h) => h.some((t) => t[0] === 6 && t[1] === 6));
    mustPlay = [6, 6];
  }
  return {
    hands,
    // Tiles in table order, left end to right end. Each tile is oriented so
    // line[i][1] === line[i + 1][0].
    line: [],
    // Index in `line` of the opening tile (it shifts as tiles are added left).
    center: 0,
    turn,
    starter: turn,
    mustPlay,
    lastAction: null,
    over: null,
  };
}

export function boardEnds(round) {
  if (!round.line.length) return null;
  return [round.line[0][0], round.line[round.line.length - 1][1]];
}

export function legalMoves(round, seat) {
  const hand = round.hands[seat];
  const ends = boardEnds(round);
  const moves = [];
  if (!ends) {
    for (const tile of hand) {
      if (round.mustPlay && !sameTile(tile, round.mustPlay)) continue;
      moves.push({ tile, end: 'R' });
    }
    return moves;
  }
  const [left, right] = ends;
  for (const tile of hand) {
    if (tile[0] === left || tile[1] === left) moves.push({ tile, end: 'L' });
    if (tile[0] === right || tile[1] === right) moves.push({ tile, end: 'R' });
  }
  return moves;
}

export function isBlocked(round) {
  for (let s = 0; s < SEATS; s++) if (legalMoves(round, s).length) return false;
  return true;
}

function finishByDomino(round, seat) {
  const tp = teamPips(round);
  const winnerTeam = teamOf(seat);
  round.over = {
    reason: 'domino',
    winnerSeat: seat,
    winnerTeam,
    points: tp[1 - winnerTeam],
    teamPips: tp,
  };
}

function finishByBlock(round) {
  const tp = teamPips(round);
  let winnerTeam = null;
  if (tp[0] < tp[1]) winnerTeam = 0;
  else if (tp[1] < tp[0]) winnerTeam = 1;

  round.over = {
    reason: 'blocked',
    winnerSeat: null,
    winnerTeam,
    points: winnerTeam == null ? 0 : tp[1 - winnerTeam],
    teamPips: tp,
  };
}

export function teamPips(round) {
  const tp = [0, 0];
  round.hands.forEach((h, s) => (tp[teamOf(s)] += handPips(h)));
  return tp;
}

export function play(round, seat, tile, end) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  const hand = round.hands[seat];
  const idx = hand.findIndex((t) => sameTile(t, tile));
  if (idx === -1) throw new MoveError('You do not have that tile');
  const legal = legalMoves(round, seat).some((m) => sameTile(m.tile, tile) && m.end === end);
  if (!legal) throw new MoveError('That tile does not fit there');

  const [a, b] = hand[idx];
  const ends = boardEnds(round);
  if (!ends) {
    round.line.push([a, b]);
    round.center = 0;
  } else if (end === 'L') {
    round.line.unshift(b === ends[0] ? [a, b] : [b, a]);
    round.center += 1;
  } else {
    round.line.push(a === ends[1] ? [a, b] : [b, a]);
  }
  hand.splice(idx, 1);
  round.mustPlay = null;
  round.lastAction = { type: 'play', seat, tile: [a, b], end };

  if (!hand.length) finishByDomino(round, seat);
  else if (isBlocked(round)) finishByBlock(round);
  else round.turn = nextSeat(seat);
  return round;
}

export function pass(round, seat) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat) throw new MoveError('Not your turn');
  if (legalMoves(round, seat).length) throw new MoveError('You have a tile to play');
  round.lastAction = { type: 'pass', seat };
  round.turn = nextSeat(seat);
  return round;
}

/** Simple bot: prefer doubles, then the heaviest tile; play on the shorter arm. */
export function botMove(round, seat) {
  const moves = legalMoves(round, seat);
  if (!moves.length) return null;
  const score = (m) => pips(m.tile) + (m.tile[0] === m.tile[1] ? 4 : 0);
  moves.sort((x, y) => score(y) - score(x));
  const best = moves[0];
  const leftLen = round.center;
  const rightLen = round.line.length - round.center - 1;
  const alt = moves.find((m) => sameTile(m.tile, best.tile) && m.end !== best.end);
  if (alt) {
    const ends = boardEnds(round);
    if (ends && ends[0] === ends[1]) return leftLen < rightLen ? { ...best, end: 'L' } : { ...best, end: 'R' };
  }
  return best;
}

export const game = {
  id: 'domino',
  targets: [50, 75, 100],
  defaultTarget: 100,

  newRound: (match, rng) => newRound({ starter: match.nextStarter, rng }),

  handle(round, seat, msg) {
    if (msg.t !== 'play') return false;
    play(round, seat, msg.tile, msg.end === 'L' ? 'L' : 'R');
    return true;
  },

  settle(match) {
    const { winnerTeam, points, reason, winnerSeat, teamPips } = match.round.over;
    if (winnerTeam != null) match.scores[winnerTeam] += points;
    match.history.push({ round: match.roundNo, reason, winnerTeam, winnerSeat, points, teamPips });
    // The opener rotates to the right every round, whoever won.
    match.nextStarter = nextSeat(match.round.starter);
  },

  // Bots, and humans with no legal move (the forced pass).
  pendingAuto(match) {
    const r = match.round;
    const isBot = match.seats[r.turn]?.bot;
    const stuck = !legalMoves(r, r.turn).length;
    if (!isBot && !stuck) return null;
    return {
      delay: !isBot ? STUCK_PLAYER_DELAY_MS : stuck ? AUTO_PASS_DELAY_MS : BOT_DELAY_MS,
      key: `${match.roundNo}:${r.line.length}:${r.turn}:${r.lastAction?.type ?? ''}`,
    };
  },

  runAuto(match, rng) {
    const r = match.round;
    const move = botMove(r, r.turn);
    const phrase = isManguangua(match.seats[r.turn]) && rng() < (move ? PLAY_PHRASE_CHANCE : TALK_PHRASE_CHANCE);
    if (move) play(r, r.turn, move.tile, move.end);
    else pass(r, r.turn);
    if (phrase) r.lastAction.phrase = true;
  },

  roundView(r, seat, revealed) {
    return {
      line: r.line,
      center: r.center,
      turn: r.over ? null : r.turn,
      mustPlay: r.mustPlay,
      lastAction: r.lastAction,
      over: r.over,
      hand: seat !== -1 ? r.hands[seat] : null,
      legal: seat !== -1 && !r.over && r.turn === seat ? legalMoves(r, seat) : [],
      hands: revealed ? r.hands : null,
    };
  },
};
