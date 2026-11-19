// Roba la cochina for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as cochina from './cochina.js';
import { NUMBERS } from './truco.js';
import { search } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r) {
  if (r.grab) cochina.grab(r, r.turn, cochina.botMove(r, r.turn), r.grab.until);
  else cochina.play(r, r.turn, cochina.botMove(r, r.turn).card);
}

/** A number seat 0 holds exactly one of. */
const loneNumber = (r) => r.hands[0].find((c) => cardsOf(r.hands[0], c[0]).length === 1)?.[0];

/**
 * Move the other three cards of seat 0's lone number onto the top of the rivals' cochina,
 * each trading places with the card that was there, so the deck stays whole.
 */
function stackRivals(r) {
  const n = loneNumber(r);
  const places = [r.deck, r.table, ...r.hands.slice(1), ...r.piles];
  const pile = r.piles[1];
  const others = places.flatMap((list) => cardsOf(list, n));
  others.forEach((card, i) => {
    const list = places.find((l) => l.includes(card));
    const at = pile.length - 1 - i;
    [list[list.indexOf(card)], pile[at]] = [pile[at], card];
  });
}

/**
 * A card of each of the two numbers after seat 0's lone one goes on the table, trading
 * places with a table card outside the run. False when the table has no room for it.
 */
function runOnTable(r) {
  const n = loneNumber(r);
  const run = NUMBERS.slice(NUMBERS.indexOf(n) + 1, NUMBERS.indexOf(n) + 3);
  const places = [r.deck, ...r.hands.slice(1), ...r.piles];
  for (const m of run) {
    if (cardsOf(r.table, m).length) continue;
    const slot = r.table.findIndex((c) => c[0] !== n && !run.includes(c[0]));
    if (slot === -1) return false;
    const list = places.find((l) => cardsOf(l, m).length);
    const card = cardsOf(list, m)[0];
    [list[list.indexOf(card)], r.table[slot]] = [r.table[slot], card];
  }
  return true;
}

const cardsOf = (hand, n) => hand.filter((c) => c[0] === n);

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'cochina-steal': {
    about: "Seat 0's turn, and it holds the number on top of the rivals' cochina.",
    check: (m) => m.round.hands[0].some((c) => c[0] === m.round.piles[1].at(-1)[0]),
    setup: (match, opts) =>
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.piles[1].length > 0 && cardsOf(r.hands[0], r.piles[1].at(-1)[0]).length > 0),
  },
  'cochina-steal-run': {
    about: "Seat 0's turn, the rivals' cochina has three cards of one number on top, and seat 0 holds the fourth: steal all three, one tap each.",
    check: (m) => {
      const top = m.round.piles[1].slice(-4).map((c) => c[0]);
      return top.slice(1).every((n) => n === top[1]) && top[0] !== top[1] && m.round.hands[0].some((c) => c[0] === top[1]);
    },
    setup(match, opts) {
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.piles[1].length >= 4 && loneNumber(r) != null);
      stackRivals(match.round);
    },
  },
  'cochina-run': {
    about: "Like cochina-steal-run, plus a card of each of the next two numbers on the table: steal the three, then grab along the run (escalera).",
    check: (m) => {
      const [n] = m.round.piles[1].at(-1);
      const next = NUMBERS.slice(NUMBERS.indexOf(n) + 1, NUMBERS.indexOf(n) + 3);
      return scenarios['cochina-steal-run'].check(m) && next.every((k) => m.round.table.some((c) => c[0] === k)) && !m.round.table.some((c) => c[0] === n);
    },
    setup(match, opts) {
      const ok = (r) => r.turn === 0 && !r.grab && r.piles[1].length >= 4 && r.table.length >= 2 && loneNumber(r) != null && loneNumber(r) < 11;
      const seed = opts.seed ?? Math.random().toString(36).slice(2);
      for (let i = 0; ; i++) {
        search(match, 'cochina', { ...opts, seed: `${seed}:${i}` }, ok);
        stackRivals(match.round);
        if (runOnTable(match.round)) return;
      }
    },
  },
  'cochina-grab': {
    about: "Seat 0's turn, and one of its cards matches two or more on the table.",
    check: (m) => m.round.turn === 0,
    setup: (match, opts) =>
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.hands[0].some((c) => cardsOf(r.table, c[0]).length >= 2)),
  },
};
