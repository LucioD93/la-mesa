// Ready-made moments to test, so nobody has to play a whole match to reach them.
// Each one rebuilds the match in place: the players are `p0`… from seat 0 (open the
// table with `/play/<id>?as=p0` to sit there), bots fill the rest, and seat 0 is the
// one the moment is about. Most deal real rounds and let bots play every seat until
// the moment comes up, so what's left in the hands and the deck stays consistent.
// The ones here work in any game; each game's own, and how its bots play any seat,
// are in server/games/<id>.dev.js.
import { GAME_IDS } from '../games/index.js';
import { unrig } from './config.js';
import { STEP, finishRound, playUntil, playerToken, replaceMatch, rngFor, seatTable } from './search.js';

export { playUntil, playerToken, replaceMatch };

const DEV = await Promise.all(GAME_IDS.map((id) => import(`../games/${id}.dev.js`)));
GAME_IDS.forEach((id, i) => (STEP[id] = DEV[i].step));

/** name -> { game, about, check(match), setup(match, opts) }. `game: null` means any game (opts.game, or the match's). */
export const SCENARIOS = {
  lobby: {
    game: null,
    about: 'The lobby with every seat taken, ready to start.',
    check: (m) => m.phase === 'lobby' && m.seats.every(Boolean),
    setup: (match, opts, game) => seatTable(match, game, opts),
  },
  deal: {
    game: null,
    about: 'A new round just dealt.',
    check: (m) => m.phase === 'playing' && m.roundNo === 1,
    setup(match, opts, game) {
      seatTable(match, game, opts);
      match.startRound(rngFor(match, opts));
    },
  },
  'match-point': {
    game: null,
    about: 'A new round where either team (or, in a game without teams, anyone) wins the match with its next points.',
    check: (m) => m.phase === 'playing' && m.scores.every((s) => s === m.target - 1),
    setup(match, opts, game) {
      seatTable(match, game, opts);
      match.scores = match.scores.map(() => match.target - 1);
      match.startRound(rngFor(match, opts));
    },
  },
  'round-end': {
    game: null,
    about: 'A round the bots just played to the end, showing its result.',
    check: (m) => m.phase === 'roundEnd' || m.phase === 'matchEnd',
    setup(match, opts, game) {
      seatTable(match, game, opts);
      const rng = rngFor(match, opts);
      match.startRound(rng);
      finishRound(match, rng);
    },
  },
  'match-end': {
    game: null,
    about: 'A match the bots just finished from match point, showing the final result.',
    check: (m) => m.phase === 'matchEnd',
    setup(match, opts, game) {
      seatTable(match, game, opts);
      match.scores = match.scores.map(() => match.target - 1);
      const rng = rngFor(match, opts);
      for (let i = 0; i < 200 && match.phase !== 'matchEnd'; i++) {
        match.startRound(rng);
        finishRound(match, rng);
      }
      if (match.phase !== 'matchEnd') throw new Error('the match did not end');
    },
  },
};
GAME_IDS.forEach((game, i) => {
  for (const [name, sc] of Object.entries(DEV[i].scenarios)) SCENARIOS[name] = { game, ...sc };
});

/** Set up scenario `name` in `match`. Throws for an unknown name or game. */
export function applyScenario(match, name, opts = {}) {
  const sc = Object.hasOwn(SCENARIOS, name) ? SCENARIOS[name] : null;
  if (!sc) throw new Error(`unknown scenario ${name}`);
  const game = sc.game ?? opts.game ?? match.game;
  if (!Object.hasOwn(STEP, game)) throw new Error(`unknown game ${game}`);
  unrig(match.id); // draws lined up for what was here before
  sc.setup(match, opts, game);
  return match;
}
