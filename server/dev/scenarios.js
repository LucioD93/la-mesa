// Ready-made moments to test, so nobody has to play a whole match to reach them.
// Each one rebuilds the match in place: the players are `p0`… from seat 0 (open the
// table with `/play/<id>?as=p0` to sit there), bots fill the rest, and seat 0 is the
// one the moment is about. Most deal real rounds and let bots play every seat until
// the moment comes up, so what's left in the hands and the deck stays consistent.
import { Match } from '../match.js';
import { nextSeat, shuffle } from '../games/common.js';
import { NUMBERS } from '../games/truco.js';
import * as domino from '../games/domino.js';
import * as fives from '../games/fives.js';
import * as truco from '../games/truco.js';
import * as caida from '../games/caida.js';
import * as parchis from '../games/parchis.js';
import * as cochina from '../games/cochina.js';
import * as rummy from '../games/rummy.js';
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
  fives(r) {
    const move = fives.botMove(r, r.turn);
    if (move) fives.play(r, r.turn, move.tile, move.end);
    else fives.pass(r, r.turn);
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
  rummy(r) {
    rummy.applyMove(r, r.turn, rummy.botMove(r, r.turn));
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

// ---- cochina: a run to steal ------------------------------------------------------

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

const domMoves = (r, seat) => domino.legalMoves(r, seat);
const cardsOf = (hand, n) => hand.filter((c) => c[0] === n);
const fitsTable = (r, card) => r.melds.some((m) => rummy.layoffFit(m, card));
const meldsWith = (hand, card) => rummy.candidateMelds([...hand, card]).some((cards) => cards.some((c) => rummy.sameCard(c, card)));
/** Cards left in hand after putting down the best melds. */
const leftAfterMelds = (hand) => hand.length - rummy.bestMelds(hand).reduce((n, m) => n + m.cards.length, 0);
const scoresWith = (r, m) => fives.scoreFor(fives.endsCount(fives.lineAfter(r.line, m)));
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

  'fives-score': {
    game: 'fives',
    about: "Seat 0's turn, and one of its tiles makes the ends add up to 15 or more.",
    setup: (match, opts) => search(match, 'fives', opts, (r) => r.turn === 0 && domMoves(r, 0).some((m) => scoresWith(r, m) >= 15)),
  },
  'fives-out': {
    game: 'fives',
    about: "Seat 0's turn, one tile left, and it fits: going out scores the other team's pips, to the nearest 5.",
    setup: (match, opts) =>
      search(match, 'fives', opts, (r) => r.turn === 0 && r.hands[0].length === 1 && domMoves(r, 0).length > 0),
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
    about: 'Seat 0 starts a deal holding a canto (opts.kind: ronda, trivilin, patrulla, vigia or registro; ronda by default).',
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
  'cochina-steal-run': {
    game: 'cochina',
    about: "Seat 0's turn, the rivals' cochina has three cards of one number on top, and seat 0 holds the fourth: steal all three, one tap each.",
    setup(match, opts) {
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.piles[1].length >= 4 && loneNumber(r) != null);
      stackRivals(match.round);
    },
  },
  'cochina-run': {
    game: 'cochina',
    about: "Like cochina-steal-run, plus a card of each of the next two numbers on the table: steal the three, then grab along the run (escalera).",
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
    game: 'cochina',
    about: "Seat 0's turn, and one of its cards matches two or more on the table.",
    setup: (match, opts) =>
      search(match, 'cochina', opts, (r) => r.turn === 0 && !r.grab && r.hands[0].some((c) => cardsOf(r.table, c[0]).length >= 2)),
  },

  'rummy-take': {
    game: 'rummy',
    about: "Seat 0's turn to draw, and the top of the discard pile melds with its hand or fits a meld on the table.",
    setup: (match, opts) =>
      search(match, 'rummy', opts, (r) => {
        const top = r.discard.at(-1);
        return r.turn === 0 && !r.drawn && !!top && (meldsWith(r.hands[0], top) || fitsTable(r, top));
      }),
  },
  'rummy-meld': {
    game: 'rummy',
    about: 'Seat 0 has drawn and holds a meld to put down.',
    setup: (match, opts) => search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && rummy.bestMelds(r.hands[0]).length > 0),
  },
  'rummy-layoff': {
    game: 'rummy',
    about: 'Seat 0 has drawn, and a card in its hand fits a meld on the table.',
    setup: (match, opts) => search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && r.hands[0].some((c) => fitsTable(r, c))),
  },
  'rummy-out': {
    game: 'rummy',
    about: 'Seat 0 has drawn and can go out: meld its whole hand, then discard the card left, if any.',
    setup: (match, opts) =>
      search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && r.hands[0].length > 1 && leftAfterMelds(r.hands[0]) <= 1),
  },
  'rummy-last-card': {
    game: 'rummy',
    about: 'Seat 0 drew the last card of the deck: its discard ends the round.',
    setup: (match, opts) => search(match, 'rummy', opts, (r) => r.turn === 0 && r.drawn && !r.stock.length),
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
