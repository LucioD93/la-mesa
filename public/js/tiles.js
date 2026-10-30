// Domino tile rendering. Pip cells are indexed 0..8 on a 3x3 grid (row-major)
// for a half in a vertical tile; horizontal tiles rotate the pattern.
const PIPS = {
  0: [],
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const rotate = (cell) => {
  const r = Math.floor(cell / 3);
  const c = cell % 3;
  return c * 3 + (2 - r);
};

export function halfHTML(n, horizontal) {
  const cells = horizontal ? PIPS[n].map(rotate) : PIPS[n];
  let dots = '';
  for (const cell of cells) {
    dots += `<i style="grid-area:${Math.floor(cell / 3) + 1}/${(cell % 3) + 1}"></i>`;
  }
  return `<span class="half p${n}">${dots}</span>`;
}

/** a = top (vertical) or left (horizontal) value. */
export function tileHTML(a, b, horizontal) {
  return `${halfHTML(a, horizontal)}<span class="bar"></span>${halfHTML(b, horizontal)}`;
}

export const tileKey = (t) => (t[0] <= t[1] ? `${t[0]}-${t[1]}` : `${t[1]}-${t[0]}`);
