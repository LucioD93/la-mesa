// Lays out the line of play as a "snake" that starts at the opening tile and
// grows outward. The right arm turns downward at the edge, the left arm turns
// upward, alternating direction each lane. Units: a tile is 2 x 1.
//
// With a spinner (All Fives) the layout centers on it instead, and is a pinwheel:
// each arm snakes in its own quarter of the table, the right one down and back
// toward the spinner, the down one leftward, the left one up, the up one rightward.
import { tileHTML, tileKey } from './tiles.js';

const LANE_GAP = 2;

/**
 * Lay out one arm growing right from x=start, lanes stepping down. A lane heading right
 * turns at x=hi, one heading left at x=lo. Tiles are [matching, outer].
 */
function layoutArm(tiles, start, lo, hi) {
  const out = [];
  let x = start;
  let y = 0;
  let dir = 1;
  let afterTurn = false;

  for (const [p, q] of tiles) {
    const double = p === q;
    const crosswise = double && !afterTurn;
    const len = crosswise ? 1 : 2;
    const edge = x + dir * len;

    if (dir > 0 ? edge > hi : edge < lo) {
      // Turn the corner with a vertical tile hanging below the lane's end.
      const col = dir > 0 ? x : x - 1;
      out.push({ x: col, y: y - 0.5, w: 1, h: 2, a: p, b: q, tile: [p, q] });
      y += LANE_GAP;
      dir = -dir;
      x = dir < 0 ? col + 1 : col;
      afterTurn = true;
      continue;
    }

    const left = dir > 0 ? x : x - len;
    if (crosswise) out.push({ x: left, y: y - 1, w: 1, h: 2, a: p, b: q, tile: [p, q] });
    else out.push({ x: left, y: y - 0.5, w: 2, h: 1, a: dir > 0 ? p : q, b: dir > 0 ? q : p, tile: [p, q] });
    x = edge;
    afterTurn = false;
  }
  return out;
}

// From an arm laid out growing right with lanes stepping down, to its place on the table.
// `a` is the top or left half, so a turn that flips a tile's halves swaps them.
const TURN = {
  R: (r) => r,
  L: (r) => ({ ...r, x: -(r.x + r.w), y: -(r.y + r.h), a: r.b, b: r.a }),
  D: (r) => ({ ...r, x: -(r.y + r.h), y: r.x, w: r.h, h: r.w, ...(r.w > r.h ? {} : { a: r.b, b: r.a }) }),
  U: (r) => ({ ...r, x: r.y, y: -(r.x + r.w), w: r.h, h: r.w, ...(r.w > r.h ? { a: r.b, b: r.a } : {}) }),
};

/**
 * Where every tile goes: `line` with its opening tile at `center`, and with a spinner
 * (the index in `line` of the first double) its `up` and `down` arms. The arms reach
 * maxX across and, off a spinner, maxY up and down. Each rect has its `arm`:
 * 'L', 'R', 'U', 'D', or 'C' for the tile in the middle.
 */
export function layoutBoard({ line, center, spinner = null, up = [], down = [] }, maxX, maxY = maxX) {
  if (!line.length) return [];
  const mid = spinner ?? center;
  const [c0, c1] = line[mid];
  const middle =
    c0 === c1
      ? { x: -0.5, y: -1, w: 1, h: 2, a: c0, b: c1, tile: [c0, c1], arm: 'C' }
      : { x: -1, y: -0.5, w: 2, h: 1, a: c0, b: c1, tile: [c0, c1], arm: 'C' };
  const start = c0 === c1 ? 0.5 : 1;
  const arms = {
    R: line.slice(mid + 1),
    L: line
      .slice(0, mid)
      .reverse()
      .map(([a, b]) => [b, a]),
    U: spinner == null ? [] : up,
    D: spinner == null ? [] : down,
  };
  // Around a spinner, lanes coming back stay clear of the middle row and column, where
  // the other arms run: a crosswise double there reaches 1 to either side.
  const across = spinner == null ? [-maxX, maxX] : [2, maxX];
  const placed = {};
  for (const arm of ['L', 'R', 'U', 'D']) {
    const [from, lo, hi] = arm === 'U' || arm === 'D' ? [1, 2, maxY] : [start, ...across];
    placed[arm] = layoutArm(arms[arm], from, lo, hi).map((r) => ({ ...TURN[arm](r), arm }));
  }
  return [...placed.L.reverse(), middle, ...placed.R, ...placed.U, ...placed.D];
}

