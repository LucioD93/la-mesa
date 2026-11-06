// The caída table: the loose cards, the dealer's count, cantos, and how a round reads.
import { cardSVG, cardKey, parseKey } from './cards.js';
import { canFly, FLIGHT_MS, isFlying, launch, whenLanded } from './flight.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const SWEEP_DELAY_MS = 450; // how long a capture stays on the table before it leaves
const SWEEP_MS = 450;

const CANTOS = ['ronda', 'patrulla', 'tolete'];
const gainedBy = (awards, team) => awards.reduce((sum, a) => sum + (a.team === team ? a.points : 0), 0);

/** The same award repeated reads as one line: three caídas, not three rows. */
function grouped(awards) {
  const rows = new Map();
  for (const a of awards) {
    const key = `${a.kind}:${a.team}`;
    const row = rows.get(key) ?? { ...a, points: 0, times: 0 };
    row.points += a.points;
    row.times += 1;
    rows.set(key, row);
  }
  return [...rows.values()];
}

export function createView(ctx) {
  const { $, esc, me, posOf, seatName, seatEl, seatAvatar, toast, buzz, shake, send, laughAtMe, within, teamLabel } = ctx;
  let tableSig = '';
  let sweep = null; // a capture still on the table: { before, taken, played, seat }
  let sweepTimer;

  const cardHTML = (card, cls = '') => `<span class="card ${cls}">${cardSVG(card)}</span>`;

  function awardLabel(a) {
    const times = a.times > 1 ? ` ×${a.times}` : '';
    if (a.kind === 'cards') return t('award.cards', { a: a.cards[0], b: a.cards[1] });
    return `${t(`award.${a.kind}`)}${times}`;
  }

  function renderActions() {
    const r = ctx.state.round;
    const el = $('actions');
    const o = r?.options;
    if (!o || ctx.state.phase !== 'playing') return void (el.innerHTML = '');
    const buttons = [];
    if (o.order) {
      buttons.push(`<button class="call count" data-order="1">1 → 4</button>`, `<button class="call count" data-order="-1">4 → 1</button>`);
    }
    if (o.canto) buttons.push(`<button class="call flor" data-canto="1">${t(`canto.${o.canto}`)}</button>`);
    el.innerHTML = buttons.join('');
  }

  // ---- table talk -------------------------------------------------------------

  /** A big shout over a seat. */
  function shout(seat, text, cls) {
    const rect = seatEl(seat).getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `shout ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(rect.left + rect.width / 2, 90), innerWidth - 90)}px`;
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.addEventListener('animationend', () => el.remove());
    document.body.append(el);
  }

  function showCaida({ seat, caida, mesa }) {
    const text = caida && mesa ? t('caidaMesa') : caida ? t('caida') : t('mesaLimpia');
    shout(seat, `${text} +${caida + mesa}`, 'caida');
    sound.play('truco');
    buzz([40, 30, 60]);
  }

  // ---- playing a card ---------------------------------------------------------

  /** You played your first card holding an unsung canto: it's gone, and the table laughs. */
  function forgotCanto() {
    $('toast').classList.remove('show');
    laughAtMe();
  }

  function playCard(key) {
    if (ctx.state.round.options.canto) forgotCanto();
    send({ t: 'play', card: parseKey(key) });
    buzz(15);
  }

  function waitToast(r) {
    if (r.options.order) toast(t('pickOrder'), 1400);
    else toast(t('waitFor', { name: seatName(r.turn) }), 1200);
  }

  function canDrag(btn) {
    const r = ctx.state?.round;
    if (!r || ctx.state.phase !== 'playing') return false;
    if (r.options.play) return true;
    shake(btn);
    waitToast(r);
    return false;
  }

  // ---- the loose cards --------------------------------------------------------

  function impact(slot, team) {
    sound.play('place');
    const board = $('board');
    const at = slot.getBoundingClientRect();
    const home = board.getBoundingClientRect();
    const ring = document.createElement('span');
    ring.className = 'impact';
    ring.dataset.team = team;
    ring.style.left = `${at.left + at.width / 2 - home.left}px`;
    ring.style.top = `${at.top + at.height / 2 - home.top}px`;
    ring.addEventListener('animationend', () => ring.remove());
    board.append(ring);
    board.classList.remove('thud');
    void board.offsetWidth; // restart the animation if one is still showing
    board.classList.add('thud');
  }

  /** What's drawn: the table, or the table as it was while a capture is still on it. */
  function tableItems(r) {
    const keyOf = cardKey;
    if (sweep) {
      const taken = new Set(sweep.taken.map(keyOf));
      return [
        ...sweep.before.map((card) => ({ card, taken: taken.has(keyOf(card)) })),
        { card: sweep.played, taken: true, seat: sweep.seat },
      ];
    }
    const slots = r.plays ? null : r.opening?.slots; // the count shows until the first card
    return r.table.map((card, i) => ({ card, spot: slots?.[i].spot, hit: slots?.[i].hit }));
  }

  function paintTable(r, la, isNew) {
    const items = tableItems(r);
    const sig = JSON.stringify([ctx.state.roundNo, items, r.deal, i18n.lang]);
    if (sig === tableSig) return;
    tableSig = sig;
    if (!r.deal) {
      // The count hasn't been called: four empty places.
      $('loose').innerHTML = [1, 2, 3, 4].map(() => '<span class="loose-item"><span class="card place"></span></span>').join('');
      return;
    }
    $('loose').innerHTML = items
      .map(({ card, taken, spot, hit }) => {
        const key = cardKey(card);
        const justPlayed = la && cardKey(la.card) === key;
        const flying = justPlayed && (isFlying(la.seat) || (isNew && la.seat !== me() && canFly()));
        const motion = flying ? 'incoming' : justPlayed && isNew ? 'fresh' : '';
        const label = spot ? `<small class="${hit ? 'hit' : ''}">${spot}${hit ? ' ✓' : ''}</small>` : '';
        const team = la ? la.seat % 2 : 0;
        return `<span class="loose-item ${motion} ${taken ? 'taken' : ''}" data-key="${key}" data-team="${team}">${cardHTML(card, hit ? 'hit' : '')}${label}</span>`;
      })
      .join('');
  }

  function endSweep() {
    clearTimeout(sweepTimer);
    sweep = null;
  }

  /** The captured cards leave for the seat that took them. */
  function startSweep(seat) {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      if (!sweep) return;
      const to = seatAvatar(seat)?.getBoundingClientRect();
      for (const el of $('loose').querySelectorAll('.loose-item.taken')) {
        if (!to) break;
        const from = el.getBoundingClientRect();
        const dx = to.left + to.width / 2 - from.left - from.width / 2;
        const dy = to.top + to.height / 2 - from.top - from.height / 2;
        el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.2 }], {
          duration: SWEEP_MS,
          easing: 'ease-in',
          fill: 'forwards',
        });
      }
      sweepTimer = setTimeout(() => {
        endSweep();
        if (ctx.state.round) paintTable(ctx.state.round, ctx.state.round.lastAction, false);
      }, SWEEP_MS);
    }, SWEEP_DELAY_MS);
  }

  /** Fly a card from the seat that played it to its place on the table. */
  function flyCard(la, onDone) {
    const { seat, card } = la;
    const slotOf = () => $('loose')?.querySelector(`[data-key="${cardKey(card)}"]`);
    const slot = slotOf();
    const face = slot?.querySelector('.card');
    const avatar = seatAvatar(seat);
    if (!face || !avatar || !canFly()) {
      slot?.classList.remove('incoming');
      sound.play('place');
      return onDone();
    }
    const width = face.offsetWidth;
    const height = face.offsetHeight;
    const flier = face.cloneNode(true);
    flier.classList.add('flier');
    flier.dataset.team = seat % 2;
    flier.style.width = `${width}px`;
    flier.style.height = `${height}px`;
    flier.insertAdjacentHTML('beforeend', '<span class="flier-back"></span>');
    launch({
      seat,
      avatar,
      flier,
      target: slotOf, // gone if the table moved on mid-flight
      fit: () => [width, height],
      onImpact: (el) => impact(el, seat % 2),
      onDone: () => {
        slotOf()?.classList.remove('incoming');
        onDone();
      },
    });
  }

  $('actions').addEventListener('click', (e) => {
    const el = e.target.closest('[data-order],[data-canto]');
    if (!el) return;
    if (el.dataset.order) send({ t: 'order', dir: Number(el.dataset.order) });
    else send({ t: 'call', what: 'canto' });
  });

  return {
    handPiece: '.hand-card',
    ghostScale: 1.06,

    mount() {
      $('board').innerHTML = `
        <div class="deal-info" id="dealInfo"></div>
        <div class="loose" id="loose"></div>`;
      tableSig = '';
      endSweep();
    },

    unmount() {
      endSweep();
      $('actions').innerHTML = '';
    },

    /** Points land as they happen, before the match adds them at the end of the round. */
    liveScores() {
      const { phase, round: r, scores } = ctx.state;
      return phase === 'playing' && r ? scores.map((s, team) => s + r.points[team]) : scores;
    },

    renderBoard(prev) {
      renderActions();
      const r = ctx.state.round;
      if (!r) {
        endSweep();
        $('dealInfo').innerHTML = $('loose').innerHTML = '';
        tableSig = '';
        return;
      }
      const sameRound = prev?.roundNo === ctx.state.roundNo;
      if (!sameRound) endSweep();
      const pips = [1, 2, 3].map((n) => `<i class="pip ${n <= r.deal ? 'tie' : ''}"></i>`).join('');
      const team = me() === -1 ? 0 : me() % 2;
      $('dealInfo').innerHTML = `
        <span class="deal-pips"><span class="pips">${pips}</span><small>${t('dealOf', { n: Math.max(r.deal, 1) })}</small></span>
        <span class="piles"><small>${t('cardsTaken')}</small> <b data-team="${team}">${r.piles[team]}</b> · <b data-team="${1 - team}">${r.piles[1 - team]}</b></span>`;

      const la = r.lastAction;
      const isNew = !!la && sameRound && la.n !== prev?.round?.lastAction?.n;
      if (isNew) {
        endSweep();
        if (la.taken.length && canFly()) sweep = { before: prev.round.table, taken: la.taken, played: la.card, seat: la.seat };
      }
      paintTable(r, la, isNew);
    },

    /** What just happened: sound, flights, shouts, the catchphrase. */
    feedback(prev) {
      const r = ctx.state.round;
      const sameRound = prev?.roundNo === ctx.state.roundNo;
      const la = r?.lastAction;
      if (la && sameRound && la.n !== prev?.round?.lastAction?.n) {
        const landed = () => {
          if (sweep) startSweep(la.seat);
          if (la.caida || la.mesa) showCaida(la);
        };
        if (la.seat === me()) {
          sound.play('place');
          landed();
        } else flyCard(la, landed);
        if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
      }
      if (r?.lastCall && r.lastCall.n !== prev?.round?.lastCall?.n && prev) {
        shout(r.lastCall.seat, t(`canto.${r.lastCall.what}`), 'flor');
        sound.play('flor');
        if (r.lastCall.phrase) sound.playClip('manguangua');
      }
      if (!r || !sameRound) return;
      // The table's points, or the cantos paying out.
      const fresh = r.awards.slice(prev.round?.awards?.length ?? 0);
      const table = fresh.filter((a) => ['table', 'clean', 'repeats'].includes(a.kind) || CANTOS.includes(a.kind));
      if (table.length) {
        whenLanded(() => toast(table.map((a) => `${teamLabel(a.team)} +${a.points}: ${awardLabel(a)}`).join(' · '), 3000));
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && (s.round.options.play || s.round.options.order),

    turnAlert(r) {
      whenLanded(() => r.options.canto && toast(t('singCanto', { canto: t(`canto.${r.options.canto}`) }), 2600));
      return true;
    },

    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      const sung = r?.sung.find((s) => s.seat === seat);
      return {
        badge: r?.dealer === seat ? `<b class="mano-tag" title="${t('dealer')}">${t('dealerTag')}</b>` : '',
        info: `${pos === 0 ? '' : `<span class="backs">${'<i></i>'.repeat(ctx.state.seats[seat].count)}</span>`}${
          sung ? `<span class="sung">${t(`canto.${sung.kind}`)}</span>` : ''
        }`,
        bubble: '',
      };
    },

    // ---- the hand -----------------------------------------------------------

    handKeys: (hand) => hand.map(cardKey),

    handPieceHTML(key, dragging) {
      const r = ctx.state.round;
      const canPlay = r.options.play && ctx.state.phase === 'playing';
      const card = parseKey(key);
      const cls = ['card hand-card', canPlay ? 'playable' : '', dragging ? 'dragging' : ''].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-label="${t('aria.card', { n: card[0], suit: card[1] })}">${cardSVG(card)}</button>`;
    },

    // Keyboard users press the card instead of dragging it (pointer clicks have a detail).
    handClick(e) {
      const btn = e.target.closest('.hand-card');
      if (btn && e.detail === 0 && canDrag(btn)) playCard(btn.dataset.key);
    },

    dressGhost(ghost) {
      ghost.classList.remove('hand-card', 'playable', 'dragging');
      ghost.classList.add('drag-ghost');
    },

    dragOver(key, x, y) {
      $('board').classList.toggle('drop-hover', !!ctx.state.round.options.play && within('board', x, y));
    },

    dragClear() {
      $('board').classList.remove('drop-hover');
    },

    /** The pointer came up. Returns what to do once the drag is cleaned up. */
    drop({ key, ghost, btn, x, y, tapped, dropped, rearranged }) {
      const r = ctx.state.round;
      const onBoard = dropped && within('board', x, y);
      return () => {
        if (onBoard && r.options.play) playCard(key);
        else if (tapped && r.options.play) toast(t('dragHint'), 1400);
        else if (tapped || (ghost && !rearranged)) {
          shake(btn);
          if (!r.options.play) waitToast(r);
        }
      };
    },

    /** A status line for when "your turn" / "their turn" isn't the whole story. */
    status(r) {
      if (r.deal) return null;
      return r.options.order ? { cls: 'mine', text: t('pickOrder') } : { cls: '', text: t('dealing', { name: seatName(r.turn) }) };
    },

    // ---- results ------------------------------------------------------------

    resultDelay(prev) {
      const la = ctx.state.round.lastAction;
      const thrown = la && la.seat !== me() && la.n !== prev.round?.lastAction?.n;
      return (thrown ? FLIGHT_MS : 0) + SWEEP_DELAY_MS + SWEEP_MS + 800;
    },

    result() {
      const r = ctx.state.round;
      const gained = [gainedBy(r.awards, 0), gainedBy(r.awards, 1)];
      const tied = gained[0] === gained[1];
      return {
        winTeam: gained[0] > gained[1] ? 0 : 1,
        gained,
        emoji: '🃏',
        sub: '',
        lastRound: null,
        tie: tied ? { title: t('tieTitle'), sub: t('tieSub', { n: gained[0] }) } : null,
        details: grouped(r.awards)
          .map((a) => `<div class="ra" data-team="${a.team}"><span>${esc(awardLabel(a))}</span><b>${teamLabel(a.team)} +${a.points}</b></div>`)
          .join(''),
      };
    },

    historyRow(h) {
      const cell = (team) => {
        const n = gainedBy(h.awards, team);
        return n ? `+${n}` : '·';
      };
      return { cell, how: grouped(h.awards).map((a) => esc(awardLabel(a))).join(' · ') };
    },
  };
}
