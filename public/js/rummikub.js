// The Rummikub table: the pool, the sets everyone shares, and your rack. On your turn you
// build the next table here and send it when every set is good. Tap tiles, yours or the
// table's, to pick them, then tap a set's + or the new set to move them there; or drag a
// tile from your rack onto a set. Nothing reaches the others until you press Done.
import { arrange, byColor, byNumber, colorAttr, colorOf, FIRST_PLAY, isJoker, numberOf, setPoints, tidy, tileFace, tileHTML } from './rummikub-tiles.js';
import { canFly, whenLanded } from './flight.js';
import { roundTable } from './deal.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const DRAW_MS = 500;
const RACK_ROW = 12; // tiles per row of the rack, at most

export function createView(ctx) {
  const { $, esc, me, seatName, seatEl, seatAvatar, toast, buzz, shake, send, laughAtMe, within, teamLabel } = ctx;
  let draft = null; // { seq, sets }: the table this player is building on their turn
  let selected = new Set(); // tile ids picked to move, from the rack or the table
  let sortBy = 'color';
  let freshRound = true; // a new deal shows in the server's order; after that the player's own
  let boardSig = '';

  const r = () => ctx.state.round;
  const myTurn = () => ctx.state?.phase === 'playing' && !!r()?.options.play;
  const melded = () => me() !== -1 && !!r().melded[me()];
  const wasOnTable = () => new Set(r().table.flat());
  const onDraft = () => new Set(draft ? draft.sets.flat() : []);
  /** The rack tiles this turn has put on the table. */
  const placed = () => (draft ? draft.sets.flat().filter((id) => !wasOnTable().has(id)) : []);
  const changed = () => !!draft && JSON.stringify(draft.sets) !== JSON.stringify(r().table);
  const sets = () => draft?.sets ?? r()?.table ?? [];
  const badSets = () => sets().filter((s) => !arrange(s)).length;
  /** What the new sets add up to, for a first play: only sets made entirely of rack tiles count. */
  const firstPoints = () => {
    const old = wasOnTable();
    return sets()
      .filter((s) => s.every((id) => !old.has(id)) && arrange(s))
      .reduce((sum, s) => sum + setPoints(s), 0);
  };

  // ---- building the next table ------------------------------------------------

  /** Begin (or keep) this turn's draft from the table as it stands. */
  function syncDraft() {
    const round = r();
    if (!myTurn()) {
      draft = null;
      return;
    }
    if (draft?.seq !== round.seq) draft = { seq: round.seq, sets: round.table.map((s) => s.slice()) };
  }

  /** Can this tile be picked up? A first play leaves the table alone. */
  function movable(id) {
    if (!wasOnTable().has(id) || melded()) return true;
    toast(t('firstHands'), 1800);
    return false;
  }

  /** Move tiles into set `to` (an index) or a new set ('new'). */
  function moveTo(ids, to) {
    if (!myTurn() || !ids.length) return;
    if (!ids.every(movable)) return;
    const target = to === 'new' ? null : draft.sets[to];
    if (target && !melded() && target.some((id) => wasOnTable().has(id))) return toast(t('firstHands'), 1800);
    const moving = new Set(ids);
    const touched = new Set();
    draft.sets = draft.sets.map((s, i) => {
      if (!s.some((id) => moving.has(id))) return s;
      touched.add(i);
      return s.filter((id) => !moving.has(id));
    });
    if (target) draft.sets[to] = [...draft.sets[to], ...ids];
    else draft.sets.push(ids.slice());
    touched.add(target ? to : draft.sets.length - 1);
    draft.sets = draft.sets.map((s, i) => (touched.has(i) ? tidy(s) : s)).filter((s) => s.length);
    selected.clear();
    sound.play('place');
    buzz(10);
    ctx.redraw();
    renderActions();
  }

  /** Send picked tiles that came from the rack back to it. */
  function toRack() {
    const mine = new Set(placed());
    const back = new Set([...selected].filter((id) => mine.has(id)));
    if (!back.size) return;
    draft.sets = draft.sets.map((s) => (s.some((id) => back.has(id)) ? tidy(s.filter((id) => !back.has(id))) : s)).filter((s) => s.length);
    selected.clear();
    buzz(10);
    ctx.redraw();
    renderActions();
  }

  function undo() {
    draft = { seq: r().seq, sets: r().table.map((s) => s.slice()) };
    selected.clear();
    buzz(10);
    ctx.redraw();
    renderActions();
  }

  function done() {
    if (!placed().length) return toast(t('placeOne'), 1600);
    if (badSets()) {
      toast(t('badSets', { n: badSets() }), 2000);
      return laughAtMe();
    }
    if (!melded() && firstPoints() < FIRST_PLAY) {
      toast(t('firstShort', { n: firstPoints() }), 2200);
      return laughAtMe();
    }
    send({ t: 'play', table: draft.sets });
    selected.clear();
    buzz(15);
  }

  function draw() {
    const round = r();
    if (!myTurn()) return waitToast();
    if (changed()) return toast(t('undoFirst'), 1800);
    send({ t: 'draw' });
    selected.clear();
    buzz(15);
    if (!round.pool) sound.play('pass');
  }

  function waitToast() {
    const round = r();
    if (round.turn != null) toast(t('waitFor', { name: seatName(round.turn) }), 1200);
  }

  function toggle(id) {
    if (!myTurn()) return waitToast();
    if (!selected.has(id) && !movable(id)) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    buzz(8);
    ctx.redraw();
    renderActions();
  }

  function sortRack() {
    sortBy = sortBy === 'color' ? 'number' : 'color';
    const cmp = sortBy === 'color' ? byColor : byNumber;
    ctx.sortHand((a, b) => cmp(Number(a), Number(b)));
    renderActions();
  }

  // ---- what you can do ------------------------------------------------------

  function renderActions() {
    const round = r();
    const el = $('actions');
    if (!round || ctx.state.phase !== 'playing' || !round.hand) return void (el.innerHTML = '');
    const buttons = [];
    if (myTurn()) {
      if (changed()) {
        const ready = placed().length && !badSets() && (melded() || firstPoints() >= FIRST_PLAY);
        buttons.push(`<button class="call done ${ready ? '' : 'off'}" data-do="done">${t('done')}</button>`);
        buttons.push(`<button class="call" data-do="undo">${t('undo')}</button>`);
        const mine = new Set(placed());
        if ([...selected].some((id) => mine.has(id))) buttons.push(`<button class="call" data-do="rack">${t('toRack')}</button>`);
      } else {
        buttons.push(`<button class="call draw" data-do="draw">${t(round.pool ? 'drawTile' : 'pass')}</button>`);
      }
    }
    if (round.hand.length > 1) buttons.push(`<button class="call sort" data-do="sort">${t(sortBy === 'color' ? 'sortNumber' : 'sortColor')}</button>`);
    el.innerHTML = buttons.join('');
  }

  $('actions').addEventListener('click', (e) => {
    const what = e.target.closest('[data-do]')?.dataset.do;
    if (what === 'sort') return sortRack();
    if (!myTurn()) return;
    if (what === 'done') done();
    else if (what === 'undo') undo();
    else if (what === 'rack') toRack();
    else if (what === 'draw') draw();
  });

  // ---- the table ----------------------------------------------------------------

  function paintBoard(fresh) {
    const round = r();
    const mine = myTurn();
    const old = wasOnTable();
    const placedNow = new Set(placed());
    const last = round.lastAction?.type === 'play' ? round.lastAction : null;
    const sig = JSON.stringify([ctx.state.roundNo, round.seq, sets(), [...selected], mine, round.pool, round.melded, me(), fresh, i18n.lang]);
    if (sig === boardSig) return;
    boardSig = sig;
    const lastTeam = last ? last.seat % 2 : 0;
    const picking = mine && selected.size > 0;
    const first = mine && !melded();

    const body = sets()
      .map((s, i) => {
        const ok = !!arrange(s);
        const locked = first && s.some((id) => old.has(id));
        const tiles = s
          .map((id) => {
            const cls = [
              selected.has(id) ? 'selected' : '',
              placedNow.has(id) ? 'mine' : '',
              last?.placed.includes(id) && !placedNow.has(id) ? 'last' : '',
              fresh?.includes(id) ? 'fresh' : '',
            ].join(' ');
            return tileHTML(id, cls);
          })
          .join('');
        const add = picking && !locked ? `<button class="rk-add" data-add="${i}" aria-label="${t('addHere')}">+</button>` : '';
        return `<div class="rk-set ${ok ? '' : 'bad'} ${locked ? 'locked' : ''}" data-set="${i}" data-team="${lastTeam}">${tiles}${add}</div>`;
      })
      .join('');
    const slot = mine ? `<button class="rk-set rk-new ${picking ? 'ready' : ''}" data-add="new">${t('newSet')}</button>` : '';
    const empty = !sets().length && !mine ? `<p class="board-empty">${t('noSets')}</p>` : '';
    const firstNote = first ? `<span class="rk-first ${firstPoints() >= FIRST_PLAY ? 'ok' : ''}">${t('firstCount', { n: firstPoints() })}</span>` : '';
    $('rkTop').innerHTML = `
      <button class="rk-pool ${mine && !changed() && round.pool ? 'ready' : ''}" data-draw aria-label="${t('pool')}">
        <span class="rk-tile back"></span><small>${round.pool}</small>
      </button>${firstNote}`;
    $('rkSets').innerHTML = body + slot + empty;
  }

  /** Fly a tile from the pool to the seat that drew it. */
  function toSeat(seat) {
    const from = $('rkTop').querySelector('.rk-pool .rk-tile');
    const avatar = seatAvatar(seat);
    if (!from || !avatar || !canFly()) return;
    const a = from.getBoundingClientRect();
    const b = avatar.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'rk-tile back flier-draw';
    el.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    document.body.append(el);
    const dx = b.left + b.width / 2 - a.left - a.width / 2;
    const dy = b.top + b.height / 2 - a.top - a.height / 2;
    el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0.4 }], {
      duration: DRAW_MS,
      easing: 'ease-in',
    }).onfinish = () => el.remove();
  }

  function shout(seat, text) {
    const rect = seatEl(seat).getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'shout caida';
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(rect.left + rect.width / 2, 90), innerWidth - 90)}px`;
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.addEventListener('animationend', () => el.remove());
    document.body.append(el);
  }

  /** Where a dragged rack tile would go: a set (its index), a new set, or nowhere. */
  function dropTarget(x, y) {
    for (const el of $('rkSets').querySelectorAll('.rk-set')) {
      const b = el.getBoundingClientRect();
      if (x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 6 && y <= b.bottom + 6) {
        return el.classList.contains('rk-new') ? 'new' : Number(el.dataset.set);
      }
    }
    return within('board', x, y) && !within('hand', x, y) ? 'new' : null;
  }

  /** The rack slot under the pointer, for rearranging a rack that wraps onto more rows. */
  function slotAt(pieces, x, y) {
    let best = 0;
    let dist = Infinity;
    pieces.forEach((el, i) => {
      const b = el.getBoundingClientRect();
      const d = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
      if (d < dist) [best, dist] = [i, d];
    });
    return best;
  }

  /** All 106 mixed face down, a row of 14 per seat, then handed out round the table. */
  function deal() {
    const round = r();
    const mine = [...$('hand').querySelectorAll('.hand-rk')].map((el) => el.dataset.key);
    const base = Math.max(me(), 0);
    const drops = roundTable({ first: round.starter, each: 14, me: me(), mine });
    for (const d of drops) d.row = [3, 2, 0, 1][(d.seat - base + 4) % 4];
    ctx.deal.start({ mix: 'tiles', drops, piece: { cls: 'rk-tile back', ratio: 1.34, perRow: 14 } });
  }

  return {
    handPiece: '.hand-rk',
    ghostScale: 1.08,
    slotAt,

    mount() {
      $('board').innerHTML = `
        <div class="rk-top" id="rkTop"></div>
        <div class="rk-sets" id="rkSets"></div>`;
      $('board').onclick = (e) => {
        if (ctx.state?.phase !== 'playing') return;
        if (e.target.closest('[data-draw]')) return draw();
        const add = e.target.closest('[data-add]');
        if (add) return moveTo([...selected], add.dataset.add === 'new' ? 'new' : Number(add.dataset.add));
        const tile = e.target.closest('.rk-set .rk-tile');
        if (tile) return toggle(Number(tile.dataset.id));
      };
      boardSig = '';
      selected = new Set();
      draft = null;
    },

    unmount() {
      $('board').onclick = null;
      $('actions').innerHTML = '';
      draft = null;
    },

    renderBoard(prev) {
      const round = r();
      if (!round) {
        $('rkTop').innerHTML = $('rkSets').innerHTML = '';
        boardSig = '';
        draft = null;
        return;
      }
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      if (!sameRound) freshRound = true;
      if (!sameRound || prev.round.seq !== round.seq) selected.clear();
      syncDraft();
      // Forget picks that are no longer anywhere this player can reach.
      const reach = new Set([...(round.hand ?? []), ...sets().flat()]);
      for (const id of selected) if (!reach.has(id)) selected.delete(id);
      const la = round.lastAction;
      const isNew = !!la && sameRound && la.n !== prev.round.lastAction?.n;
      const fresh = isNew && la.type === 'play' && la.seat !== me() ? la.placed : null;
      renderActions();
      paintBoard(fresh);
    },

    feedback(prev) {
      const round = r();
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      const la = round?.lastAction;
      if (prev && round && !la && !sameRound && ctx.state.phase === 'playing') deal();
      if (!la || !sameRound || la.n === prev.round.lastAction?.n) return;
      if (la.type === 'draw') {
        if (la.seat !== me()) toSeat(la.seat);
        sound.play('place');
      } else if (la.type === 'pass') {
        if (la.seat !== me()) toast(t('passes', { name: seatName(la.seat) }), 1400);
        sound.play('pass');
      } else {
        sound.play(la.first ? 'call' : 'place');
        if (la.phrase) sound.playClip('manguangua');
      }
      if (round.over?.reason === 'out') {
        whenLanded(() => {
          shout(round.over.seat, t('rummikubOut'));
          sound.play('flor');
          buzz([40, 30, 60]);
        });
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && s.round.options.play,
    turnAlert: () => true,
    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const round = r();
      const n = ctx.state.seats[seat].count;
      const opened = round?.melded[seat] ? `<b class="mano-tag" title="${t('opened')}">✓</b>` : '';
      return {
        badge: opened,
        info: pos === 0 || !round ? '' : `<span class="count" title="${t('tilesLeft')}"><i class="mini-tile"></i>${n}</span>`,
        bubble: '',
      };
    },

    // ---- the rack -----------------------------------------------------------

    // What the draft has taken from the rack isn't in it until it comes back.
    handKeys: (hand) => {
      const out = onDraft();
      return hand.filter((id) => !out.has(id)).map(String);
    },
    keepsOrder: () => !freshRound,

    handPieceHTML(key, dragging) {
      const round = r();
      const id = Number(key);
      const cls = ['rk-tile hand-rk', selected.has(id) ? 'selected' : '', id === round.newTile ? 'new' : '', dragging ? 'dragging' : ''].join(' ');
      return `<button class="${cls}" data-key="${key}" data-c="${colorAttr(id)}" aria-pressed="${selected.has(id)}" aria-label="${tileName(id)}">${tileFace(id)}</button>`;
    },

    afterHand(hand) {
      freshRound = false;
      const n = Math.max(hand.length - placed().length, 1);
      $('hand').style.setProperty('--per', Math.max(Math.ceil(n / Math.ceil(n / RACK_ROW)), 7));
    },

    // Keyboard users press the tile to pick it (pointer clicks have a detail).
    handClick(e) {
      const btn = e.target.closest('.hand-rk');
      if (btn && e.detail === 0) toggle(Number(btn.dataset.key));
    },

    dressGhost(ghost, rect) {
      ghost.classList.remove('hand-rk', 'selected', 'dragging');
      ghost.classList.add('drag-ghost');
      ghost.style.setProperty('--rw', `${rect.width}px`); // it leaves the rack, which sized it
    },

    dragOver(key, x, y) {
      const target = myTurn() && !within('hand', x, y) ? dropTarget(x, y) : null;
      const id = Number(key);
      for (const el of $('rkSets').querySelectorAll('.rk-set')) {
        const at = el.classList.contains('rk-new') ? 'new' : Number(el.dataset.set);
        const over = target === at;
        el.classList.toggle('drop-hover', over);
        el.classList.toggle('fits', over && at !== 'new' && !!arrange([...draft.sets[at], id]));
      }
    },

    dragClear() {
      for (const el of document.querySelectorAll('#board :is(.drop-hover, .fits)')) el.classList.remove('drop-hover', 'fits');
    },

    /** The pointer came up. Returns what to do once the drag is cleaned up. */
    drop({ key, ghost, btn, x, y, tapped, dropped, rearranged }) {
      const target = dropped && !rearranged ? dropTarget(x, y) : null;
      const id = Number(key);
      return () => {
        if (tapped) return toggle(id);
        if (target == null) return;
        if (!myTurn()) {
          shake(btn);
          return waitToast();
        }
        // The dragged tile goes, with any others picked alongside it.
        moveTo([id, ...[...selected].filter((s) => s !== id)], target);
      };
    },

    status(round) {
      if (!round.options.play) return null;
      if (!melded()) return { cls: 'mine', text: changed() ? t('firstCount', { n: firstPoints() }) : t('firstPrompt') };
      return { cls: 'mine', text: changed() ? t('placedCount', { n: placed().length }) : t('playPrompt') };
    },

    // ---- results ------------------------------------------------------------

    resultDelay: () => 1400,

    result() {
      const round = r();
      const s = round.score;
      const out = round.over.reason === 'out';
      const how = out ? t('wentOut', { name: seatName(round.over.seat) }) : t('blocked');
      return {
        winTeam: s.winner ?? 0,
        gained: s.points,
        emoji: '🀄',
        sub: how,
        lastRound: how,
        tie: s.winner == null ? { title: t('tieTitle'), sub: t('tieSub', { n: s.held[0] }) } : null,
        details: [0, 1]
          .map((team) => `<div class="ra" data-team="${team}"><span>${esc(teamLabel(team))}: ${t('leftOnRacks')}</span><b>${s.held[team]}</b></div>`)
          .join(''),
      };
    },

    resultHand: (hand) =>
      hand.length ? `<span class="rh-tiles">${hand.slice().sort(byColor).map((id) => tileHTML(id, 'mini')).join('')}</span>` : `<span class="muted">${t('outCheck')}</span>`,

    historyRow(h) {
      return {
        cell: (team) => (h.points[team] ? `+${h.points[team]}` : '0'),
        how: h.out != null ? esc(t('histOut', { name: seatName(h.out) })) : t('histBlocked'),
      };
    },
  };
}

const COLOR_KEYS = ['black', 'blue', 'orange', 'red'];
const tileName = (id) => (isJoker(id) ? t('joker') : t('aria.tile', { n: numberOf(id), color: t(`color.${COLOR_KEYS[colorOf(id)]}`) }));
