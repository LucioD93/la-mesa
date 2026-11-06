// French deck card markup for rummy: inline SVG, no image files. Cards are [rank, suit]
// with rank 1 (ace) to 13 (king) and suit S, H, D or C. The corner index is large so a
// card still reads when it sits half under the next one in a meld.

const INK = { S: '#1f2937', C: '#1f2937', H: '#c0262d', D: '#c0262d' };
export const SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' };
const LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const rankLabel = (n) => LABEL[n] ?? String(n);

// Each suit drawn in a 24 x 24 box.
const SHAPE = {
  H: '<path d="M12 21.5C5 16 1.5 12.6 1.5 8.3 1.5 5 4 2.5 7.2 2.5c2 0 3.7 1 4.8 2.7 1.1-1.7 2.8-2.7 4.8-2.7 3.2 0 5.7 2.5 5.7 5.8 0 4.3-3.5 7.7-10.5 13.2z"/>',
  D: '<path d="M12 1.5 20.5 12 12 22.5 3.5 12z"/>',
  S: '<path d="M12 1.5C9 6 2.5 9.5 2.5 14.2c0 2.8 2.2 4.8 4.8 4.8 1.6 0 3-.7 3.9-1.9-.3 2-1.2 3.6-2.7 4.9h7c-1.5-1.3-2.4-2.9-2.7-4.9.9 1.2 2.3 1.9 3.9 1.9 2.6 0 4.8-2 4.8-4.8C21.5 9.5 15 6 12 1.5z"/>',
  C: '<circle cx="12" cy="6.8" r="4.6"/><circle cx="6.6" cy="13.6" r="4.6"/><circle cx="17.4" cy="13.6" r="4.6"/><path d="M12 10c0 5.5-1.2 9.5-4 12.5h8c-2.8-3-4-7-4-12.5z"/>',
};

const suit = (s, x, y, size) =>
  `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})" fill="${INK[s]}">${SHAPE[s]}</g>`;

const corner = (n, s) =>
  `<text x="${n === 10 ? 4 : 8}" y="32" font-size="32" font-weight="800" letter-spacing="${n === 10 ? -3 : 0}" fill="${INK[s]}">${rankLabel(n)}</text>${suit(s, 19, 47, 22)}`;

/** A king, queen or jack: the letter big in a frame, with its suit. */
function face(n, s) {
  return `<rect x="30" y="34" width="62" height="98" rx="7" fill="${INK[s]}" fill-opacity="0.07" stroke="${INK[s]}" stroke-width="1.6"/>
    <text x="61" y="96" text-anchor="middle" font-size="52" font-weight="800" fill="${INK[s]}">${rankLabel(n)}</text>${suit(s, 61, 116, 20)}`;
}

/** The inside of a card (the caller provides the wrapper and any extra classes). */
export function cardSVG([n, s]) {
  const body = n >= 11 ? face(n, s) : suit(s, 61, 92, n === 1 ? 54 : 44);
  return `<svg viewBox="0 0 100 150" aria-hidden="true">${corner(n, s)}${body}</svg>`;
}

export const cardKey = ([n, s]) => `${n}-${s}`;
export const parseKey = (key) => {
  const [n, s] = key.split('-');
  return [Number(n), s];
};
export const sameCard = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
export const cardName = ([n, s]) => `${rankLabel(n)}${SUIT_CHAR[s]}`;
