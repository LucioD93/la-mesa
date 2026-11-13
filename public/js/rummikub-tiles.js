// Rummikub tiles in the browser: their markup, and what makes a set, the same check the
// server makes (server/games/rummikub.js) to light up what's legal while you build the
// table. test/rummikub.test.js checks that the two agree. A tile is 0-105: 0-103 the
// numbered ones, color by color, twice over; 104 and 105 the jokers.

export const COLORS = 4; // black, blue, orange, red
export const NUMBERS = 13;
export const MIN_SET = 3;
export const FIRST_PLAY = 30;

export const isJoker = (id) => id >= COLORS * NUMBERS * 2;
export const numberOf = (id) => (id % NUMBERS) + 1;
export const colorOf = (id) => Math.floor(id / NUMBERS) % COLORS;

export const byColor = (a, b) => isJoker(a) - isJoker(b) || colorOf(a) - colorOf(b) || numberOf(a) - numberOf(b) || a - b;
export const byNumber = (a, b) => isJoker(a) - isJoker(b) || numberOf(a) - numberOf(b) || colorOf(a) - colorOf(b) || a - b;

/** The set these tiles make, laid out, with what each tile counts as; or null. */
export function arrange(ids) {
  if (ids.length < MIN_SET) return null;
  const real = ids.filter((id) => !isJoker(id));
  const jokers = ids.filter(isJoker);
  if (!real.length) return null;
  const n = numberOf(real[0]);
  if (ids.length <= COLORS && real.every((id) => numberOf(id) === n) && new Set(real.map(colorOf)).size === real.length) {
    const tiles = [...real.sort(byColor), ...jokers];
    return { kind: 'group', tiles, values: tiles.map(() => n) };
  }
  if (ids.length > NUMBERS || !real.every((id) => colorOf(id) === colorOf(real[0]))) return null;
  const sorted = real.slice().sort(byNumber);
  if (new Set(sorted.map(numberOf)).size !== sorted.length) return null;
  const lo = numberOf(sorted[0]);
  const hi = numberOf(sorted.at(-1));
  const spare = jokers.length - (hi - lo + 1 - sorted.length);
  if (spare < 0) return null;
  const top = Math.min(NUMBERS, hi + spare);
  const start = lo - (spare - (top - hi));
  const tiles = [];
  const values = [];
  for (let v = start, k = 0, j = 0; v <= top; v++) {
    tiles.push(k < sorted.length && numberOf(sorted[k]) === v ? sorted[k++] : jokers[j++]);
    values.push(v);
  }
  return { kind: 'run', tiles, values };
}

export const setPoints = (ids) => arrange(ids)?.values.reduce((a, b) => a + b, 0) ?? 0;

/**
 * How a set that isn't finished yet reads best: laid out if it's good, else in the order a
 * run would take when its tiles share a color, or a group's when they share a number.
 */
export function tidy(ids) {
  const set = arrange(ids);
  if (set) return set.tiles;
  const real = ids.filter((id) => !isJoker(id));
  const oneColor = real.every((id) => colorOf(id) === colorOf(real[0]));
  return ids.slice().sort(oneColor ? byNumber : byColor);
}

// ---- markup -------------------------------------------------------------------

// A smiling face, in the joker's red.
const JOKER = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="8.8" cy="10" r="1.5" fill="currentColor"/><circle cx="15.2" cy="10" r="1.5" fill="currentColor"/><path d="M7.6 14.2c2.4 3 6.4 3 8.8 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

/** A tile's face: its number in its color, or the joker. */
export const tileFace = (id) => (isJoker(id) ? JOKER : `<b>${numberOf(id)}</b>`);
/** The data-c a tile is painted by: its color 0-3, or j for the joker. */
export const colorAttr = (id) => (isJoker(id) ? 'j' : colorOf(id));
export const tileHTML = (id, cls = '') => `<span class="rk-tile ${cls}" data-c="${colorAttr(id)}" data-id="${id}">${tileFace(id)}</span>`;