/** The rect at each end: the last of its arm, or the middle tile while the arm is empty. */
function endRects(rects) {
  const middle = rects.find((r) => r.arm === 'C');
  const ends = { L: rects[0], R: middle, U: middle, D: middle };
  for (const r of rects) if (r.arm !== 'C' && r.arm !== 'L') ends[r.arm] = r;
  return ends;
}

/** The table after `tile` goes on `end`, turned to match it. */
function boardAfter(table, [p, q], end) {
  const { line, center, spinner, up = [], down = [] } = table; // no spinner at all in plain dominoes
  const next = { line: line.slice(), center, spinner, up: up.slice(), down: down.slice() };
  if (!line.length) {
    next.line = [[p, q]];
    next.center = 0;
  } else if (end === 'L') {
    const v = line[0][0];
    next.line.unshift(q === v ? [p, q] : [q, p]);
    next.center += 1;
    if (spinner != null) next.spinner += 1;
  } else if (end === 'R') {
    const v = line[line.length - 1][1];
    next.line.push(p === v ? [p, q] : [q, p]);
  } else {
    const arm = end === 'U' ? next.up : next.down;
    const v = arm.length ? arm[arm.length - 1][1] : line[spinner][0];
    arm.push(p === v ? [p, q] : [q, p]);
  }
  if (spinner === null && p === q) next.spinner = end === 'L' ? 0 : next.line.length - 1;
  return next;
}

