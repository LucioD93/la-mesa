// Ready-made moments to test, so nobody has to play a whole match to reach them.
// Each one rebuilds the match in place: the players are `p0`… from seat 0 (open the
// table with `/play/<id>?as=p0` to sit there), bots fill the rest, and seat 0 is the
// one the moment is about. Most deal real rounds and let bots play every seat until
// the moment comes up, so what's left in the hands and the deck stays consistent.
import { Match } from '../match.js';
import { nextSeat, shuffle } from '../games/common.js';
import * as domino from '../games/domino.js';
import * as truco from '../games/truco.js';
import * as caida from '../games/caida.js';
import * as parchis from '../games/parchis.js';
import * as cochina from '../games/cochina.js';
import { baseRng, diceValues, rig, seededRng, unrig } from './config.js';

const ATTEMPTS = 3000; // deals to try before giving up on a moment that comes up by chance
const MAX_STEPS = 20000; // bot moves in one round; parchís is the long one

/** Turn `match` into the match `data` describes, in place (the store saves the object it handed out). */
export function replaceMatch(match, data) {
  const next = new Match(match.id, { ...data, v: match.v });
  for (const key of Object.keys(next.toJSON())) match[key] = next[key];
  return match;
}

/** The tokens the scenarios seat, in seat order. */
export const playerToken = (seat) => `p${seat}`;

/** A fresh match of `game` in the lobby: `humans` players from seat 0, bots in the rest. */
function seatTable(match, game, { humans = 1, target, variant } = {}) {
  replaceMatch(match, { game, theme: match.theme });
  if (match.rules.targets.includes(Number(target))) match.target = Number(target);
  if (match.rules.variants?.includes(Number(variant))) match.variant = Number(variant);
  const n = Math.min(Math.max(Math.trunc(Number(humans)) || 0, 0), 4);
  for (let s = 0; s < n; s++) {
    const token = playerToken(s);
    match.names[token] = token;
    match.seats[s] = { token, name: token, bot: false };
  }
  match.handle(null, { t: 'addBots' }, new Set());
  return match;
}

// ---- bots for every seat ---------------------------------------------------------

/** One move by whoever is to act, played by the bot logic even for a human seat. */
const STEP = {
  domino(r) {
    const move = domino.botMove(r, r.turn);
    if (move) domino.play(r, r.turn, move.tile, move.end);
    else domino.pass(r, r.turn);
  },
  truco(r, rng) {
    const seat = r.pending ? nextSeat(r.pending.by) : r.turn;
    truco.applyMove(r, seat, truco.botMove(r, seat, rng));
  },
  caida(r, rng) {
    caida.applyMove(r, r.turn, caida.botMove(r, r.turn, rng), rng);
  },
  parchis(r, rng) {
    parchis.applyMove(r, r.turn, parchis.botMove(r, r.turn), rng);
  },
  cochina(r) {
    if (r.grab) cochina.grab(r, r.turn, cochina.botMove(r, r.turn), r.grab.until);
    else cochina.play(r, r.turn, cochina.botMove(r, r.turn).card);
  },
};

/** Play bot moves until `done(round)` holds (true) or the round ends without it (false). */
export function playUntil(match, done, rng = Math.random) {
  const r = match.round;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (done(r)) return true;
    if (r.over) return false;
    STEP[match.game](r, rng);
  }
  throw new Error(`${match.game}: the round did not end in ${MAX_STEPS} moves`);
}

/** Play out the round and score it, as the table would. */
function finishRound(match, rng) {
  playUntil(match, (r) => r.over, rng);
  match.afterMove();
}

/** Deal again until bots playing every seat reach `done`; each try is seeded so a `seed` repeats it. */
function search(match, game, opts, done, { prepare } = {}) {
  const base = opts.seed ?? Math.random().toString(36).slice(2);
  for (let i = 0; i < ATTEMPTS; i++) {
    const rng = seededRng(`${base}:${i}`);
    seatTable(match, game, opts);
    prepare?.(match);
    match.startRound(rng);
    if (playUntil(match, done, rng)) return;
  }
  throw new Error(`no deal reached that moment in ${ATTEMPTS} tries`);
}

