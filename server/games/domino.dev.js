// Dominoes for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as domino from './domino.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r) {
  const move = domino.botMove(r, r.turn);
  if (move) domino.play(r, r.turn, move.tile, move.end);
  else domino.pass(r, r.turn);
}

const domMoves = (r, seat) => domino.legalMoves(r, seat);

const blocksWith = (r, m) => {
  const after = structuredClone(r);
  domino.play(after, 0, m.tile, m.end);
  return after.over?.reason === 'blocked';
};

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'domino-opening': {
    about: 'First round, and seat 0 holds the double six it has to open with.',
    check: (m) => m.round.turn === 0 && m.round.hands[0].some((x) => x[0] === 6 && x[1] === 6),
    setup: (match, opts) => search(match, 'domino', opts, (r) => !r.line.length && r.turn === 0),
  },
  'domino-last-tile': {
    about: "Seat 0's turn, one tile left, and it fits: play it to win the round.",
    check: (m) => m.round.turn === 0 && m.round.hands[0].length === 1,
    setup: (match, opts) =>
      search(match, 'domino', opts, (r) => r.turn === 0 && r.hands[0].length === 1 && domMoves(r, 0).length > 0),
  },
  'domino-stuck': {
    about: "Seat 0's turn with nothing that fits: try a tile to get laughed at, or wait for the forced pass.",
    check: (m) => m.round.turn === 0 && m.pendingAuto()?.delay > 0,
    setup: (match, opts) => search(match, 'domino', opts, (r) => r.turn === 0 && r.line.length > 0 && !domMoves(r, 0).length),
  },
  'domino-block': {
    about: "Seat 0's turn, and one of its tiles blocks the game.",
    check: (m) => m.round.turn === 0,
    setup: (match, opts) => search(match, 'domino', opts, (r) => r.turn === 0 && domMoves(r, 0).some((m) => blocksWith(r, m))),
  },
};
