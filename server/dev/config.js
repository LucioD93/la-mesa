// Knobs for testing on your own machine. All of them are off unless set, and none of
// them work on Vercel, where anyone could read every hand or rewrite a match.
// They are read on every use, so a test can flip them.
const local = () => !process.env.VERCEL;

/** The /api/dev endpoints: read any match whole, rewrite it, set up a scenario. */
export const devTools = () => local() && process.env.DEV_TOOLS === '1';

/** Multiplies every wait the server schedules: bot moves, forced passes, closing a grab, the slow-player mocking. */
export function timeScale() {
  const n = Number(process.env.TIME_SCALE);
  return local() && process.env.TIME_SCALE && n >= 0 ? n : 1;
}

/** Deals, dice and bots follow this seed, so the same moves replay the same match. */
export const seed = () => (local() && process.env.SEED) || null;

/** A repeatable random number generator from any string (cyrb-style hash into mulberry32). */
export function seededRng(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Numbers a test lined up for a match's next random draws (dice, mostly). Set by /api/dev.
const rigged = new Map(); // match id -> [0..1)

/** Line up the next random draws of a match, after any already lined up. */
export function rig(id, values) {
  rigged.set(id, [...(rigged.get(id) ?? []), ...values]);
}

/** Drop the draws lined up for a match. */
export const unrig = (id) => rigged.delete(id);

/** The draws that roll these dice, for `rig`. */
export const diceValues = (dice) => dice.map((d) => (d - 0.5) / 6);

/** Random numbers for one change to a match: seeded by SEED and the moment, else Math.random. */
export function baseRng(match, salt) {
  const s = seed();
  return s == null ? Math.random : seededRng(`${s}:${match.id}:${salt}:${match.roundNo}:${match.v}`);
}

/** Like baseRng, but the match's rigged draws come first. */
export function matchRng(match, salt) {
  const base = baseRng(match, salt);
  if (!rigged.size) return base;
  return () => {
    const queue = rigged.get(match.id);
    if (!queue?.length) return base();
    const n = queue.shift();
    if (!queue.length) rigged.delete(match.id);
    return n;
  };
}
