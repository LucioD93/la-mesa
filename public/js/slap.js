// The slap table (Irish Snap, manotazo): the stack in the middle, the number called, your
// face-down pile, the hands landing on a match, and how a round reads. Nobody sees a
// face-down card, so there is no hand: you flip your pile blind and slap the stack.
import { cardSVG } from './cards.js';
import { canFly, whenLanded } from './flight.js';
import { roundTable } from './deal.js';
import * as sound from './sound.js';
import { t } from './i18n.js';

// A flip from the seat to the stack. The server lets the bots react once it has landed
// (FLIP_MS in server/games/slap.js, which allows for the trip to the phone as well).
const FLIP_ANIM_MS = 380;
const GLIDE_MS = 420; // the stack sliding to whoever takes it

export function createView(ctx) {
  const { $, esc, me, posOf, seatName, seatEl, seatAvatar, toast, buzz, send, laughAtMe } = ctx;
  let active = false;
  let stackSig = '';
  let barFor = null; // the window the countdown bar is showing
  let slappedFor = null; // the flip this page already slapped, so a second tap sends nothing
  let flippedAt = null; // the moment this page already flipped in

  const r = () => (ctx.state?.phase === 'playing' ? ctx.state.round : null);
  const cardHTML = (card, cls = '') => `<span class="card ${cls}">${cardSVG(card)}</span>`;
  /** 10, 11 and 12 are called by their figure: sota, caballo, rey. */
  const callName = (n) => (n > 7 ? t(`figure.${n}`) : '');

  // ---- table talk ---------------------------------------------------------------

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

  // ---- your moves ---------------------------------------------------------------

  function doFlip() {
    const round = r();
    if (!round) return;
    if (!round.options.flip) {
      if (round.window) toast(t('slapFirst'), 1000);
      else if (round.turn !== null && round.turn !== me()) toast(t('waitFor', { name: seatName(round.turn) }), 1000);
      return;
    }
    if (flippedAt === round.seq) return;
    flippedAt = round.seq;
    send({ t: 'flip', n: round.seq });
    buzz(12);
  }

  /** A hand on the stack, sent the moment the finger lands. Right or wrong, the server decides. */
  function doSlap() {
    const round = r();
    if (!round?.options.slap || slappedFor === round.flip.n) return;
    slappedFor = round.flip.n;
    send({ t: 'slap', n: round.flip.n });
    sound.play('slap');
    buzz(25);
    paintHands(round, true);
  }

  // Pointer down, not click: on a race decided by milliseconds, the tap counts when it lands.
  const onDown = (e) => {
    if (!active || e.button > 0) return;
    if (e.target.closest('#slStack, #slSlap')) {
      e.preventDefault();
      doSlap();
    } else if (e.target.closest('#slPile')) {
      e.preventDefault();
      doFlip();
    }
  };
  document.addEventListener('pointerdown', onDown);
  // Keyboard users press the buttons (pointer clicks have a detail), or space to slap and F to flip.
  document.addEventListener('click', (e) => {
    if (!active || e.detail !== 0) return;
    if (e.target.closest('#slStack, #slSlap')) doSlap();
    else if (e.target.closest('#slPile')) doFlip();
  });
  document.addEventListener('keydown', (e) => {
    if (!active || e.repeat || e.target.closest('input, textarea') || document.querySelector('.sheet:not([hidden]), .overlay:not([hidden])')) return;
    if (e.key === ' ') {
      e.preventDefault();
      doSlap();
    } else if (e.key === 'f' || e.key === 'F') doFlip();
  });

  // ---- the stack ----------------------------------------------------------------

  /** The top few cards, a little askew, the count of the rest, and what was called for the top one. */
  function paintStack(round, isNew) {
    const la = round.lastAction;
    const sig = JSON.stringify([ctx.state.roundNo, round.stack, round.top, round.flip?.n]);
    if (sig === stackSig) return;
    stackSig = sig;
    const fresh = isNew && la?.type === 'flip';
    const n = round.top.length;
    const cards = round.top
      .map((card, i) => {
        const top = i === n - 1;
        const tilt = ((round.flips - (n - 1 - i)) * 37) % 13 - 6; // the same tilt each time a card is drawn
        return `<span class="sl-card${top ? ' top' : ''}${top && fresh ? ' incoming' : ''}" style="--tilt: ${tilt}deg">${cardHTML(card)}</span>`;
      })
      .join('');
    const label = round.stack ? t('aria.stack', { n: round.stack }) : t('aria.emptyStack');
    $('slStack').setAttribute('aria-label', label);
    $('slStack').querySelector('.sl-cards').innerHTML = cards || '<span class="card place"></span>';
    $('slStack').querySelector('.sl-size').textContent = round.stack || '';
  }

  /** The number the top card was up against, or the next one when the stack is empty. */
  function paintCall(round, isNew) {
    const showing = round.stack > 0 && round.flip;
    const n = showing ? round.flip.called : round.next;
    const el = $('slCall');
    el.classList.toggle('next', !showing);
    el.classList.toggle('hit', !!(showing && round.flip.match));
    el.innerHTML = `<small>${t(showing ? 'called' : 'nextCall')}</small><b>${n}</b><span>${esc(callName(n))}</span>`;
    if (isNew && round.lastAction?.type === 'flip') {
      el.classList.remove('pop');
      void el.offsetWidth; // restart the animation
      el.classList.add('pop');
    }
  }

  /**
   * The hands on the stack, in the order they got there, each from its own side of the table.
   * `mine` adds my own while it's on its way. After a take they stay a moment, then fade.
   */
  function paintHands(round, mine = false) {
    const la = round.lastAction;
    const slaps = round.window ? [...round.window.slaps] : la?.type === 'take' ? [...la.slaps] : [];
    const pending = (mine || slappedFor === round.flip?.n) && round.window && !slaps.includes(me());
    if (pending) slaps.push(me());
    const fading = !round.window;
    $('slHands').innerHTML = slaps
      .map((seat, i) => {
        const late = pending && i === slaps.length - 1;
        return `<span class="sl-hand${late ? ' pending' : ''}" data-pos="${posOf(seat)}" data-team="${seat % 2}" style="--i: ${i}"><span aria-hidden="true">🖐️</span><b>${late ? '·' : i + 1}</b></span>`;
      })
      .join('');
    $('slHands').classList.toggle('fade', fading && slaps.length > 0);
  }

  /** Your pile and the slap button, under the table. */
  function paintActions(round) {
    const mine = me() !== -1 && round;
    if (!mine) return void ($('actions').innerHTML = '');
    const left = round.piles[me()];
    const out = round.out.includes(me());
    $('actions').innerHTML = `
      <button type="button" class="sl-pile${round.options.flip ? ' ready' : ''}${out ? ' out' : ''}" id="slPile" aria-label="${esc(t('aria.pile', { n: left }))}">
        <span class="sl-back">${left ? '<span class="card back"></span>' : '<span class="card place"></span>'}</span>
        <span class="sl-pile-text"><b>${left}</b><small>${t(out ? 'outShort' : round.options.flip ? 'flip' : 'yourPile')}</small></span>
      </button>
      <button type="button" class="call sl-slap${round.window && round.options.slap ? ' hot' : ''}" id="slSlap" ${round.stack ? '' : 'disabled'}>
        <span aria-hidden="true">🖐️</span>${t('slap')}
      </button>`;
  }

  /** The countdown of an open window, for everyone at the table. */
  function paintBar(round) {
    const bar = $('slBar');
    const w = round?.window;
    $('board').classList.toggle('slap-now', !!(w && round.options.slap));
    if (!w) {
      barFor = null;
      bar.hidden = true;
      return;
    }
    if (barFor === w.n) return;
    barFor = w.n;
    bar.hidden = false;
    bar.innerHTML = `<i style="animation-duration: ${w.left}ms"></i>`;
  }

  // ---- motion -------------------------------------------------------------------------

  /** The card turned over on its way from the seat to the top of the stack. */
  function flyFlip(la) {
    const top = $('slStack').querySelector('.sl-card.top');
    const from = la.seat === me() ? $('slPile')?.querySelector('.sl-back') : seatAvatar(la.seat);
    const land = () => {
      top?.classList.remove('incoming');
      sound.play('place');
    };
    if (!top || !from || !canFly()) return land();
    const a = from.getBoundingClientRect();
    const b = top.getBoundingClientRect();
    const flier = top.cloneNode(true);
    flier.classList.remove('incoming');
    flier.classList.add('sl-flier');
    flier.dataset.team = la.seat % 2;
    Object.assign(flier.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    flier.insertAdjacentHTML('beforeend', '<span class="flier-back"></span>');
    document.body.append(flier);
    const dx = a.left + a.width / 2 - b.left - b.width / 2;
    const dy = a.top + a.height / 2 - b.top - b.height / 2;
    flier.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(0.55) rotateY(180deg)` }, { transform: 'translate(0, 0) scale(1.08) rotateY(0deg)', offset: 0.85 }, { transform: 'none' }],
      { duration: FLIP_ANIM_MS, easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)' },
    );
    // Face down for the first half of the turn.
    flier.querySelector('.flier-back').animate([{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0, offset: 0.46 }, { opacity: 0 }], { duration: FLIP_ANIM_MS, fill: 'forwards' });
    setTimeout(() => {
      flier.remove();
      land();
    }, FLIP_ANIM_MS);
  }

  /** Copies of the stack as it was, to slide to whoever takes it once the table is repainted. */
  function lift() {
    if (!canFly()) return [];
    return [...$('slStack').querySelectorAll('.sl-card .card')].map((el) => ({ node: el.cloneNode(true), rect: el.getBoundingClientRect() }));
  }

  function glide(lifted, seat) {
    const target = seat === me() ? $('slPile')?.querySelector('.sl-back') : seatAvatar(seat);
    const to = target?.getBoundingClientRect();
    if (!to) return;
    lifted.forEach(({ node, rect }, i) => {
      Object.assign(node.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: 0, zIndex: 40, pointerEvents: 'none' });
      document.body.append(node);
      const dx = to.left + to.width / 2 - rect.left - rect.width / 2;
      const dy = to.top + to.height / 2 - rect.top - rect.height / 2;
      node
        .animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(0.4) rotate(${i * 8 - 8}deg)`, opacity: 0.4 }], {
          duration: GLIDE_MS,
          delay: 260 + i * 40, // the hands show first
          easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
          fill: 'forwards',
        })
        .finished.finally(() => node.remove());
    });
  }

  // ---- results ------------------------------------------------------------------------

  const howLine = (h) => (h.reason === 'allOut' ? t('howAllOut') : t('howOut', { n: h.flips }));

  return {
    handPiece: '.hand-card', // no hand to drag
    ghostScale: 1,

    mount() {
      $('board').innerHTML = `
        <div class="grab-bar sl-bar" id="slBar" hidden></div>
        <div class="sl-table">
          <div class="sl-call" id="slCall" aria-live="polite"></div>
          <button type="button" class="sl-stack" id="slStack">
            <span class="sl-cards"></span>
            <span class="sl-hands" id="slHands"></span>
            <b class="sl-size"></b>
          </button>
        </div>`;
      stackSig = '';
      barFor = null;
      active = true;
    },

    unmount() {
      active = false;
      $('board').classList.remove('slap-now');
      $('actions').innerHTML = '';
    },

    renderBoard(prev) {
      const round = ctx.state.round;
      if (!round) {
        $('slStack').querySelector('.sl-cards').innerHTML = '';
        $('slStack').querySelector('.sl-size').textContent = '';
        $('slCall').innerHTML = $('slHands').innerHTML = $('actions').innerHTML = '';
        stackSig = '';
        paintBar(null);
        return;
      }
      const la = round.lastAction;
      const sameRound = prev?.roundNo === ctx.state.roundNo;
      const isNew = !!la && sameRound && la.n !== prev?.round?.lastAction?.n;
      const lifted = isNew && la.type === 'take' ? lift() : [];
      paintStack(round, isNew);
      paintCall(round, isNew);
      paintHands(round);
      paintActions(round);
      paintBar(ctx.state.phase === 'playing' ? round : null);
      if (lifted.length) glide(lifted, la.seat);
    },

    /** What just happened: the deal, flips, slaps, who took the stack and why. */
    feedback(prev) {
      const round = ctx.state.round;
      const la = round?.lastAction;
      const newRound = prev && prev.roundNo !== ctx.state.roundNo;
      if (round && newRound && ctx.state.phase === 'playing' && !la) {
        // The whole deck goes round the table, face down, ten each.
        ctx.deal.start({ mix: 'cards', drops: roundTable({ first: round.starter, each: 10, me: -1, mine: [] }) });
      }
      if (!la || !prev || newRound || la.n === prev.round?.lastAction?.n) return;
      if (la.type === 'flip') {
        flyFlip(la);
        if (la.out) shout(la.seat, la.seat === me() ? t('youRanOut') : t('ranOut'), 'slow');
        if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
      } else if (la.type === 'slap') {
        if (la.seat !== me()) sound.play('slap');
      } else if (la.type === 'take') {
        if (la.why === 'false') {
          shout(la.seat, `🤡 ${t('falseSlap')}`, 'false');
          if (la.seat === me()) laughAtMe();
          else sound.play('laugh');
        } else {
          shout(la.seat, `${t('lastHand')} +${la.cards}`, 'last');
          sound.play('grab');
          if (la.seat === me()) buzz([60, 40, 60]);
        }
        if (la.back) setTimeout(() => shout(la.seat, t('backIn'), 'slow'), 700);
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && s.round.options.flip,

    turnAlert: () => true,

    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const round = ctx.state.round;
      const out = round?.out.includes(seat);
      const left = round?.piles[seat] ?? 0;
      return {
        badge: out ? `<b class="sl-out-tag" title="${esc(t('outOfCards'))}">0</b>` : '',
        info: pos === 0 || !round ? '' : `<span class="sl-count${out ? ' out' : ''}"><i></i>${out ? t('outShort') : left}</span>`,
        bubble: '',
      };
    },

    // ---- the hand: there isn't one -------------------------------------------

    handKeys: () => [],
    handPieceHTML: () => '',
    dressGhost() {},
    dragOver() {},
    dragClear() {},
    drop: () => () => {},

    /** During a window the status says to slap, or where your hand landed. */
    status(round) {
      const w = round.window;
      if (w) {
        if (me() === -1) return { cls: '', text: t('slapping') };
        const place = w.slaps.indexOf(me());
        if (place === -1) return { cls: 'mine', text: t('slapNow') };
        return { cls: '', text: t('yourPlace', { n: place + 1 }) };
      }
      if (round.out.includes(me())) return { cls: 'mine', text: t('youreOut') };
      if (round.options.flip) return { cls: 'mine', text: t('yourFlip') };
      return null;
    },

    resultDelay: () => GLIDE_MS + 1400,

    result() {
      const { over, taken, falseSlaps, flips } = ctx.state.round;
      const row = (seat) =>
        `<div class="ra" data-team="${seat % 2}"><span>${esc(seatName(seat))}</span><b>${t('takenN', { n: taken[seat] })}${
          falseSlaps[seat] ? ` · ${t('falseN', { n: falseSlaps[seat] })}` : ''
        }</b></div>`;
      const how = howLine({ reason: over.reason, flips });
      return {
        winSeat: over.seat,
        gained: [0, 1, 2, 3].map((s) => (s === over.seat ? 1 : 0)),
        emoji: '🖐️',
        sub: over.reason === 'allOut' ? t('subAllOut', { name: seatName(over.seat) }) : t('subOut', { name: seatName(over.seat) }),
        lastRound: how,
        details: `<p class="ra-head">${t('stacksTaken')}</p>${[0, 1, 2, 3].map((i) => (me() === -1 ? i : (me() + i) % 4)).map(row).join('')}`,
      };
    },

    historyRow: (h) => ({ how: esc(howLine(h)) }),
  };
}
