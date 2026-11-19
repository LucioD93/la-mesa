// Rummikub for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as rummikub from './rummikub.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r) {
  rummikub.applyMove(r, r.turn, rummikub.botMove(r, r.turn));
}

const rkFits = (r, split) => r.hands[0].some((id) => r.table.some((set) => rummikub.fitTile(set, id)?.length === (split ? 2 : 1)));

const rkTurn = (r) => r.turn === 0 && r.melded[0];

const rkGoesOut = (r) => rummikub.botMove(r, 0).table?.flat().length === r.table.flat().length + r.hands[0].length;

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'rummikub-first': {
    about: "Seat 0's turn, and its rack holds a first play worth 30 or more.",
    check: (m) => m.round.turn === 0 && !m.round.melded[0] && rummikub.bestSets(m.round.hands[0], { first: true }).length > 0,
    setup: (match, opts) =>
      search(match, 'rummikub', opts, (r) => r.turn === 0 && !r.melded[0] && r.table.length > 0 && rummikub.bestSets(r.hands[0], { first: true }).length > 0),
  },
  'rummikub-layoff': {
    about: 'Seat 0 has made its first play, and a tile on its rack goes on a set on the table.',
    check: (m) => m.round.turn === 0 && m.round.melded[0] && m.round.hands[0].some((id) => m.round.table.some((s) => rummikub.fitTile(s, id))),
    setup: (match, opts) => search(match, 'rummikub', opts, (r) => rkTurn(r) && rkFits(r, false)),
  },
  'rummikub-split': {
    about: 'Seat 0 has made its first play, and a tile on its rack splits a run on the table in two.',
    check: (m) => m.round.turn === 0 && m.round.hands[0].some((id) => m.round.table.some((s) => rummikub.fitTile(s, id)?.length === 2)),
    setup: (match, opts) => search(match, 'rummikub', opts, (r) => rkTurn(r) && rkFits(r, true)),
  },
  'rummikub-joker': {
    about: 'Seat 0 has made its first play, and a joker is on the table.',
    check: (m) => m.round.turn === 0 && m.round.melded[0] && m.round.table.flat().some(rummikub.isJoker),
    setup: (match, opts) => search(match, 'rummikub', opts, (r) => rkTurn(r) && r.table.flat().some(rummikub.isJoker)),
  },
  'rummikub-out': {
    about: 'Seat 0 can play every tile on its rack and go out.',
    check: (m) => m.round.turn === 0 && rummikub.botMove(m.round, 0).table.flat().length === m.round.table.flat().length + m.round.hands[0].length,
    setup: (match, opts) => search(match, 'rummikub', opts, (r) => rkTurn(r) && r.hands[0].length > 1 && rkGoesOut(r)),
  },
  'rummikub-empty-pool': {
    about: "The pool is empty and it's seat 0's turn: it plays or passes.",
    check: (m) => m.round.turn === 0 && m.round.pool.length === 0,
    setup: (match, opts) => search(match, 'rummikub', opts, (r) => r.turn === 0 && !r.pool.length),
  },
};
