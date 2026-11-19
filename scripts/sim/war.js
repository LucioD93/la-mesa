// War in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { card } from './common.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => (st.round.options.flip ? { t: 'flip' } : null); // there's nothing to choose in war

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => {
  const a = r.lastAction;
  if (!a) return null;
  if (a.type === 'flip') return `turns ${card(a.card)}${a.down ? ' over one face down' : ''}`;
  if (a.type === 'war') return `¡guerra! ${a.seats.join(' vs ')}`;
  if (a.type === 'win') return a.team === null ? `nobody takes ${a.cards}` : `takes ${a.cards}${a.war ? ` after ${a.war} war${a.war > 1 ? 's' : ''}` : ''}`;
  return null;
};

// In war everyone turns at once, so the others' cards change the table before ours lands: only our own pile counts.
export const moment = (st) => JSON.stringify([st.roundNo, st.phase, st.round?.hand, st.round?.options]);
