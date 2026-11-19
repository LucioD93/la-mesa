// Rummikub in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { rng } from './common.js';
import * as rummikub from '../../server/games/rummikub.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const r = st.round;
  if (!r.options.play) return null;
  // The bot's play, worked out from this seat's own rack and the table, sometimes held back
  // for a draw. Sets go in any order and tiles any way round: the server lays them out.
  const move = rummikub.botMove({ hands: { [st.you]: r.hand }, table: r.table, melded: r.melded }, st.you);
  if (move.type !== 'play' || rng() < 0.1) return { t: 'draw' };
  const table = move.table.map((set) => (rng() < 0.5 ? set.slice().reverse() : set));
  return { t: 'play', table: table.sort(() => rng() - 0.5) };
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => {
  const a = r.lastAction;
  if (!a) return null;
  if (a.type !== 'play') return a.type === 'draw' ? 'draws' : 'passes';
  return `plays ${a.placed.length === 1 ? '1 tile' : `${a.placed.length} tiles`}${a.first ? ' (first play)' : ''}`;
};
