// Lays out the line of play as a "snake" that starts at the opening tile and
// grows outward. The right arm turns downward at the edge, the left arm turns
// upward, alternating direction each lane. Units: a tile is 2 x 1.
import { tileHTML, tileKey } from './tiles.js';

const LANE_GAP = 2;

/** Lay out one arm growing right from x=startX. Tiles are [matching, outer]. */
function layoutArm(tiles, startX, maxX) {
  const out = [];
  let x = startX;
  let y = 0;
  let dir = 1;
  let afterTurn = false;

  for (const [p, q] of tiles) {
    const double = p === q;
    const crosswise = double && !afterTurn;
    const len = crosswise ? 1 : 2;
    const edge = x + dir * len;

    if (dir > 0 ? edge > maxX : edge < -maxX) {
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

const rotate180 = (r) => ({ ...r, x: -(r.x + r.w), y: -(r.y + r.h), a: r.b, b: r.a });

export function layoutLine(line, center, maxX) {
  if (!line.length) return [];
  const [c0, c1] = line[center];
  const opening =
    c0 === c1
      ? { x: -0.5, y: -1, w: 1, h: 2, a: c0, b: c1, tile: [c0, c1] }
      : { x: -1, y: -0.5, w: 2, h: 1, a: c0, b: c1, tile: [c0, c1] };
  const start = c0 === c1 ? 0.5 : 1;
  const right = line.slice(center + 1);
  const left = line
    .slice(0, center)
    .reverse()
    .map(([a, b]) => [b, a]);
  const rightArm = layoutArm(right, start, maxX);
  const leftArm = layoutArm(left, start, maxX).map(rotate180);
  rightArm.forEach((r) => (r.arm = 'R'));
  leftArm.forEach((r) => (r.arm = 'L'));
  return [...leftArm.reverse(), opening, ...rightArm];
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
    this.maxX = null;
    this.nodes = new Map();
    this.line = [];
    this.center = 0;
    new ResizeObserver(() => this.render()).observe(el);
  }

  set(line, center) {
    if (!line.length) this.maxX = null; // new round: re-pick the lane width
    this.line = line;
    this.center = center;
    this.render();
  }

  /** Pick the lane width that gives the biggest tiles; avoid reflowing for tiny gains. */
  chooseLayout(W, H) {
    let best = null;
    for (let m = 3.5; m <= 16; m += 0.5) {
      const rects = layoutLine(this.line, this.center, m);
      const b = bbox(rects);
      const unit = Math.min(W / (b.w + 1), H / (b.h + 1), MAX_UNIT);
      if (!best || unit > best.unit + 0.01) best = { m, rects, b, unit };
    }
    if (this.maxX != null && this.maxX !== best.m) {
      const rects = layoutLine(this.line, this.center, this.maxX);
      const b = bbox(rects);
      const unit = Math.min(W / (b.w + 1), H / (b.h + 1), MAX_UNIT);
      if (unit * 1.2 > best.unit) return { m: this.maxX, rects, b, unit };
    }
    return best;
  }

  render() {
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    if (!W || !H) return;
    const seen = new Set();

    if (this.line.length) {
      const { m, rects, b, unit } = this.chooseLayout(W, H);
      this.maxX = m;
      const offX = (W - b.w * unit) / 2 - b.minX * unit;
      const offY = (H - b.h * unit) / 2 - b.minY * unit;
      this.el.style.setProperty('--u', `${unit}px`);

      const lastL = rects[0];
      const lastR = rects[rects.length - 1];
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
        node.classList.toggle('end-l', r === lastL);
        node.classList.toggle('end-r', r === lastR);
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

  /** Highlight the board ends a selected tile can go to. */
  highlight(ends) {
    for (const node of this.nodes.values()) {
      node.classList.toggle('target-l', !!ends?.includes('L') && node.classList.contains('end-l'));
      node.classList.toggle('target-r', !!ends?.includes('R') && node.classList.contains('end-r'));
    }
  }
}
