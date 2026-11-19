// The games the lobby offers, in menu order. Each one's name, icon, strings and rules are in
// games/<id>.js, and its table in <id>.js. The server's list is server/games/index.js: a new
// game goes in both.
export const GAMES = ['domino', 'fives', 'truco', 'caida', 'parchis', 'cochina', 'rummy', 'rummikub', 'war', 'slap', 'kemps'];

/** Each game's games/<id>.js, by id. */
export const GAME_DATA = Object.fromEntries(
  await Promise.all(GAMES.map(async (id) => [id, await import(`./games/${id}.js`)])),
);

// Each game's own CSS, games/<id>.css, goes after style.css. Waiting for it means no
// table or menu of games is ever drawn without its colors.
if (typeof document !== 'undefined') {
  await Promise.all(
    GAMES.map(
      (id) =>
        new Promise((done) => {
          const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `/css/games/${id}.css` });
          link.onload = link.onerror = done;
          document.head.append(link);
        }),
    ),
  );
}

// Behind a feature flag (server/games/index.js): a lobby only lists them once the server
// offers them, and the home page leaves them out.
export const FLAGGED = GAMES.filter((id) => GAME_DATA[id].flagged);

/** The full rules of each game, for the rules sheet. */
export const RULES = Object.fromEntries(GAMES.map((id) => [id, GAME_DATA[id].rules]));

/** The picture of a game, for the lobby's game card and menu. */
export const gameIcon = (id) => `<span class="game-icon" data-g="${id}" aria-hidden="true">${GAME_DATA[id].icon()}</span>`;
