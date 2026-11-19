// Kemps (kimi) in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { rng, pick, sameCard, card } from './common.js';
import * as kemps from '../../server/games/kemps.js';

const kmSent = {}; // seat -> the Kemps swap it sent last

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const r = st.round;
  if (!r.options.swap) return null;
  const g = r.gesture;
  // Our partner made our signal: call it. Sometimes we call Stop Kemps on a rival out of the blue.
  if (g && g.seat === (st.you + 2) % 4 && g.sign === r.signal) return { t: 'kemps' };
  if (kemps.isFour(r.hand)) return g?.seat === st.you && g.sign === r.signal ? null : { t: 'gesture', sign: r.signal };
  if (rng() < 0.01) return { t: 'corta', seat: pick(r.options.corta) };
  if (rng() < 0.05) return { t: 'gesture', sign: pick(kemps.SIGNS.filter((s) => s !== r.signal)) };
  // A swap still on its way: the card we gave is in hand and the one we took in the middle.
  const sent = kmSent[st.you];
  if (sent && r.hand.some((c) => sameCard(c, sent.give)) && r.middle.some((c) => sameCard(c, sent.take))) return null;
  const move = kemps.bestSwap(r.hand, r.middle);
  kmSent[st.you] = move;
  if (move) return { t: 'swap', ...move };
  return r.options.pass ? { t: 'pass' } : null;
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => [
  r.lastAction?.type === 'swap' && `takes ${card(r.lastAction.take)} for ${card(r.lastAction.give)}`,
  r.gesture && `makes a gesture: ${r.gesture.sign}`,
];

// Someone else can take the card first, or our gestures come too close together; that's the game, not a bug.
export const races = ['That card is gone', 'Too fast'];

export const actors = ['lastAction', 'gesture'];
