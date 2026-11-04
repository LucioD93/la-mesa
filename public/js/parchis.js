// The parchís table: the board, turned so your nest is at the bottom left, the pieces
// hopping along it, and the dice. Coordinates are grid cells, 0 to 18 across.
import { canFly } from './flight.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const NEST = -1;
const ENTRY = 63;
const GOAL = 71;
const CELLS = 19;
const COLORS = ['#facc15', '#3b82f6', '#ef4444', '#22c55e'];
const COLOR_KEYS = ['yellow', 'blue', 'red', 'green'];

const TUMBLE_MS = 550;
const TUMBLE_FRAME_MS = 70;
const HOP_MS = 120; // keep these two in step with server/games/parchis.js
const MAX_HOP_MS = 1400;
const NEAR_CELLS = 1.8; // a tap this close to a piece that can move counts as that piece
const MOVE_LOCK_MS = 1500; // a double tap only sends once

const ccw = ([x, y]) => [y, 18 - x];
const cw = ([x, y]) => [18 - y, x];
const turned = (cell, times, by = ccw) => {
  let out = cell;
  for (let i = 0; i < times; i++) out = by(out);
  return out;
};

// One arm's worth of the route, squares 1 to 17. The other arms are the same, turned.
const ARM = [
  ...Array.from({ length: 8 }, (_, i) => [10, 18 - i]),
  ...Array.from({ length: 8 }, (_, i) => [11 + i, 10]),
  [18, 9],
];
const RING = [0, 1, 2, 3].flatMap((c) => ARM.map((cell) => turned(cell, c)));
const SAFE = [0, 1, 2, 3].flatMap((c) => [4, 11, 16].map((s) => s + c * 17));
const startOf = (color) => (4 + color * 17) % 68;

