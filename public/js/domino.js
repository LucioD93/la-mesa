// The domino table: the line of tiles, dragging a tile to an end, and how a round reads.
import { BoardView } from './board.js';
import { tileHTML, tileKey } from './tiles.js';
import { canFly, FLIGHT_MS, launch, whenLanded } from './flight.js';
import { roundTable } from './deal.js';
import * as sound from './sound.js';
import { t } from './i18n.js';

const sortHand = (hand) =>
  hand
    .map((t) => (t[0] <= t[1] ? t : [t[1], t[0]]))
    .sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);

export function createView(ctx) {
  const { $, esc, me, seatName, seatAvatar, toast, buzz, shake, send, laughAtMe, within, teamLabel } = ctx;
  let board = null;

  const pickEnds = (key) => [...new Set(ctx.state.round.legal.filter((m) => tileKey(m.tile) === key).map((m) => m.end))];

  /** Which legal end ('L' / 'R') is the pointer over? */
  function dropTarget(key, x, y) {
    if (within('hand', x, y)) return null; // over the hand it's rearranging, not playing
    const ends = pickEnds(key);
    if (!ctx.state.round.line.length) return within('board', x, y) && ends.length ? { end: ends[0], node: null } : null;

    const unit = parseFloat(getComputedStyle($('board')).getPropertyValue('--u')) || 24;
    const reach = Math.max(52, unit * 2.6);
    let best = null;
    for (const end of ends) {
      const node = [...board.nodes.values()].find((n) => n.classList.contains(end === 'L' ? 'end-l' : 'end-r'));
      if (!node) continue;
      const r = node.getBoundingClientRect();
      const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (dist > reach) continue;
      // A lone opening tile is both ends: pick the side the tile is dropped on.
      const side = x < r.left + r.width / 2 ? 'L' : 'R';
      const score = dist + (ends.length > 1 && end !== side ? 0.5 : 0);
      if (!best || score < best.score) best = { end, node, score };
    }
    return best;
  }

  function impact(node, team) {
    sound.play('place');
    const ring = document.createElement('span');
    ring.className = 'impact';
    ring.dataset.team = team;
    ring.style.left = `${node.offsetLeft + node.offsetWidth / 2}px`;
    ring.style.top = `${node.offsetTop + node.offsetHeight / 2}px`;
    ring.addEventListener('animationend', () => ring.remove());
    $('board').append(ring);
    const el = $('board');
    el.classList.remove('thud');
    void el.offsetWidth; // restart the animation if one is still showing
    el.classList.add('thud');
  }

  /** Fly a tile from the seat that played it to its spot on the board. */
  function flyTile({ seat, tile }) {
    const node = board.nodes.get(tileKey(tile));
    const avatar = seatAvatar(seat);
    if (!node || !avatar || !canFly()) return sound.play('place');

    node.classList.remove('fresh');
    node.classList.add('incoming'); // the real tile stays hidden until this one lands

    const flier = document.createElement('div');
    flier.className = `tile flier ${node.classList.contains('h') ? 'h' : 'v'}`;
    flier.dataset.team = seat % 2;
    flier.innerHTML = `${node.innerHTML}<span class="flier-back"></span>`;

    launch({
      seat,
      avatar,
      flier,
      target: () => (node.isConnected ? node : null), // gone if a new round started mid-flight
      fit: (r) => {
        flier.style.width = `${r.width}px`;
        flier.style.height = `${r.height}px`;
        flier.style.setProperty('--u', `${Math.min(r.width, r.height)}px`);
        return [r.width, r.height];
      },
      onImpact: (el) => impact(el, seat % 2),
      onDone: () => node.classList.remove('incoming'),
    });
  }

  /** Spit the ghost tile back into the hand while the whole table laughs. */
  function mockMove(ghost, key, x, y) {
    const slot = $('hand').querySelector(`[data-key="${key}"]`);
    const home = slot.getBoundingClientRect();
    slot.classList.add('dragging');
    ghost.style.setProperty('--x0', `${x}px`);
    ghost.style.setProperty('--y0', `${y}px`);
    ghost.style.setProperty('--x1', `${home.left}px`);
    ghost.style.setProperty('--y1', `${home.top}px`);
    ghost.addEventListener('animationend', () => {
      ghost.remove();
      slot.classList.remove('dragging');
      shake(slot);
    });
    ghost.classList.add('rejected');
    laughAtMe();
  }

  /** All 28 mixed face down, lined up a row per seat, and handed out round the table from me. */
  function deal() {
    const mine = [...$('hand').querySelectorAll('.hand-tile')].map((el) => el.dataset.key);
    const base = Math.max(me(), 0);
    const drops = roundTable({ first: base, each: 7, me: me(), mine });
    // The top seat's row on top, mine at the bottom.
    for (const d of drops) d.row = [3, 2, 0, 1][(d.seat - base + 4) % 4];
    ctx.deal.start({ mix: 'tiles', drops });
  }

  const clearHover = () => {
    for (const node of board.nodes.values()) node.classList.remove('drop-hover');
    $('board').classList.remove('drop-hover');
  };

  return {
    handPiece: '.hand-tile',
    ghostScale: 1.08,

    mount() {
      $('board').innerHTML = '<p class="board-empty" id="boardEmpty"></p>';
      board ??= new BoardView($('board'));
    },

    unmount() {
      board.preview(null);
      board.set([], 0);
    },

    renderBoard() {
      const r = ctx.state.round;
      board.set(r ? r.line : [], r ? r.center : 0);
      const last = r?.lastAction?.type === 'play' ? tileKey(r.lastAction.tile) : null;
      for (const [key, node] of board.nodes) {
        node.classList.toggle('last', key === last);
        if (key === last) node.dataset.team = r.lastAction.seat % 2;
      }

      let hint = '';
      if (r && !r.line.length && ctx.state.phase === 'playing') {
        if (r.turn === me()) hint = r.mustPlay ? t('openDoubleSix') : t('youOpen');
        else hint = t(r.mustPlay ? 'opensDoubleSix' : 'opens', { name: seatName(r.turn) });
      }
      $('boardEmpty').textContent = hint;
    },

    /** What just happened: sound, flights, the catchphrase. */
    feedback(prev) {
      const r = ctx.state.round;
      const la = r?.lastAction;
      const pla = prev?.round?.lastAction;
      if (prev && r && !la && prev.roundNo !== ctx.state.roundNo && ctx.state.phase === 'playing') deal();
      if (!la || JSON.stringify(la) === JSON.stringify(pla) || prev?.roundNo !== ctx.state.roundNo) return;
      if (la.type === 'pass') {
        toast(la.seat === me() ? t('youPass') : t('passes', { name: seatName(la.seat) }));
        sound.play('pass');
      } else if (la.type === 'play') {
        if (la.seat === me()) sound.play('place');
        else flyTile(la);
      }
      if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
    },

    canAct: (s) => !!s?.round && s.round.turn === s.you && s.phase === 'playing',
    turnAlert: (r) => r.legal.length > 0,

    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      const count = ctx.state.seats[seat].count;
      const passed = r?.lastAction?.type === 'pass' && r.lastAction.seat === seat;
      return {
        badge: '',
        info: `${pos === 0 ? '' : `<span class="count" title="${t('tilesLeft')}">${count}</span>`}${
          pos === 2 ? `<span class="backs">${'<i></i>'.repeat(count)}</span>` : ''
        }`,
        bubble: passed ? `<span class="bubble">${t('pass')}</span>` : '',
      };
    },

    // ---- the hand -----------------------------------------------------------

    handKeys: (hand) => sortHand(hand).map(tileKey),

    handPieceHTML(key, dragging) {
      const r = ctx.state.round;
      const myTurn = r.turn === me() && ctx.state.phase === 'playing';
      const tile = key.split('-').map(Number);
      const cls = ['tile v hand-tile', myTurn ? 'playable' : '', dragging ? 'dragging' : ''].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-label="${t('aria.tile', { a: tile[0], b: tile[1] })}">${tileHTML(tile[0], tile[1], false)}</button>`;
    },

    // Sized for a full hand all round, so the tiles don't grow as they're played.
    afterHand: () => $('hand').style.setProperty('--n', 7),

    dressGhost(ghost, rect) {
      ghost.className = 'tile v drag-ghost';
      ghost.style.setProperty('--u', `${rect.width}px`);
    },

    dragOver(key, x, y) {
      const target = dropTarget(key, x, y);
      clearHover();
      $('board').classList.toggle('drop-hover', !!target && !target.node);
      target?.node?.classList.add('drop-hover');
      board.preview(target ? key.split('-').map(Number) : null, target?.end);
    },

    dragClear() {
      clearHover();
      board.preview(null);
    },

    /** The pointer came up. Returns what to do once the drag is cleaned up. */
    drop({ key, ghost, btn, dx, dy, x, y, tapped, dropped, rearranged, keepGhost }) {
      const myTurn = ctx.state.round.turn === me();
      const target = dropped ? dropTarget(key, x, y) : null;
      const illegal = dropped && myTurn && !target && within('board', x, y);
      if (illegal) keepGhost(); // the mock animation takes over the ghost
      return () => {
        if (target) {
          const [a, b] = key.split('-').map(Number);
          send({ t: 'play', tile: [a, b], end: target.end });
          buzz(15);
        } else if (illegal) mockMove(ghost, key, x - dx, y - dy);
        else if (tapped && myTurn) toast(t('dragHint'), 1400);
        else if (tapped || (ghost && !rearranged)) {
          shake(btn);
          if (!myTurn) toast(t('waitFor', { name: seatName(ctx.state.round.turn) }), 1200);
        }
      };
    },

    /** A status line for when "your turn" / "their turn" isn't the whole story. */
    status: (r) => (r.turn === me() && !r.legal.length ? { cls: 'mine', text: t('autoPass') } : null),

    // ---- results ------------------------------------------------------------

    resultDelay() {
      const la = ctx.state.round.lastAction;
      return la?.type === 'play' && la.seat !== me() ? FLIGHT_MS + 800 : 1100;
    },

    result(isMatch) {
      const o = ctx.state.round.over;
      const how =
        o.reason === 'domino'
          ? o.winnerSeat === me()
            ? t('youGoOut')
            : t('goesOut', { name: seatName(o.winnerSeat) })
          : t('blockedPips', { a: teamLabel(0), pa: o.teamPips[0], b: teamLabel(1), pb: o.teamPips[1] });
      const gained = [0, 1].map((team) => (!isMatch && o.winnerTeam === team ? o.points : 0));
      return {
        winTeam: o.winnerTeam,
        gained,
        emoji: '🁢',
        sub: how,
        lastRound: how,
        tie: o.winnerTeam == null ? { title: t('tieTitle'), sub: t('tieSub', { n: o.teamPips[0] }) } : null,
        details: '',
      };
    },

    resultHand(hand) {
      return `<span class="rh-tiles">${
        hand.length
          ? hand.map((tile) => `<span class="tile h mini">${tileHTML(tile[0], tile[1], true)}</span>`).join('')
          : `<span class="muted">${t('outCheck')}</span>`
      }</span>`;
    },

    historyRow(h) {
      const cell = (team) => (h.winnerTeam === team ? `+${h.points}` : '·');
      const how =
        h.reason === 'domino'
          ? esc(t('histOut', { name: seatName(h.winnerSeat) }))
          : h.winnerTeam == null
            ? t('histTie')
            : t('histBlocked');
      return { cell, how };
    },
  };
}
