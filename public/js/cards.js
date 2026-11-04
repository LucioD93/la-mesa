// Spanish deck card markup: inline SVG, no image files.

const INK = { o: '#a16207', c: '#b91c1c', e: '#1e3a8a', b: '#15803d' };

// Traditional suit marks (see public/suits/), width / height of each drawing.
const ASPECT = { o: 200 / 198, c: 200 / 280, e: 100 / 331.5, b: 100 / 291.4 };

// Where the marks go, in a 100 x 150 card, as [x, y, height, rotation].
// Coins and cups sit in a grid.
const ROUND = {
  1: [[50, 75, 62]],
  2: [[50, 50, 34], [50, 100, 34]],
  3: [[50, 39, 28], [50, 75, 28], [50, 111, 28]],
  4: [[33, 49, 30], [67, 49, 30], [33, 101, 30], [67, 101, 30]],
  5: [[33, 46, 26], [67, 46, 26], [50, 75, 26], [33, 104, 26], [67, 104, 26]],
  6: [[33, 41, 25], [67, 41, 25], [33, 75, 25], [67, 75, 25], [33, 109, 25], [67, 109, 25]],
  7: [[32, 38, 22], [68, 38, 22], [50, 57, 22], [32, 76, 22], [68, 76, 22], [32, 112, 22], [68, 112, 22]],
};
// Swords and clubs are long, and lean into each other like on the printed deck.
const TALL = {
  1: [[50, 75, 118]],
  2: [[38, 75, 104, -12], [62, 75, 104, 12]],
  3: [[28, 75, 94, -9], [50, 75, 94], [72, 75, 94, 9]],
  4: [[35, 47, 52, -8], [65, 47, 52, 8], [35, 104, 52, 8], [65, 104, 52, -8]],
  5: [[30, 47, 50, -8], [70, 47, 50, 8], [50, 75, 50], [30, 104, 50, 8], [70, 104, 50, -8]],
  6: [[26, 47, 52, -6], [50, 47, 52], [74, 47, 52, 6], [26, 104, 52, 6], [50, 104, 52], [74, 104, 52, -6]],
  7: [[26, 41, 36, -6], [50, 41, 36], [74, 41, 36, 6], [50, 75, 30], [26, 110, 36, 6], [50, 110, 36], [74, 110, 36, -6]],
};

const FACE = { 10: 'S', 11: 'C', 12: 'R' };

const mark = (suit, x, y, h, rot = 0) => {
  const w = h * ASPECT[suit];
  const turn = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
  return `<image href="/suits/${suit}.svg" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"${turn}/>`;
};

/** The figure on a 10 (sota), 11 (caballo) or 12 (rey): big suit mark in a frame. */
function face(n, suit) {
  const crown =
    n === 12
      ? `<path d="M38 50 41 38 46 45 50 34 54 45 59 38 62 50Z" fill="#f5c542" stroke="#92400e" stroke-width="1.4" stroke-linejoin="round"/>`
      : '';
  const tall = suit === 'e' || suit === 'b';
  const size = (tall ? 60 : 38) * (n === 12 ? 0.85 : 1);
  return `<rect x="28" y="28" width="44" height="94" rx="6" fill="${INK[suit]}" fill-opacity="0.08" stroke="${INK[suit]}" stroke-width="1.5"/>
    ${crown}${mark(suit, 50, n === 12 ? 77 : 70, size)}
    <text x="50" y="117" text-anchor="middle" font-size="13" font-weight="800" fill="${INK[suit]}">${FACE[n]}</text>`;
}

function corner(n, suit) {
  return `<text x="8" y="21" font-size="20" font-weight="800" fill="${INK[suit]}">${n}</text>`;
}

/** The inside of a card (the caller provides the wrapper and any extra classes). */
export function cardSVG([n, suit]) {
  const layout = (suit === 'e' || suit === 'b' ? TALL : ROUND)[n];
  const body = layout ? layout.map(([x, y, h, rot]) => mark(suit, x, y, h, rot)).join('') : face(n, suit);
  return `<svg viewBox="0 0 100 150" aria-hidden="true">${corner(n, suit)}${body}<g transform="rotate(180 50 75)">${corner(n, suit)}</g></svg>`;
}

export const cardKey = ([n, suit]) => `${n}-${suit}`;
export const parseKey = (key) => {
  const [n, suit] = key.split('-');
  return [Number(n), suit];
};
export const sameCard = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

/** 'perico', 'perica' or '' for a card under this round's vira. */
export function pieceOf(card, pieces) {
  if (sameCard(card, pieces?.perico)) return 'perico';
  if (sameCard(card, pieces?.perica)) return 'perica';
  return '';
}