const rngFor = (match, opts) => (opts.seed != null ? seededRng(String(opts.seed)) : baseRng(match, 'scenario'));

// ---- truco: a hand dealt to order -------------------------------------------------

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

// ---- parchís: a board set to order --------------------------------------------------

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

// ---- the list ---------------------------------------------------------------------

const domMoves = (r, seat) => domino.legalMoves(r, seat);
const cardsOf = (hand, n) => hand.filter((c) => c[0] === n);
const blocksWith = (r, m) => {
  const after = structuredClone(r);
  domino.play(after, 0, m.tile, m.end);
  return after.over?.reason === 'blocked';
};

/** name -> { game, about, setup(match, opts) }. `game: null` means any game (opts.game, or the match's). */
export const SCENARIOS = {
  lobby: {
    game: null,
    about: 'The lobby with every seat taken, ready to start.',
    setup: (match, opts, game) => seatTable(match, game, opts),
  },
  deal: {
    game: null,
    about: 'A new round just dealt.',
    setup(match, opts, game) {
      seatTable(match, game, opts);
      match.startRound(rngFor(match, opts));
    },
  },
  'match-point': {
    game: null,
    about: 'A new round where either team wins the match with its next points.',
    setup(match, opts, game) {
      seatTable(match, game, opts);
      match.scores = [match.target - 1, match.target - 1];
      match.startRound(rngFor(match, opts));
    },
  },
  'round-end': {
    game: null,
    about: 'A round the bots just played to the end, showing its result.',
    setup(match, opts, game) {
      seatTable(match, game, opts);
      const rng = rngFor(match, opts);
      match.startRound(rng);
      finishRound(match, rng);
    },
  },
  'match-end': {
    game: null,
    about: 'A match the bots just finished from match point, showing the final result.',
    setup(match, opts, game) {
      seatTable(match, game, opts);
      match.scores = [match.target - 1, match.target - 1];
      const rng = rngFor(match, opts);
      for (let i = 0; i < 200 && match.phase !== 'matchEnd'; i++) {
        match.startRound(rng);
        finishRound(match, rng);
      }
      if (match.phase !== 'matchEnd') throw new Error('the match did not end');
    },
  },

  'domino-opening': {
    game: 'domino',
    about: 'First round, and seat 0 holds the double six it has to open with.',
    setup: (match, opts) => search(match, 'domino', opts, (r) => !r.line.length && r.turn === 0),
  },
  'domino-last-tile': {
    game: 'domino',
    about: "Seat 0's turn, one tile left, and it fits: play it to win the round.",
    setup: (match, opts) =>
      search(match, 'domino', opts, (r) => r.turn === 0 && r.hands[0].length === 1 && domMoves(r, 0).length > 0),
  },
  'domino-stuck': {
    game: 'domino',
    about: "Seat 0's turn with nothing that fits: try a tile to get laughed at, or wait for the forced pass.",
    setup: (match, opts) => search(match, 'domino', opts, (r) => r.turn === 0 && r.line.length > 0 && !domMoves(r, 0).length),
  },
  'domino-block': {
    game: 'domino',
    about: "Seat 0's turn, and one of its tiles blocks the game.",
    setup: (match, opts) => search(match, 'domino', opts, (r) => r.turn === 0 && domMoves(r, 0).some((m) => blocksWith(r, m))),
  },

  'truco-flor': {
    game: 'truco',
    about: 'Seat 0 is mano with a flor (1, 5 and 7 of copas, worth 33): sing it before the first card.',
    setup: (match, opts) => void trucoDeal(match, opts, { vira: [4, 'o'], hand: [[1, 'c'], [5, 'c'], [7, 'c']] }),
  },
  'truco-reservada': {
    game: 'truco',
    about: 'Seat 0 is mano with perico and perica (vira 4 of oros): a flor reservada, worth 5 without singing it.',
    setup: (match, opts) => void trucoDeal(match, opts, { vira: [4, 'o'], hand: [[11, 'o'], [10, 'o'], [3, 'e']] }),
  },
  'truco-envido': {
    game: 'truco',
    about: 'Seat 0 is mano with 33 for the envido (7 and 6 of bastos).',
    setup: (match, opts) => void trucoDeal(match, opts, { vira: [4, 'o'], hand: [[7, 'b'], [6, 'b'], [3, 'c']] }),
  },
  'truco-answer': {
    game: 'truco',
    about: 'The bot on seat 1 is mano and called truco: seat 0 answers.',
    setup(match, opts) {
      const r = trucoDeal(match, opts, { vira: [4, 'o'], hand: [[1, 'e'], [3, 'c'], [12, 'b']], mano: 1 });
      r.pending = { kind: 'truco', by: 1, team: 0, level: 1 };
      r.seq = 1;
      r.lastCall = { n: 1, seat: 1, what: 'truco1' };
    },
  },

  'caida-ronda': {
    game: 'caida',
    about: 'Seat 0 starts a deal holding a canto (opts.kind: ronda, patrulla or tolete; ronda by default).',
    setup: (match, opts) =>
      search(match, 'caida', opts, (r) => r.deal > 0 && r.turn === 0 && caida.options(r, 0).canto === (opts.kind ?? 'ronda')),
  },
  'caida-caida': {
    game: 'caida',
    about: "Seat 0's turn, and it holds the number the last player just dropped: a caída.",
    setup: (match, opts) =>
      search(match, 'caida', opts, (r) => r.turn === 0 && r.lastDrop && cardsOf(r.hands[0], r.lastDrop[0]).length > 0),
  },
  'caida-mesa-limpia': {
    game: 'caida',
    about: "Seat 0's turn, and one of its cards takes everything on the table.",
    setup: (match, opts) =>
      search(
        match,
        'caida',
        opts,
        (r) => r.turn === 0 && r.table.length >= 2 && r.hands[0].some((c) => caida.takes(r.table, c).length === r.table.length),
      ),
  },

  'parchis-home': {
    game: 'parchis',
    about: "Seat 0's partner is home and seat 0 is one roll from winning; the roll is rigged to 3 and 2.",
    setup: (match, opts) =>
      parchisBoard(match, opts, [[G, G, G, 66], [10, 30, N, N], [G, G, G, G], [5, N, N, N]], [3, 2]),
  },
  'parchis-capture': {
    game: 'parchis',
    about: "A rival sits 3 squares ahead of seat 0's piece, off the safe squares; the roll is rigged to 3 and 1.",
    setup: (match, opts) => parchisBoard(match, opts, [[20, N, N, N], [6, N, N, N], [N, N, N, N], [N, N, N, N]], [3, 1]),
  },
  'parchis-leave': {
    game: 'parchis',
    about: 'Every piece in the nest and the roll rigged to 5 and 3: bring one out.',
    setup: (match, opts) => parchisBoard(match, opts, [[N, N, N, N], [N, N, N, N], [N, N, N, N], [N, N, N, N]], [5, 3]),
  },

  'cochina-steal': {
    game: 'cochina',
    about: "Seat 0's turn, and it holds the number on top of the rivals' cochina.",
    setup: (match, opts) =>
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.piles[1].length > 0 && cardsOf(r.hands[0], r.piles[1].at(-1)[0]).length > 0),
  },
  'cochina-grab': {
    game: 'cochina',
    about: "Seat 0's turn, and one of its cards matches two or more on the table.",
    setup: (match, opts) =>
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.hands[0].some((c) => cardsOf(r.table, c[0]).length >= 2)),
  },
};

/** Set up scenario `name` in `match`. Throws for an unknown name or game. */
export function applyScenario(match, name, opts = {}) {
  const sc = Object.hasOwn(SCENARIOS, name) ? SCENARIOS[name] : null;
  if (!sc) throw new Error(`unknown scenario ${name}`);
  const game = sc.game ?? opts.game ?? match.game;
  if (!Object.hasOwn(STEP, game)) throw new Error(`unknown game ${game}`);
  unrig(match.id); // draws lined up for what was here before
  sc.setup(match, opts, game);
  return match;
}
