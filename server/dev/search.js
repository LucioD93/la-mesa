// What the scenarios share: seating a table, letting bots play every seat until a moment
// comes up, and dealing again until it does. Each game's own moments are in
// server/games/<id>.dev.js; scenarios.js puts them together.
import { Match } from '../match.js';
import { baseRng, seededRng } from './config.js';

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
export function seatTable(match, game, { humans = 1, target, variant } = {}) {
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

/** One move by whoever is to act, for each game: its `step`. scenarios.js fills it in. */
export const STEP = {};

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
export function finishRound(match, rng) {
  playUntil(match, (r) => r.over, rng);
  match.afterMove();
}

/** Deal again until bots playing every seat reach `done`; each try is seeded so a `seed` repeats it. */
export function search(match, game, opts, done, { prepare } = {}) {
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

export const rngFor = (match, opts) => (opts.seed != null ? seededRng(String(opts.seed)) : baseRng(match, 'scenario'));
