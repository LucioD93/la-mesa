// All Fives for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as fives from './fives.js';
import * as domino from './domino.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r) {
  const move = fives.botMove(r, r.turn);
  if (move) fives.play(r, r.turn, move.tile, move.end);
  else fives.pass(r, r.turn);
}

const domMoves = (r, seat) => domino.legalMoves(r, seat);

const scoresWith = (r, m) => fives.scoreFor(fives.endsCount(fives.boardAfter(r, m)));

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'fives-score': {
    about: "Seat 0's turn, and one of its tiles makes the ends add up to 15 or more.",
    check: (m) =>
      m.round.turn === 0 &&
      fives.legalMoves(m.round, 0).some((mv) => fives.scoreFor(fives.endsCount(fives.boardAfter(m.round, mv))) >= 15),
    setup: (match, opts) => search(match, 'fives', opts, (r) => r.turn === 0 && domMoves(r, 0).some((m) => scoresWith(r, m) >= 15)),
  },
  'fives-spinner': {
    about: "Seat 0's turn, the spinner's other sides are open, and one of its tiles goes on them.",
    check: (m) => m.round.turn === 0 && fives.legalMoves(m.round, 0).some((mv) => mv.end === 'U' || mv.end === 'D'),
    setup: (match, opts) =>
      search(match, 'fives', opts, (r) => r.turn === 0 && domMoves(r, 0).some((m) => m.end === 'U' || m.end === 'D')),
  },
  'fives-out': {
    about: "Seat 0's turn, one tile left, and it fits: going out scores the other team's pips, to the nearest 5.",
    check: (m) => m.round.turn === 0 && m.round.hands[0].length === 1,
    setup: (match, opts) =>
      search(match, 'fives', opts, (r) => r.turn === 0 && r.hands[0].length === 1 && domMoves(r, 0).length > 0),
  },
};
