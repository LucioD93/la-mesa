// What the games share: four seats in two teams, the bots' pacing, and the error
// for an illegal move.

export const SEATS = 4;
export const teamOf = (seat) => seat % 2;
export const nextSeat = (seat) => (seat + 1) % SEATS;

export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class MoveError extends Error {}

export const BOT_DELAY_MS = 1600; // the client's flight animation (1.2s) plus a beat

// How often El Manguangua says it. Rolled on the server so the whole table hears it together.
export const PLAY_PHRASE_CHANCE = 0.1;
export const TALK_PHRASE_CHANCE = 0.3; // a pass in dominoes, a call or answer in truco
export const isManguangua = (seated) => !!seated?.bot && seated.name === 'El Manguangua';
