// Kemps (kimi) for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as kemps from './kemps.js';
import { rngFor, search, seatTable } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
// Everyone plays at once: the earliest thing any seat's bot would do, at its own time.
export function step(r, rng) {
  const [ev] = kemps.plan(r, () => true);
  kemps.runEvent(r, ev, rng, ev.at);
}

/** A Kemps moment, with the round's clock brought to now so the bots carry on at their pace. */
function kmSearch(match, opts, done) {
  search(match, 'kemps', opts, done);
  kemps.rebase(match.round);
}

const kmThree = (r) => r.hands[0].some(([n]) => r.hands[0].filter((c) => c[0] === n).length === 3 && r.middle.some((c) => c[0] === n));

const kmSignaled = (r, seat) => r.gesture?.seat === seat && r.gesture.sign === r.signals[seat % 2] && kemps.isFour(r.hands[seat]);

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'kemps-three': {
    about: 'Seat 0 holds three of a kind, and the fourth is in the middle: swap for it.',
    check: (m) => m.round.hands[0].some(([n]) => m.round.hands[0].filter((c) => c[0] === n).length === 3 && m.round.middle.some((c) => c[0] === n)),
    setup: (match, opts) => kmSearch(match, opts, kmThree),
  },
  'kemps-four': {
    about: "Seat 0 just got four of a kind. Its partner waits for the team's signal.",
    check: (m) => kemps.isFour(m.round.hands[0]),
    setup: (match, opts) => kmSearch(match, opts, (r) => kemps.isFour(r.hands[0])),
  },
  'kemps-signal': {
    about: "Seat 0's partner holds four of a kind and just made the team's signal: call Kemps.",
    check: (m) => m.round.gesture.seat === 2 && m.round.gesture.sign === m.round.signals[0] && kemps.isFour(m.round.hands[2]),
    setup: (match, opts) => kmSearch(match, opts, (r) => kmSignaled(r, 2)),
  },
  'kemps-corta': {
    about: 'The rival on seat 1 holds four of a kind and just made its signal: call Stop Kemps on it before its partner calls.',
    check: (m) => m.round.gesture.seat === 1 && m.round.gesture.sign === m.round.signals[1] && kemps.isFour(m.round.hands[1]),
    setup: (match, opts) => kmSearch(match, opts, (r) => kmSignaled(r, 1)),
  },
  'kemps-exposed': {
    about: "A new hand where the bots know seat 0's team signal: making it gets seat 0 cut.",
    check: (m) => m.round.learned[0] === m.round.signals[0],
    setup(match, opts) {
      seatTable(match, 'kemps', opts);
      match.startRound(rngFor(match, opts));
      match.round.learned[0] = match.round.signals[0];
    },
  },
};
