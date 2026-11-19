// War for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as war from './war.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r) {
  if (r.result) war.collect(r);
  else war.flip(r, r.toFlip[0]);
}

/** A battle just opened with seat 0 in it, and what each seat will turn up. */
const warOpen = (r) => !r.result && !r.war && r.toFlip.length === r.fighting.length && r.toFlip.includes(0);

const warTies = (r) => {
  const best = Math.max(...r.fighting.map((s) => war.rankOf(r.hands[s].at(-1))));
  const top = (s) => r.fighting.includes(s) && war.rankOf(r.hands[s].at(-1)) === best;
  return top(0) && (top(1) || top(3));
};

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'war-war': {
    about: "A battle just opened, and seat 0's card ties a rival's as the highest: turning it starts a war.",
    check: (m) => {
      const r = m.round;
      const top = (s) => war.rankOf(r.hands[s].at(-1));
      const best = Math.max(...r.fighting.map(top));
      return r.toFlip.includes(0) && top(0) === best && [1, 3].some((s) => r.fighting.includes(s) && top(s) === best);
    },
    setup: (match, opts) => search(match, 'war', opts, (r) => warOpen(r) && warTies(r)),
  },
  'war-last': {
    about: 'A battle just opened, and seat 0 has one card left.',
    check: (m) => m.round.toFlip.includes(0) && m.round.hands[0].length === 1,
    setup: (match, opts) => search(match, 'war', opts, (r) => warOpen(r) && r.hands[0].length === 1),
  },
};
