// Irish Snap (manotazo) in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { rng, card } from './common.js';

/**
 * The message this seat sends now, or null to wait. Only uses what its own state shows, and
 * `mine`, what this player remembers doing.
 */
export const play = (st, mine) => {
  const r = st.round;
  // Another slap can arrive before ours is counted: once a card is slapped, it stays slapped.
  const slap = () => ((mine.slapped = r.flip.n), { t: 'slap', n: r.flip.n });
  if (r.window && r.options.slap && mine.slapped !== r.flip.n) return slap();
  if (r.options.flip) return { t: 'flip', n: r.seq };
  // Now and then a slap on a card that doesn't match, which takes the stack.
  if (r.options.slap && !r.window && mine.slapped !== r.flip.n && rng() < 0.03) return slap();
  return null;
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => {
  const a = r.lastAction;
  if (!a) return null;
  if (a.type === 'flip') return `flips ${card(a.card)}, calling ${a.called}${a.match ? ': slap!' : ''}${a.out ? ' (out of cards)' : ''}`;
  if (a.type === 'slap') return `slaps (${a.place})`;
  return `takes ${a.cards} (${a.why === 'false' ? 'a false slap' : 'last hand down'})${a.back ? ', back in' : ''}`;
};

// A slap can land after the next card; that's the game, not a bug.
export const races = ['Too late'];
