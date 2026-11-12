// All Fives (Muggins) in partners: the domino game, scored as you play. After each tile,
// if the two ends of the line add up to a multiple of 5, the player's team scores that
// sum. A double on an end counts both halves. Going out, or the lower count in a blocked
// game, scores the other team's pips rounded to the nearest 5. Points land as they
// happen, and the first team to the target wins on the spot. No spinner: the line has
// two ends, as in dominoes.

import { MoveError, isManguangua, PLAY_PHRASE_CHANCE, TALK_PHRASE_CHANCE, nextSeat, teamOf } from './common.js';
import * as domino from './domino.js';

export const { legalMoves, pass, pips, sameTile, teamPips } = domino;

/** The nearest multiple of 5: 7 is 5, 8 is 10. */
export const roundToFive = (n) => Math.round(n / 5) * 5;

const endValue = (tile, half) => (tile[0] === tile[1] ? 2 * half : half);

/** What the open ends add up to. A lone opening tile counts its pips once. */
export function endsCount(line) {
  if (!line.length) return 0;
  if (line.length === 1) return pips(line[0]);
  const l = line[0];
  const r = line[line.length - 1];
  return endValue(l, l[0]) + endValue(r, r[1]);
}

/** What scores for a count on the ends: the count if it's a multiple of 5. */
export const scoreFor = (count) => (count > 0 && count % 5 === 0 ? count : 0);

/** The line as it would be after `move`, without changing the round. */
export function lineAfter(line, { tile: [a, b], end }) {
  if (!line.length) return [[a, b]];
  if (end === 'L') return [b === line[0][0] ? [a, b] : [b, a], ...line];
  return [...line, a === line[line.length - 1][1] ? [a, b] : [b, a]];
}

export function newRound({ starter = null, scores = [0, 0], target = 150, rng = Math.random } = {}) {
  return {
    ...domino.newRound({ starter, rng }),
    points: [0, 0], // what each team scored this round, on the ends and then for going out
    base: scores.slice(), // the match's scores when the round was dealt
    target,
  };
}

const reached = (round, team) => round.base[team] + round.points[team] >= round.target;

export function play(round, seat, tile, end) {
  domino.play(round, seat, tile, end);
  const team = teamOf(seat);
  const points = scoreFor(endsCount(round.line));
  round.points[team] += points;
  round.lastAction.points = points;

  if (round.over) {
    // Out or blocked: the winners also take the other team's pips, to the nearest 5.
    const o = round.over;
    o.bonus = o.winnerTeam == null ? 0 : roundToFive(o.points);
    if (o.winnerTeam != null) round.points[o.winnerTeam] += o.bonus;
  } else if (points && reached(round, team)) {
    round.over = { reason: 'target', winnerSeat: seat, winnerTeam: team, bonus: 0, teamPips: teamPips(round) };
  }
  return round;
}

/** Score the most now; among equal plays, fall back on the domino bot's taste. */
export function botMove(round, seat) {
  const moves = legalMoves(round, seat);
  if (!moves.length) return null;
  const fallback = domino.botMove(round, seat);
  let best = fallback;
  let bestPoints = scoreFor(endsCount(lineAfter(round.line, fallback)));
  for (const m of moves) {
    const p = scoreFor(endsCount(lineAfter(round.line, m)));
    if (p > bestPoints) [best, bestPoints] = [m, p];
  }
  return best;
}

export const game = {
  id: 'fives',
  targets: [100, 150, 250],
  defaultTarget: 150,

  newRound: (match, rng) => newRound({ starter: match.nextStarter, scores: match.scores, target: match.target, rng }),

  handle(round, seat, msg) {
    if (msg.t !== 'play') return false;
    if (!Array.isArray(msg.tile)) throw new MoveError('You do not have that tile');
    play(round, seat, msg.tile, msg.end === 'L' ? 'L' : 'R');
    return true;
  },

  settle(match) {
    const r = match.round;
    const { reason, winnerTeam, winnerSeat, bonus, teamPips } = r.over;
    match.scores = match.scores.map((s, team) => s + r.points[team]);
    match.history.push({ round: match.roundNo, reason, winnerTeam, winnerSeat, bonus, teamPips, gained: r.points.slice() });
    match.nextStarter = nextSeat(r.starter);
  },

  // The same pace as dominoes: bots, and the forced pass of a human with nothing to play.
  pendingAuto: domino.game.pendingAuto,
  waitingOn: domino.game.waitingOn,

  runAuto(match, rng) {
    const r = match.round;
    const move = botMove(r, r.turn);
    const phrase = isManguangua(match.seats[r.turn]) && rng() < (move ? PLAY_PHRASE_CHANCE : TALK_PHRASE_CHANCE);
    if (move) play(r, r.turn, move.tile, move.end);
    else pass(r, r.turn);
    if (phrase) r.lastAction.phrase = true;
  },

  roundView(r, seat, revealed) {
    return { ...domino.game.roundView(r, seat, revealed), points: r.points };
  },
};
