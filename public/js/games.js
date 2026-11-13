// The games the lobby offers, in menu order, and a small picture of each.
// The server's list is server/games/index.js: a new game goes in both.
import { tileHTML } from './tiles.js';
import { cardSVG } from './cards.js';
import { cardSVG as frenchSVG } from './french.js';
import { tileHTML as rkTileHTML } from './rummikub-tiles.js';

export const GAMES = ['domino', 'fives', 'truco', 'caida', 'parchis', 'cochina', 'rummy', 'rummikub'];

const card = (c, cls = '') => `<span class="card ${cls}">${cardSVG(c)}</span>`;

const ICONS = {
  domino: () => `<span class="tile v">${tileHTML(6, 3, false)}</span>`,
  fives: () => `<span class="tile v">${tileHTML(5, 5, false)}</span><span class="five">5</span>`,
  truco: () => card([1, 'e']),
  caida: () => card([7, 'c'], 'under') + card([1, 'o']),
  parchis: () =>
    `<svg viewBox="0 0 40 40" aria-hidden="true">${['#facc15', '#3b82f6', '#22c55e', '#ef4444']
      .map((fill, i) => `<rect x="${i % 2 ? 21 : 3}" y="${i < 2 ? 3 : 21}" width="16" height="16" rx="3" fill="${fill}"/>`)
      .join('')}<circle cx="20" cy="20" r="5" fill="#fbf8ef"/></svg>`,
  cochina: () => `${card([5, 'b'], 'under')}${card([5, 'o'])}<span class="pig">🐷</span>`,
  rummy: () => `<span class="card under">${frenchSVG([7, 'H'])}</span><span class="card">${frenchSVG([1, 'S'])}</span>`,
  rummikub: () => [10, 11 + 13, 104].map((id) => rkTileHTML(id)).join(''), // a black 11, a blue 12 and the joker
};

/** The picture of a game, for the lobby's game card and menu. */
export const gameIcon = (id) => `<span class="game-icon" data-g="${id}" aria-hidden="true">${ICONS[id]()}</span>`;
