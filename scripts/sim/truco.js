// Truco in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { rng, pick, card } from './common.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const r = st.round;
  const o = r.options;
  if (o.answer) {
    // Both partners may answer a bet, and the second would be too late: only the one the server waits on does.
    const answerer = [(r.pending.by + 1) % 4, (r.pending.by + 3) % 4].find((s) => !st.seats[s].bot);
    if (answerer !== st.you) return null;
    if (o.flor) return { t: 'call', what: 'flor' };
    if (o.envido.length && rng() < 0.2) return { t: 'call', what: pick(o.envido) };
    if (o.truco && rng() < 0.15) return { t: 'call', what: 'truco' };
    return { t: 'answer', yes: rng() < 0.7 };
  }
  if (!o.play) return null;
  if (o.flor) return { t: 'call', what: 'flor' };
  if (o.envido.length && rng() < 0.2) return { t: 'call', what: pick(o.envido) };
  if (o.truco && rng() < 0.2) return { t: 'call', what: 'truco' };
  if (rng() < 0.02) return { t: 'call', what: 'mazo' };
  return { t: 'play', card: pick(r.hand) };
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => [r.lastCall && `says ${r.lastCall.what}`, r.lastAction && `plays ${card(r.lastAction.card)}`];

export const actors = ['lastCall', 'lastAction'];
