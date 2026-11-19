// Caída for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as caida from './caida.js';
import { cantoOf } from './caida.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r, rng) {
  caida.applyMove(r, r.turn, caida.botMove(r, r.turn, rng), rng);
}

const cardsOf = (hand, n) => hand.filter((c) => c[0] === n);

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'caida-ronda': {
    about: 'Seat 0 starts a deal holding a canto (opts.kind: ronda, trivilin, patrulla, vigia or registro; ronda by default).',
    check: (m) => m.round.turn === 0 && cantoOf(m.round.hands[0])?.kind === 'ronda',
    setup: (match, opts) =>
      search(match, 'caida', opts, (r) => r.deal > 0 && r.turn === 0 && caida.options(r, 0).canto === (opts.kind ?? 'ronda')),
  },
  'caida-caida': {
    about: "Seat 0's turn, and it holds the number the last player just dropped: a caída.",
    check: (m) => m.round.hands[0].some((c) => c[0] === m.round.lastDrop[0]),
    setup: (match, opts) =>
      search(match, 'caida', opts, (r) => r.turn === 0 && r.lastDrop && cardsOf(r.hands[0], r.lastDrop[0]).length > 0),
  },
  'caida-mesa-limpia': {
    about: "Seat 0's turn, and one of its cards takes everything on the table.",
    check: (m) => m.round.turn === 0 && m.round.table.length >= 2,
    setup: (match, opts) =>
      search(
        match,
        'caida',
        opts,
        (r) => r.turn === 0 && r.table.length >= 2 && r.hands[0].some((c) => caida.takes(r.table, c).length === r.table.length),
      ),
  },
};
