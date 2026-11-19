// What every game's headless player shares (scripts/sim/<id>.js): its random choices, and
// how a card reads in the log.

// Each choice depends only on the seed, the seat and what it sees, so a seed repeats the whole
// run: sim.js sets a seeded rng for each moment.
export let rng = Math.random;
export const setRng = (next) => {
  rng = next;
};
export const pick = (list) => list[Math.floor(rng() * list.length)];

export const sameCard = (a, b) => a[0] === b[0] && a[1] === b[1];
export const card = (c) => `${c[0]}${c[1]}`;
