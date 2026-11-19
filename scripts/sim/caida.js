// Caída in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { pick, card } from './common.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const o = st.round.options;
  if (o.order) return { t: 'order', dir: pick([1, -1]) };
  if (o.canto) return { t: 'call', what: 'canto' };
  return o.play ? { t: 'play', card: pick(st.round.hand) } : null;
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => [
  r.lastCall && `sings ${r.lastCall.what}`,
  r.lastAction && `plays ${card(r.lastAction.card)}${r.lastAction.taken.length ? `, takes ${r.lastAction.taken.map(card).join(' ')}` : ''}`,
];

export const actors = ['lastCall', 'lastAction'];
