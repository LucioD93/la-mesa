// Roba la cochina in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { pick, sameCard, card } from './common.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const r = st.round;
  if (r.options.grab) {
    const n = r.grab.num ?? r.grab.card[0]; // a run (escalera) moves on to the next numbers
    const top = r.tops[1 - (st.you % 2)];
    if (top?.[0] === n) return { t: 'grab', pile: true };
    const card = r.table.find((c) => c[0] === n && !sameCard(c, r.grab.card));
    return card ? { t: 'grab', card } : null;
  }
  return r.options.play ? { t: 'play', card: pick(r.hand) } : null;
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => {
  const a = r.lastAction;
  if (!a) return null;
  if (a.type === 'play') return `plays ${card(a.card)}`;
  if (a.type === 'grab') return a.stolen ? 'steals the cochina' : `grabs ${a.cards.map(card).join(' ')}`;
  return `lets go (${a.missed} missed)`;
};

// The grab window can close between our seeing it and our grab landing; that's the game, not a bug.
export const races = ['Nothing to grab', 'Too late'];
