// The deal: the pieces mixed in the middle of the table (dominoes swirled face down, a deck
// riffled), then handed out one at a time. Yours land in your hand and turn over, the table's
// land in their places, and the others' go to their seats. The server holds the first bot
// move back for it (DEAL_MS and REDEAL_MS in server/games/common.js).
import { canFly, hold } from './flight.js';
import * as sound from './sound.js';

const MIX_MS = 1100;
const SETTLE_MS = 160; // between the mix and the first piece leaving
const HAND_OUT_MS = 1500; // from the first piece leaving to the last one landing
const FLY_MS = 400;
const MAX_REST = 12; // pieces drawn for what stays in the deck

const rand = (a, b) => a + Math.random() * (b - a);
const DOMINO = { cls: 'tile v', ratio: 2, perRow: 7 };

export function createDeal({ $, seatAvatar }) {
  let run = null; // { els, timers, keys (still on their way), hidden (until the end), release }

  /** The hand or table piece a key is dealt to, wherever the table has redrawn it. */
  const find = (key) => $('hand').querySelector(`[data-key="${key}"]`) ?? $('board').querySelector(`[data-key="${key}"]`);

  const hides = (key) => !!run && (run.keys.has(key) || run.hidden.has(key));

  function stop() {
    if (!run) return;
    run.els.forEach((el) => el.remove());
    run.timers.forEach(clearTimeout);
    run.release?.();
    run = null;
    document.body.classList.remove('dealing');
    for (const el of document.querySelectorAll('.undealt')) el.classList.remove('undealt');
  }

  /** Hide what the deal hasn't reached yet, after the table or hand was redrawn. */
  function mark() {
    if (!run) return;
    for (const el of document.querySelectorAll('#hand [data-key], #board [data-key]')) el.classList.toggle('undealt', hides(el.dataset.key));
  }

  /**
   * Deal `drops` in order: { key } lands on the hand or table piece with that data-key, which
   * stays hidden until then; { seat } goes to that seat. `mix` is 'tiles' (each drop then
   * needs a `row` to line up in) or 'cards', or null to just deal. Tiles are dominoes unless
   * `piece` says otherwise: its class, height over width, and how many line up in a row. `rest` more cards stay in
   * the deck, and `hide` lists keys hidden until the deal is done. `wait` delays the start,
   * so a card still in the air lands first.
   */
  function start({ mix = null, drops, rest = 0, hide = [], origin = null, wait = 0, piece = DOMINO }) {
    stop();
    if (!canFly()) return;
    const b = $('board').getBoundingClientRect();
    if (!b.width || !b.height) return;
    run = { els: [], timers: [], keys: new Set(drops.filter((d) => d.key).map((d) => d.key)), hidden: new Set(hide), release: hold('deal') };
    document.body.classList.add('dealing');
    mark();
    const state = run;
    state.timers.push(setTimeout(() => state === run && animate(state, { mix, drops, rest, origin, b, piece }), wait));
  }

  function animate(state, { mix, drops, rest, origin, b, piece }) {
    const tiles = mix === 'tiles';
    const o = origin?.getBoundingClientRect();
    // Four rows of tiles, a quarter of a tile apart.
    const tileW = Math.min(b.width / (piece.perRow * 1.25 + 0.25), b.height / (4 * (piece.ratio + 0.25) + 1), 28);
    const w = o?.width || (tiles ? tileW : Math.min(b.width / 6, b.height / 4.5, 60));
    const h = tiles ? w * piece.ratio : w * 1.5;
    const cx = o ? o.left + o.width / 2 : b.left + b.width / 2;
    const cy = o ? o.top + o.height / 2 : b.top + b.height / 2;
    const at = (x, y, rot = 0, scale = 1) => `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${rot}deg) scale(${scale})`;
    const n = drops.length;
    const extra = tiles ? 0 : Math.min(rest, MAX_REST);
    const total = n + extra;

    // Where each piece sits once mixed: tiles in a row per seat, cards in one deck (the
    // first one dealt on top).
    const counts = {};
    const home = [];
    for (let i = 0; i < total; i++) {
      if (tiles) {
        const row = drops[i].row;
        const col = (counts[row] = (counts[row] ?? -1) + 1);
        home.push([cx + (col - (piece.perRow - 1) / 2) * w * 1.25, cy + (row - 1.5) * (h + w * 0.25)]);
      } else home.push([cx - (total - i) * 0.25, cy - (total - i) * 0.45]);
    }

    const els = [];
    for (let i = total - 1; i >= 0; i--) {
      const el = document.createElement(tiles ? 'div' : 'span');
      el.className = tiles ? `${piece.cls} deal-piece` : 'card deal-piece';
      if (!tiles) el.innerHTML = '<span class="flier-back"></span>';
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.setProperty(tiles ? '--u' : '--cw', `${w}px`);
      el.style.transform = at(...home[i]);
      document.body.append(el); // the first piece dealt goes in last, on top
      state.els.push(el);
      els[i] = el;
    }

    const mixMs = mix ? MIX_MS : 0;
    if (mix === 'tiles') {
      sound.play('shuffle');
      // Poured out in the middle, swirled around face down, then lined up.
      els.forEach((el, i) => {
        let rot = rand(0, 360);
        const frames = [{ transform: at(cx + rand(-8, 8), cy + rand(-8, 8), rot, 0.4), opacity: 0 }];
        for (const offset of [0.22, 0.45, 0.68]) {
          rot += rand(-140, 140);
          const x = cx + rand(-0.38, 0.38) * b.width;
          const y = cy + rand(-0.36, 0.36) * b.height;
          frames.push({ transform: at(x, y, rot), opacity: 1, offset });
        }
        frames.push({ transform: at(...home[i]), opacity: 1 });
        el.animate(frames, { duration: MIX_MS - 160, delay: i * 6, easing: 'ease-in-out', fill: 'backwards' });
      });
    } else if (mix === 'cards') {
      // Split in two and riffled back together, twice: once alternating, once a cut.
      sound.play('riffle');
      state.timers.push(setTimeout(() => sound.play('riffle'), MIX_MS * 0.5));
      els.forEach((el, i) => {
        const [x, y] = home[i];
        const half = (side) => ({ transform: at(x + side * w * 0.62, y + w * 0.08, side * -7) });
        const a = i % 2 ? -1 : 1;
        const c = i < total / 2 ? -1 : 1;
        el.animate([{ transform: at(x, y) }, { ...half(a), offset: 0.18 }, { transform: at(x, y), offset: 0.42 }, { ...half(c), offset: 0.62 }, { transform: at(x, y), offset: 0.86 }, { transform: at(x, y) }], {
          duration: MIX_MS,
          delay: (i % 8) * 8,
          easing: 'ease-in-out',
        });
      });
    } else {
      // Nothing to mix: the deck just shows up to deal from.
      els.forEach((el) => el.animate([{ opacity: 0, transform: `${el.style.transform} scale(0.8)` }, { opacity: 1 }], { duration: SETTLE_MS, easing: 'ease-out' }));
    }

    const gap = n > 1 ? (HAND_OUT_MS - FLY_MS) / (n - 1) : 0;
    let left = n;
    drops.forEach((drop, i) => {
      const el = els[i];
      const done = () => {
        el.remove();
        if (drop.key) {
          state.keys.delete(drop.key);
          const live = find(drop.key);
          live?.classList.remove('undealt');
          live?.classList.add('dealt');
          sound.play('deal');
        }
        if (--left === 0 && state === run) stop();
      };
      state.timers.push(
        setTimeout(() => {
          const target = drop.key ? find(drop.key) : seatAvatar(drop.seat);
          if (!target) return done();
          const r = target.getBoundingClientRect();
          const [x0, y0] = home[i];
          const tx = r.left + r.width / 2;
          const ty = r.top + r.height / 2;
          const end = drop.key ? at(tx, ty, 0, r.width / w) : at(tx, ty, rand(-30, 30), 0.35);
          // A small hop on the way, so it's picked up rather than slid.
          const mid = at((x0 + tx) / 2, (y0 + ty) / 2 - Math.hypot(tx - x0, ty - y0) * 0.15, 0, 1.15);
          const flight = el.animate([{ transform: at(x0, y0) }, { transform: mid, opacity: 1, offset: 0.6 }, { transform: end, opacity: drop.key ? 1 : 0 }], {
            duration: FLY_MS,
            easing: 'ease-in',
            fill: 'forwards',
          });
          flight.onfinish = done;
        }, mixMs + SETTLE_MS + i * gap),
      );
    });
  }

  return { start, stop, mark, hides };
}

/**
 * One piece at a time round the table from `first`, `each` per seat. Mine go to the keys in
 * my hand, in the order it shows them.
 */
export function roundTable({ first, each, me, mine }) {
  const drops = [];
  for (let k = 0; k < each * 4; k++) {
    const seat = (first + k) % 4;
    const key = seat === me ? mine[Math.floor(k / 4)] : null;
    drops.push(key ? { key, seat } : { seat });
  }
  return drops;
}