function bbox(rects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

const MAX_UNIT = 34;

export class BoardView {
  constructor(el) {
    this.el = el;
    this.reach = null; // the arms' [maxX, maxY] picked for this round
    this.nodes = new Map();
    this.table = { line: [], center: 0 };
    this.rects = [];
    new ResizeObserver(() => this.render()).observe(el);
  }

  /** The tiles on the table: `line` and `center`, plus `spinner`, `up` and `down` in All Fives. */
  set(table) {
    if (!table.line.length) this.reach = null; // new round: re-pick the lane width
    this.table = table;
    this.render();
  }

  /** Lay out at each arm length worth trying; only arms off a spinner need a height of their own. */
  *layouts() {
    const { up = [], down = [] } = this.table;
    const tall = up.length || down.length;
    for (let m = 3.5; m <= 16; m += 0.5)
      if (!tall) yield [m, m];
      else for (let n = 3.5; n <= 12; n += 0.5) yield [m, n];
  }

  fit(reach, W, H) {
    const rects = layoutBoard(this.table, ...reach);
    const b = bbox(rects);
    return { reach, rects, b, unit: Math.min(W / (b.w + 1), H / (b.h + 1), MAX_UNIT) };
  }

  /** Pick the lane width that gives the biggest tiles; avoid reflowing for tiny gains. */
  chooseLayout(W, H) {
    let best = null;
    for (const reach of this.layouts()) {
      const l = this.fit(reach, W, H);
      if (!best || l.unit > best.unit + 0.01) best = l;
    }
    if (this.reach && this.reach.join() !== best.reach.join()) {
      const kept = this.fit(this.reach, W, H);
      if (kept.unit * 1.2 > best.unit) return kept;
    }
    return best;
  }

  render() {
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    if (!W || !H) return;
    const seen = new Set();
    this.rects = [];

    if (this.table.line.length) {
      const { reach, rects, b, unit } = this.chooseLayout(W, H);
      this.reach = reach;
      this.rects = rects;
      const offX = (W - b.w * unit) / 2 - b.minX * unit;
      const offY = (H - b.h * unit) / 2 - b.minY * unit;
      this.el.style.setProperty('--u', `${unit}px`);
      this.geom = { offX, offY, unit };

      const ends = endRects(rects);
      for (const r of rects) {
        const key = tileKey(r.tile);
        seen.add(key);
        let node = this.nodes.get(key);
        const horizontal = r.w > r.h;
        const sig = `${r.a}${r.b}${horizontal}`;
        if (!node) {
          node = document.createElement('div');
          node.className = 'tile fresh';
          node.addEventListener('animationend', () => node.classList.remove('fresh'), { once: true });
          this.el.appendChild(node);
          this.nodes.set(key, node);
        }
        if (node.dataset.sig !== sig) {
          node.dataset.sig = sig;
          node.innerHTML = tileHTML(r.a, r.b, horizontal);
        }
        node.classList.toggle('h', horizontal);
        node.classList.toggle('v', !horizontal);
        for (const end of ['L', 'R', 'U', 'D']) node.classList.toggle(`end-${end.toLowerCase()}`, r === ends[end]);
        node.style.left = `${offX + r.x * unit}px`;
        node.style.top = `${offY + r.y * unit}px`;
        node.style.width = `${r.w * unit}px`;
        node.style.height = `${r.h * unit}px`;
      }
    }

    for (const [key, node] of this.nodes) {
      if (!seen.has(key)) {
        node.remove();
        this.nodes.delete(key);
      }
    }
  }

  /** Where `tile` would land if played on `end`, in board pixels. */
  landing(tile, end) {
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const after = boardAfter(this.table, tile, end);
    let r, offX, offY, unit;
    if (!this.table.line.length) {
      const rects = layoutBoard(after, 16);
      const b = bbox(rects);
      unit = Math.min(W / (b.w + 1), H / (b.h + 1), MAX_UNIT);
      offX = (W - b.w * unit) / 2 - b.minX * unit;
      offY = (H - b.h * unit) / 2 - b.minY * unit;
      r = rects[0];
    } else {
      if (!this.geom || !this.rects.length) return null;
      ({ offX, offY, unit } = this.geom);
      const rects = layoutBoard(after, ...this.reach);
      const key = tileKey(tile);
      r = rects.find((x) => tileKey(x.tile) === key);
      // A first double recenters the table on itself: keep the tile it joins where it is now.
      const joins = tileKey(endRects(this.rects)[end].tile);
      const now = this.rects.find((x) => tileKey(x.tile) === joins);
      const then = rects.find((x) => tileKey(x.tile) === joins);
      r = { ...r, x: r.x + now.x - then.x, y: r.y + now.y - then.y };
    }
    return {
      left: offX + r.x * unit,
      top: offY + r.y * unit,
      width: r.w * unit,
      height: r.h * unit,
      horizontal: r.w > r.h,
      a: r.a,
      b: r.b,
    };
  }

  /** Outline where the dragged tile will land; pass null to hide it. */
  preview(tile, end) {
    const spot = tile && this.landing(tile, end);
    if (!spot) {
      this.previewEl?.remove();
      this.previewEl = null;
      return;
    }
    if (!this.previewEl) {
      this.previewEl = document.createElement('div');
      this.el.appendChild(this.previewEl);
    }
    const el = this.previewEl;
    const sig = `${spot.a}${spot.b}${spot.horizontal}`;
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.innerHTML = tileHTML(spot.a, spot.b, spot.horizontal);
    }
    el.className = `tile drop-preview ${spot.horizontal ? 'h' : 'v'}`;
    el.style.left = `${spot.left}px`;
    el.style.top = `${spot.top}px`;
    el.style.width = `${spot.width}px`;
    el.style.height = `${spot.height}px`;
  }
}
