// The games a match can be. The lobby's menu lists them in public/js/games.js. Each one exports a `game` object:
//   id, targets, defaultTarget
//   variants, defaultVariant     optional: a choice for the lobby, read as match.variant
//   newRound(match, rng)         deal; may note who starts next in match.nextStarter
//   handle(round, seat, msg)     apply a game message; true if it was one (throws MoveError)
//   settle(match)                the round is over: add its scores and history
//   pendingAuto(match)           { delay, key } if the table should play itself now
//   runAuto(match, rng)          play that automatic move
//   waitingOn(match)             { seat, key } of the human the table waits on, when pendingAuto is null
//   roundView(round, seat, revealed)   what one player may see of the round
import { game as domino } from './domino.js';
import { game as truco } from './truco.js';
import { game as caida } from './caida.js';
import { game as parchis } from './parchis.js';

const GAMES = { domino, truco, caida, parchis };

// Matches saved before there was a choice have no `game` field: those are dominoes.
export const DEFAULT_GAME = 'domino';

export const GAME_IDS = Object.keys(GAMES);
export const isGame = (id) => typeof id === 'string' && Object.hasOwn(GAMES, id);
export const gameRules = (id) => GAMES[id];
