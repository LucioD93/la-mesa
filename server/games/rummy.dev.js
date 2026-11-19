// Rummy for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as rummy from './rummy.js';
import { bestMelds } from './rummy.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r) {
  rummy.applyMove(r, r.turn, rummy.botMove(r, r.turn));
}

const fitsTable = (r, card) => r.melds.some((m) => rummy.layoffFit(m, card));

const meldsWith = (hand, card) => rummy.candidateMelds([...hand, card]).some((cards) => cards.some((c) => rummy.sameCard(c, card)));

/** Cards left in hand after putting down the best melds. */
const leftAfterMelds = (hand) => hand.length - rummy.bestMelds(hand).reduce((n, m) => n + m.cards.length, 0);

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'rummy-take': {
    about: "Seat 0's turn to draw, and the top of the discard pile melds with its hand or fits a meld on the table.",
    check: (m) => m.round.turn === 0 && !m.round.drawn && m.round.discard.length > 0,
    setup: (match, opts) =>
      search(match, 'rummy', opts, (r) => {
        const top = r.discard.at(-1);
        return r.turn === 0 && !r.drawn && !!top && (meldsWith(r.hands[0], top) || fitsTable(r, top));
      }),
  },
  'rummy-meld': {
    about: 'Seat 0 has drawn and holds a meld to put down.',
    check: (m) => m.round.turn === 0 && m.round.drawn && bestMelds(m.round.hands[0]).length > 0,
    setup: (match, opts) => search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && rummy.bestMelds(r.hands[0]).length > 0),
  },
  'rummy-layoff': {
    about: 'Seat 0 has drawn, and a card in its hand fits a meld on the table.',
    check: (m) => m.round.turn === 0 && m.round.drawn && m.round.melds.length > 0,
    setup: (match, opts) => search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && r.hands[0].some((c) => fitsTable(r, c))),
  },
  'rummy-out': {
    about: 'Seat 0 has drawn and can go out: meld its whole hand, then discard the card left, if any.',
    check: (m) => m.round.turn === 0 && m.round.drawn && bestMelds(m.round.hands[0]).length > 0,
    setup: (match, opts) =>
      search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && r.hands[0].length > 1 && leftAfterMelds(r.hands[0]) <= 1),
  },
  'rummy-last-card': {
    about: 'Seat 0 drew the last card of the deck: its discard ends the round.',
    check: (m) => m.round.turn === 0 && m.round.drawn && m.round.stock.length === 0,
    setup: (match, opts) => search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && !r.stock.length),
  },
};