/** Where a color's piece stands at a position, on the board with yellow at the bottom. */
function baseCell(color, piece, pos) {
  if (pos === NEST) {
    const dx = piece % 2 ? 1.75 : -1.75;
    const dy = piece < 2 ? -1.75 : 1.75;
    return turned([14.5 + dx, 14.5 + dy], color);
  }
  if (pos === GOAL) return turned([9 + (piece - 1.5) * 0.62, 10.05], color);
  if (pos <= ENTRY) return RING[(startOf(color) + pos) % 68];
  return turned([9, 17 - (pos - ENTRY - 1)], color);
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieFace = (n) => Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');

export function createView(ctx) {
  const { $, esc, me, seatName, seatEl, toast, buzz, send, teamLabel } = ctx;
  let boardKey = null; // the point of view and language the board is drawn in
  let faces = [1];
  let chosen = null; // the steps picked to move with, when there's a choice
  let rolling = false;
  let tumbleTimer;
  let sent = null; // the moment we last answered: { seq, at }

  /** Grid cell to screen, for whoever's looking: their nest goes bottom left. */
  const screen = (cell) => turned(cell, (me() === -1 ? 0 : me()) + 1, cw);
  const percent = (v) => `${((v + 0.5) / CELLS) * 100}%`;

  function boardSVG() {
    const parts = [];
    const square = (cell, fill, extra = '') => {
      const [x, y] = screen(cell);
      parts.push(`<rect x="${x - 0.5}" y="${y - 0.5}" width="1" height="1" fill="${fill}" stroke="#334155" stroke-width="0.05"/>${extra && `<circle cx="${x}" cy="${y}" r="0.26" fill="${extra}"/>`}`);
    };
    parts.push(`<rect x="-0.5" y="-0.5" width="19" height="19" rx="0.5" fill="#f8f5ea"/>`);
    COLORS.forEach((fill, c) => {
      const [x, y] = screen(turned([14.5, 14.5], c));
      parts.push(`<rect class="pnest" data-nest="${c}" x="${x - 3.8}" y="${y - 3.8}" width="7.6" height="7.6" rx="0.7" fill="${fill}"/>`);
      parts.push(`<circle cx="${x}" cy="${y}" r="3.3" fill="#fff" opacity="0.55"/>`);
      for (let i = 0; i < 4; i++) {
        const [sx, sy] = screen(baseCell(c, i, NEST));
        parts.push(`<circle cx="${sx}" cy="${sy}" r="0.75" fill="${fill}" stroke="rgba(0,0,0,.3)" stroke-width="0.06"/>`);
      }
    });
    RING.forEach((cell, i) => {
      const start = COLORS.findIndex((_, c) => startOf(c) === i);
      if (start !== -1) square(cell, COLORS[start], '#fff');
      else if (SAFE.includes(i)) square(cell, '#cbd5e1', '#94a3b8');
      else square(cell, '#fffdf6');
    });
    COLORS.forEach((fill, c) => {
      for (let i = 0; i < 7; i++) square(turned([9, 17 - i], c), fill);
      const points = [[7.5, 10.5], [10.5, 10.5], [9, 9]].map((p) => screen(turned(p, c)).join(',')).join(' ');
      parts.push(`<polygon points="${points}" fill="${fill}" stroke="#334155" stroke-width="0.05"/>`);
    });
    return `<svg viewBox="-0.5 -0.5 19 19" aria-hidden="true">${parts.join('')}</svg>`;
  }

  function drawBoard() {
    boardKey = `${me()}:${i18n.lang}`;
    const tokens = COLORS.flatMap((_, c) =>
      [0, 1, 2, 3].map((i) => `<button class="token" data-color="${c}" data-piece="${i}" aria-label="${t('aria.token', { color: t(`color.${COLOR_KEYS[c]}`) })}"></button>`),
    );
    $('board').innerHTML = `<div class="pboard" id="pboard">${boardSVG()}<div class="pdests" id="pdests"></div>${tokens.join('')}</div>`;
  }

  const tokenEl = (color, piece) => $('pboard').querySelector(`[data-color="${color}"][data-piece="${piece}"]`);

  /** Every piece's place on screen, with two on one square side by side. */
  function placesOf(pieces) {
    const groups = new Map();
    pieces.forEach((list, color) =>
      list.forEach((pos, piece) => {
        const [x, y] = baseCell(color, piece, pos);
        const shared = pos !== NEST && pos !== GOAL;
        const key = shared ? `${x},${y}` : `${color}:${piece}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ color, piece, pos, cell: [x, y] });
      }),
    );
    const places = [];
    for (const group of groups.values()) {
      group.forEach((g, i) => {
        const [x, y] = screen(g.cell);
        const off = group.length === 2 ? (i ? 0.2 : -0.2) : 0;
        places.push({ ...g, x: x + off, y: y + off, barrier: group.length === 2 && group[0].color === group[1].color });
      });
    }
    return places;
  }

  /** The moves for the steps picked: the player's choice, or the first that can be used. */
  function activeMoves(r) {
    const moves = !rolling && ctx.state.phase === 'playing' ? r?.options.moves ?? [] : [];
    if (!moves.length) return moves;
    const steps = moves.some((m) => m.uses.includes(chosen)) ? chosen : moves[0].uses[0];
    return moves.filter((m) => m.uses.includes(steps));
  }

  function paintTokens(r) {
    const moves = activeMoves(r);
    const pieces = r?.pieces ?? COLORS.map(() => [NEST, NEST, NEST, NEST]);
    for (const p of placesOf(pieces)) {
      const el = tokenEl(p.color, p.piece);
      el.style.left = percent(p.x);
      el.style.top = percent(p.y);
      el.classList.toggle('in-nest', p.pos === NEST);
      el.classList.toggle('home', p.pos === GOAL);
      el.classList.toggle('barrier', p.barrier);
      el.classList.toggle('can', moves.some((m) => m.color === p.color && m.piece === p.piece));
    }
    $('pdests').innerHTML = [...new Map(moves.map((m) => [m.to === GOAL ? `g${m.piece}` : baseCell(m.color, m.piece, m.to).join(), m])).values()]
      .map((m) => {
        const [x, y] = screen(baseCell(m.color, m.piece, m.to));
        return `<i class="pdest" style="left:${percent(x)};top:${percent(y)}"></i>`;
      })
      .join('');
    for (const nest of $('pboard').querySelectorAll('.pnest')) nest.classList.toggle('active', Number(nest.dataset.nest) === r?.turn);
  }

  // ---- movement -----------------------------------------------------------------

  const hopTime = (from, to) => Math.min((from === NEST || to === NEST ? 1 : to - from) * HOP_MS, MAX_HOP_MS);

  /** Walk the moved piece square by square, then send anything it took back to its nest. */
  function animate(la) {
    if (!canFly()) return;
    const el = tokenEl(la.color, la.piece);
    const frame = ([x, y]) => ({ left: percent(x), top: percent(y) });
    const at = (color, piece, pos) => screen(baseCell(color, piece, pos));
    const duration = hopTime(la.from, la.to);
    if (la.type === 'move') {
      const route = [at(la.color, la.piece, la.from)];
      if (la.from === NEST) route.push(at(la.color, la.piece, 0));
      else for (let p = la.from + 1; p <= la.to; p++) route.push(at(la.color, la.piece, p));
      route[route.length - 1] = [parseFloat(el.style.left) / (100 / CELLS) - 0.5, parseFloat(el.style.top) / (100 / CELLS) - 0.5];
      el.animate(route.map(frame), { duration, easing: 'linear' });
    } else {
      el.animate([at(la.color, la.piece, la.from), at(la.color, la.piece, NEST)].map(frame), { duration: 500, easing: 'ease-in' });
    }
    if (la.captured) {
      const { color, piece, from } = la.captured;
      const home = at(color, piece, NEST);
      tokenEl(color, piece).animate([at(color, piece, from), home].map(frame), { delay: duration, duration: 500, easing: 'ease-in', fill: 'backwards' });
    }
  }

  function shout(seat, text, cls) {
    const rect = seatEl(seat).getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `shout ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(rect.left + rect.width / 2, 130), innerWidth - 130)}px`;
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.addEventListener('animationend', () => el.remove());
    document.body.append(el);
  }

  // ---- the dice -----------------------------------------------------------------

  function renderActions() {
    const el = $('actions');
    const r = ctx.state.round;
    if (!r || ctx.state.phase === 'lobby') return void (el.innerHTML = '');
    const canRoll = r.options.roll && !rolling && ctx.state.phase === 'playing';
    const color = r.lastRoll && !r.options.roll ? r.lastRoll.seat : r.turn ?? r.lastRoll?.seat ?? 0;
    const shown = Array.from({ length: r.dice }, (_, i) => faces[i] ?? 1);
    const dice = shown.map(
      (n) =>
        `<button class="pdie ${rolling ? 'tumble' : ''} ${canRoll ? 'rollable' : ''}" data-roll data-color="${color}" aria-label="${t('aria.die', { n })}" ${canRoll ? '' : 'disabled'}>${dieFace(n)}</button>`,
    );
    // With moves to pick from, each step is a button that picks it.
    const moves = rolling ? [] : r.options.moves;
    const active = activeMoves(r)[0]?.uses ?? [];
    const steps = rolling
      ? ''
      : r.pending
          .map((n) => {
            const usable = moves.some((m) => m.uses.includes(n));
            return `<button class="pstep ${active.includes(n) ? 'on' : ''}" data-steps="${n}" ${usable ? '' : 'disabled'}>+${n}</button>`;
          })
          .join('');
    el.innerHTML = `${dice.join('')}${canRoll ? `<button class="call count" data-roll>${t('roll')}</button>` : ''}${steps}`;
  }

  function tumble(values, done) {
    clearInterval(tumbleTimer);
    chosen = null;
    if (!canFly()) {
      faces = values;
      return done();
    }
    rolling = true;
    const started = Date.now();
    tumbleTimer = setInterval(() => {
      if (Date.now() - started >= TUMBLE_MS) {
        clearInterval(tumbleTimer);
        rolling = false;
        faces = values;
        return done();
      }
      for (const die of $('actions').querySelectorAll('.pdie')) die.innerHTML = dieFace(1 + Math.floor(Math.random() * 6));
    }, TUMBLE_FRAME_MS);
  }

  function stopTumble() {
    clearInterval(tumbleTimer);
    rolling = false;
  }

  function repaint() {
    const r = ctx.state.round;
    if (!r) return;
    renderActions();
    paintTokens(r);
  }

  // ---- answering ----------------------------------------------------------------

  const locked = (r) => sent?.seq === r.seq && Date.now() - sent.at < MOVE_LOCK_MS;

  function answer(r, msg) {
    if (locked(r)) return;
    sent = { seq: r.seq, at: Date.now() };
    send(msg);
    buzz(15);
  }

  /** The piece a tap means: the one under it, or the nearest that can move. Squares are tiny on a phone. */
  function pieceAt(e) {
    const direct = e.target.closest('.token.can');
    if (direct) return direct;
    const box = $('pboard').getBoundingClientRect();
    const scale = CELLS / box.width;
    let best = null;
    let bestGap = NEAR_CELLS;
    for (const el of $('pboard').querySelectorAll('.token.can')) {
      const at = el.getBoundingClientRect();
      const gap = Math.hypot(at.left + at.width / 2 - e.clientX, at.top + at.height / 2 - e.clientY) * scale;
      if (gap < bestGap) {
        bestGap = gap;
        best = el;
      }
    }
    return best;
  }

  $('board').addEventListener('click', (e) => {
    const r = ctx.state?.round;
    if (ctx.state?.game !== 'parchis' || !r || ctx.state.phase !== 'playing' || rolling) return;
    if (r.options.roll) return toast(t('rollFirst'), 1200);
    if (!r.options.moves.length) return r.turn !== me() && me() !== -1 && e.target.closest('.token') ? toast(t('waitFor', { name: seatName(r.turn) }), 1200) : undefined;
    const el = pieceAt(e);
    if (el) {
      const color = Number(el.dataset.color);
      const piece = Number(el.dataset.piece);
      const { uses } = activeMoves(r).find((m) => m.color === color && m.piece === piece);
      answer(r, { t: 'move', color, piece, steps: uses[0] });
    }
    else toast(t('pickPiece'), 1200);
  });

  $('actions').addEventListener('click', (e) => {
    const r = ctx.state?.round;
    if (ctx.state?.game !== 'parchis' || !r || rolling) return;
    const step = e.target.closest('[data-steps]');
    if (step) {
      chosen = Number(step.dataset.steps);
      return repaint();
    }
    if (e.target.closest('[data-roll]') && r.options.roll) answer(r, { t: 'roll' });
  });

  return {
    handPiece: '.no-hand-piece',
    ghostScale: 1,

    mount() {
      faces = [1];
      chosen = null;
      drawBoard();
    },

    unmount() {
      stopTumble();
      $('actions').innerHTML = '';
      $('board').innerHTML = '';
    },

    renderBoard(prev) {
      const r = ctx.state.round;
      if (boardKey !== `${me()}:${i18n.lang}`) drawBoard();
      const sameRound = !!prev?.round && prev.roundNo === ctx.state.roundNo;
      if (!sameRound) stopTumble();
      const newRoll = r?.lastRoll && sameRound && r.lastRoll.n !== prev.round.lastRoll?.n;
      if (newRoll) {
        tumble(r.lastRoll.values, repaint);
      } else if (!rolling) faces = r?.lastRoll?.values ?? faces;
      renderActions();
      paintTokens(r);
      const la = r?.lastAction;
      if (la && sameRound && la.n !== prev.round.lastAction?.n) animate(la);
    },

    feedback(prev) {
      const r = ctx.state.round;
      if (!r || !prev?.round || prev.roundNo !== ctx.state.roundNo) return;
      const roll = r.lastRoll;
      if (roll && roll.n !== prev.round.lastRoll?.n) {
        sound.play('dice');
        if (roll.penalty) {
          setTimeout(() => {
            shout(roll.seat, t(roll.values.length === 2 ? 'threeDoubles' : 'threeSixes'), 'noquiero');
            sound.play('mock');
          }, TUMBLE_MS);
        } else if (roll.passed && roll.seat === me()) setTimeout(() => toast(t('noMove'), 1400), TUMBLE_MS);
      }
      const la = r.lastAction;
      if (la?.type === 'move' && la.n !== prev.round.lastAction?.n) {
        setTimeout(() => {
          sound.play('place');
          if (la.captured) {
            shout(la.seat, `${t('captured')} +20`, 'caida');
            sound.play('truco');
            buzz([40, 30, 60]);
          } else if (la.to === GOAL) {
            shout(la.seat, `${t('reachedGoal')} +10`, 'flor');
            sound.play('flor');
          }
          if (la.phrase) sound.playClip('manguangua');
        }, canFly() ? hopTime(la.from, la.to) : 0);
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && (s.round.options.roll || s.round.options.moves.length > 0),
    turnAlert: () => true,
    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat) {
      const r = ctx.state.round;
      const home = r ? r.pieces[seat].filter((p) => p === GOAL).length : 0;
      return {
        badge: '',
        info: `<span class="ptally"><i class="pswatch" data-color="${seat}"></i>${home}/4</span>`,
        bubble: '',
      };
    },

    // ---- the hand: parchís has none, the shell still asks -----------------------

    handKeys: () => [],
    handPieceHTML: () => '',
    dressGhost() {},
    dragOver() {},
    dragClear() {},
    drop: () => () => {},

    status(r) {
      if (r.options.roll) return { cls: 'mine', text: t(r.dice === 2 ? 'rollDice' : 'rollDie') };
      const moves = r.options.moves;
      if (moves.length) return { cls: 'mine', text: moves[0].color === me() ? t('pickPiece') : t('pickPartner') };
      return null;
    },

    // ---- results ------------------------------------------------------------

    resultDelay() {
      const la = ctx.state.round.lastAction;
      return (la ? hopTime(la.from, la.to) : 0) + 900;
    },

    result() {
      const r = ctx.state.round;
      const winTeam = r.over.team;
      const gained = [0, 0];
      gained[winTeam] = 1;
      return {
        winTeam,
        gained,
        emoji: '🎲',
        sub: '',
        lastRound: null,
        tie: null,
        details: `<div class="ra"><span>${esc(t('captures'))}</span><b>${teamLabel(0)} ${r.captures[0]} · ${teamLabel(1)} ${r.captures[1]}</b></div>`,
      };
    },

    historyRow(h) {
      return {
        cell: (team) => (h.team === team ? '+1' : '·'),
        how: esc(`${t('captures')} ${h.captures[0]}–${h.captures[1]}`),
      };
    },
  };
}
