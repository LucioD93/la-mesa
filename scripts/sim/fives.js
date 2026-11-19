// All Fives in the simulator (scripts/sim.js): what a headless player sends, from what its own
// state shows, and how a move reads in the log.
import * as domino from './domino.js';

/** The message this seat sends now, or null to wait. Only uses what its own state shows. */
export const play = (st) => domino.play(st);

/** What the last move was, for the log: a line, or one per kind of action (see `actors`). */
export const describe = (r) => domino.describe(r) && `${domino.describe(r)}${r.lastAction.points ? `, scores ${r.lastAction.points}` : ''}`;
