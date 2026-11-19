// Truco for the testing tools (server/dev/): how a bot plays any seat, the moments
// to jump to, and what each one promises about seat 0, which test/dev.test.js checks.
import * as truco from './truco.js';
import { florType, envidoValue } from './truco.js';
import { nextSeat, shuffle } from './common.js';
import { rngFor, seatTable } from '../dev/search.js';

/** One move by whoever is to act, played by the bot logic even for a human seat. */
export function step(r, rng) {
  const seat = r.pending ? nextSeat(r.pending.by) : r.turn;
  truco.applyMove(r, seat, truco.botMove(r, seat, rng));
}

/** Seat 0 holds `hand` under `vira`; everyone else gets the rest of the shuffled deck. */
function trucoDeal(match, opts, { vira, hand, mano = 0 }) {
  seatTable(match, 'truco', opts);
  const rng = rngFor(match, opts);
  match.nextStarter = mano;
  match.startRound(rng);
  const r = match.round;
  const dealt = [vira, ...hand];
  const rest = shuffle(truco.fullDeck().filter((c) => !dealt.some((d) => truco.sameCard(c, d))), rng);
  r.vira = vira;
  r.hands = [hand, rest.slice(0, 3), rest.slice(3, 6), rest.slice(6, 9)];
  r.dealt = r.hands.map((h) => h.map((c) => c.slice()));
  return r;
}

/** name -> { about, check(match), setup(match, opts) } */
export const scenarios = {
  'truco-flor': {
    about: 'Seat 0 is mano with a flor (1, 5 and 7 of copas, worth 33): sing it before the first card.',
    check: (m) => florType(m.round.dealt[0], m.round.vira) === 'flor' && m.round.turn === 0,
    setup: (match, opts) => void trucoDeal(match, opts, { vira: [4, 'o'], hand: [[1, 'c'], [5, 'c'], [7, 'c']] }),
  },
  'truco-reservada': {
    about: 'Seat 0 is mano with perico and perica (vira 4 of oros): a flor reservada, worth 5 without singing it.',
    check: (m) => florType(m.round.dealt[0], m.round.vira) === 'reservada',
    setup: (match, opts) => void trucoDeal(match, opts, { vira: [4, 'o'], hand: [[11, 'o'], [10, 'o'], [3, 'e']] }),
  },
  'truco-envido': {
    about: 'Seat 0 is mano with 33 for the envido (7 and 6 of bastos).',
    check: (m) => envidoValue(m.round.dealt[0], m.round.vira) === 33,
    setup: (match, opts) => void trucoDeal(match, opts, { vira: [4, 'o'], hand: [[7, 'b'], [6, 'b'], [3, 'c']] }),
  },
  'truco-answer': {
    about: 'The bot on seat 1 is mano and called truco: seat 0 answers.',
    check: (m) => m.round.pending?.team === 0 && m.waitingOn()?.seat === 0,
    setup(match, opts) {
      const r = trucoDeal(match, opts, { vira: [4, 'o'], hand: [[1, 'e'], [3, 'c'], [12, 'b']], mano: 1 });
      r.pending = { kind: 'truco', by: 1, team: 0, level: 1 };
      r.seq = 1;
      r.lastCall = { n: 1, seat: 1, what: 'truco1' };
    },
  },
};
