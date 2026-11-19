// Rummy in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import { rng, pick, sameCard, card } from './common.js';
import { candidateMelds, layoffFit } from '../../server/games/rummy.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => {
  const r = st.round;
  const fits = (card) => r.melds.some((m) => layoffFit(m, card));
  if (r.options.draw) {
    const top = r.discard.at(-1);
    const useful = top && (fits(top) || candidateMelds([...r.hand, top]).some((cards) => cards.includes(top)));
    return { t: 'draw', from: top && (useful || rng() < 0.1) ? 'discard' : 'stock' };
  }
  if (!r.options.play) return null;
  // Put down whatever it can, in a random order: a team that holds cards back loses points
  // every round, and the match would never reach its target.
  const melds = candidateMelds(r.hand);
  if (melds.length) return { t: 'meld', cards: pick(melds) };
  const offs = r.hand.flatMap((card) => r.melds.flatMap((m, meld) => (layoffFit(m, card) ? [{ card, meld }] : [])));
  if (offs.length) return { t: 'layoff', ...pick(offs) };
  // Throw any card that isn't close to a meld; the one just taken can't go straight back, unless it's the last.
  const free = r.hand.filter((c) => r.hand.length === 1 || !r.taken || !sameCard(c, r.taken));
  const close = (c) => r.hand.some((d) => d !== c && (d[0] === c[0] || (d[1] === c[1] && Math.abs(d[0] - c[0]) <= 2)));
  const loose = free.filter((c) => !close(c));
  return { t: 'discard', card: pick(loose.length ? loose : free) };
};

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => {
  const a = r.lastAction;
  if (!a) return null;
  if (a.type === 'draw') return a.from === 'stock' ? 'draws from the deck' : `takes ${card(a.card)}`;
  if (a.type === 'meld') return `melds ${a.cards.map(card).join(' ')}`;
  if (a.type === 'layoff') return `lays ${card(a.card)} off on meld ${a.meld}`;
  return `discards ${card(a.card)}`;
};
