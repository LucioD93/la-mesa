// Dominoes in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { pick } from './common.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const m = st.round.legal.length && pick(st.round.legal);
  return m ? { t: 'play', tile: m.tile, end: m.end } : null; // with nothing to play, the server passes for us
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => r.lastAction && (r.lastAction.type === 'pass' ? 'passes' : `plays ${r.lastAction.tile.join('|')} ${r.lastAction.end}`);
