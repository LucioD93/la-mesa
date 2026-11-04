// The games a match can be. Each one exports a `game` object:
//   id, targets, defaultTarget
//   newRound(match, rng)         deal; may note who starts next in match.nextStarter
//   handle(round, seat, msg)     apply a game message; true if it was one (throws MoveError)
//   settle(match)                the round is over: add its scores and history
//   pendingAuto(match)           { delay, key } if the table should play itself now
//   runAuto(match, rng)          play that automatic move
//   roundView(round, seat, revealed)   what one player may see of the round
import { game as domino } from './domino.js';
import { game as truco } from './truco.js';
import { game as caida } from './caida.js';

const GAMES = { domino, truco, caida };

// Matches saved before there was a choice have no `game` field: those are dominoes.
export const DEFAULT_GAME = 'domino';

export const isGame = (id) => typeof id === 'string' && Object.hasOwn(GAMES, id);
export const gameRules = (id) => GAMES[id];
