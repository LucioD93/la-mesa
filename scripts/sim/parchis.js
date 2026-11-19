// Parchís in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { pick } from './common.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const o = st.round.options;
  if (o.roll) return { t: 'roll' };
  const m = o.moves.length && pick(o.moves);
  return m ? { t: 'move', color: m.color, piece: m.piece, steps: m.uses[0] } : null;
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => [
  r.lastRoll && `rolls ${r.lastRoll.values.join('+')}${r.lastRoll.penalty ? ' (third repeat)' : ''}`,
  r.lastAction && `moves ${r.lastAction.color}:${r.lastAction.piece} ${r.lastAction.from}→${r.lastAction.to}${r.lastAction.captured ? ', captures' : ''}`,
];

export const actors = ['lastRoll', 'lastAction'];
