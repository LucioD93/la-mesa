// Irish Snap (manotazo) for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as slap from './slap.js';
import { calledAt } from './slap.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r, rng) {
  // Everyone slaps a match, in a random order; nobody slaps anything else.
  if (!r.window) return void slap.flip(r, r.turn, { rng });
  const left = [0, 1, 2, 3].filter((s) => !r.window.slaps.includes(s));
  slap.slap(r, left[Math.floor(rng() * left.length)], r.flip.n);
}

/**
 * Make the card `seat` flips next the number about to be called, by trading places with a
 * card of that number lower in a pile, its own or another's. False when every one of them
 * is already face up on the stack.
 */
function rigFlip(r, seat) {
  const called = slap.calledAt(r.count);
  const pile = r.hands[seat];
  if (pile.at(-1)?.[0] === called) return true;
  const list = r.hands.find((h, s) => h.some((c, i) => c[0] === called && !(s === seat && i === h.length - 1)));
  if (!list) return false;
  const i = list.findIndex((c) => c[0] === called);
  [list[i], pile[pile.length - 1]] = [pile[pile.length - 1], list[i]];
  return true;
}

/** Bots play until `done`, then the next flip is rigged to match; another deal if it can't be. */
function slapSearch(match, opts, done, flipper = (r) => r.turn) {
  const seed = opts.seed ?? Math.random().toString(36).slice(2);
  for (let i = 0; ; i++) {
    search(match, 'slap', { ...opts, seed: `${seed}:${i}` }, (r) => !r.window && !r.over && done(r));
    if (rigFlip(match.round, flipper(match.round))) return;
  }
}

/** The next card flipped is the number it calls. */
const slapsNext = (r) => r.hands[r.turn].at(-1)[0] === calledAt(r.count);

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'slap-match': {
    about: "Seat 0's turn, and its top card is the number about to be called: flip it, then slap.",
    check: (m) => m.round.turn === 0 && !m.round.window && slapsNext(m.round),
    setup: (match, opts) => slapSearch(match, opts, (r) => r.turn === 0 && r.flips > 0 && r.hands[0].length > 1),
  },
  'slap-last-card': {
    about: "Seat 0's last card, and it matches the count: flip it, slap in time and win the round.",
    check: (m) => m.round.turn === 0 && m.round.hands[0].length === 1 && slapsNext(m.round),
    setup: (match, opts) => slapSearch(match, opts, (r) => r.turn === 0 && r.hands[0].length === 1),
  },
  'slap-out': {
    about: "Seat 0 is out of cards, and the bot to flip next turns up a match: slap in time to win, or be last and pick the stack up.",
    check: (m) => m.round.out.includes(0) && m.seats[m.round.turn].bot && slapsNext(m.round),
    setup: (match, opts) => slapSearch(match, opts, (r) => r.out.includes(0) && r.turn !== 0),
  },
  'slap-big-stack': {
    about: "Seat 0's turn with 12 or more cards on the stack and none of them a match: slap now to see a false slap take it all.",
    check: (m) => m.round.turn === 0 && !m.round.window && m.round.stack.length >= 12,
    setup: (match, opts) => search(match, 'slap', opts, (r) => r.turn === 0 && !r.window && r.stack.length >= 12 && r.hands[0].length > 1),
  },
};
