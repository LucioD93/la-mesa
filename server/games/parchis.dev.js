// Parchís for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as parchis from './parchis.js';
import { diceValues, rig } from '../dev/config.js';
import { rngFor, seatTable } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r, rng) {
  parchis.applyMove(r, r.turn, parchis.botMove(r, r.turn), rng);
}

const { NEST: N, GOAL: G } = parchis;

/** Seat 0 to roll with the pieces where `pieces` says, and its next roll rigged to `dice`. */
function parchisBoard(match, opts, pieces, dice) {
  seatTable(match, 'parchis', opts);
  match.nextStarter = 0;
  match.startRound(rngFor(match, opts));
  match.round.pieces = pieces;
  const roll = match.variant === 1 ? [dice.reduce((a, b) => a + b)] : dice;
  rig(match.id, diceValues(roll));
}

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'parchis-home': {
    about: "Seat 0's partner is home and seat 0 is one roll from winning; the roll is rigged to 3 and 2.",
    check: (m) => m.round.turn === 0 && m.round.pieces[2].every((p) => p === 71),
    setup: (match, opts) =>
      parchisBoard(match, opts, [[G, G, G, 66], [10, 30, N, N], [G, G, G, G], [5, N, N, N]], [3, 2]),
  },
  'parchis-capture': {
    about: "A rival sits 3 squares ahead of seat 0's piece, off the safe squares; the roll is rigged to 3 and 1.",
    check: (m) => m.round.turn === 0,
    setup: (match, opts) => parchisBoard(match, opts, [[20, N, N, N], [6, N, N, N], [N, N, N, N], [N, N, N, N]], [3, 1]),
  },
  'parchis-leave': {
    about: 'Every piece in the nest and the roll rigged to 5 and 3: bring one out.',
    check: (m) => m.round.pieces.flat().every((p) => p === -1),
    setup: (match, opts) => parchisBoard(match, opts, [[N, N, N, N], [N, N, N, N], [N, N, N, N], [N, N, N, N]], [5, 3]),
  },
};
