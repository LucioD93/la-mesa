// The Kemps (kimi) table: the four cards in the middle that everyone swaps with at once,
// the gestures anyone can make, your team's secret signal, and the calls that end a hand.
// Swap by dragging a card from your hand onto one in the middle, or by tapping one of
// each. Under every other seat sit the cards it visibly took from the middle.
import { cardKey, cardName, cardSVG, parseKey } from './french.js';
import { roundTable } from './deal.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

// Same ids as SIGNS in server/games/kemps.js.
export const SIGNS = { wink: '😉', nose: '👃', ear: '👂', tongue: '😛', brow: '🤨', shrug: '🤷' };

export function createView(ctx) {
  const { $, esc, me, seatName, seatEl, toast, buzz, shake, send, within } = ctx;
  let pickedHand = null; // key of the hand card picked for a swap
  let pickedMid = null; // key of the middle card picked for a swap
  let mode = null; // 'corta' while picking whom to cut, 'signal' while picking a new signal
  let midSig = '';
  let actionsHTML = ''; // repainted only when it changes, so a button never swaps under a finger

  const cardHTML = (card, cls = '') => `<span class="card ${cls}">${cardSVG(card)}</span>`;
  const playing = () => ctx.state?.phase === 'playing' && !!ctx.state.round && !ctx.state.round.over;
  const seated = () => me() !== -1;
  const four = (hand) => hand?.length === 4 && hand.every((c) => c[0] === hand[0][0]);
  const rankWord = (n) => t(`rank.${n}`);
  // Results name every seat, yours included: "You" reads wrong in their sentences.
  const nameOf = (seat) => ctx.state.seats[seat]?.name ?? '—';

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

  // ---- swapping ---------------------------------------------------------------

  function swap(take, give) {
    pickedHand = pickedMid = null;
    send({ t: 'swap', take, give });
    buzz(12);
    ctx.redraw();
  }

  function pickMiddle(key) {
    if (!playing() || !seated()) return;
    if (pickedHand) return swap(parseKey(key), parseKey(pickedHand));
    pickedMid = pickedMid === key ? null : key;
    if (pickedMid) toast(t('pickHand'), 1200);
    ctx.redraw();
  }

  function pickHand(key) {
    if (!playing()) return;
    if (pickedMid) return swap(parseKey(pickedMid), parseKey(key));
    pickedHand = pickedHand === key ? null : key;
    if (pickedHand) toast(t('pickMiddle'), 1200);
    ctx.redraw();
  }

  /** The middle card under the pointer, if any. */
  function slotAt(x, y) {
    for (const el of $('kmMiddle')?.querySelectorAll('.km-slot') ?? []) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
    }
    return null;
  }

  $('board').addEventListener('click', (e) => {
    const slot = ctx.state?.game === 'kemps' && e.target.closest('.km-slot');
    if (slot) pickMiddle(slot.dataset.key);
  });

  // ---- gestures and calls -------------------------------------------------------

  function renderActions() {
    const el = $('actions');
    const r = ctx.state.round;
    if (!playing() || !seated()) return void (el.innerHTML = actionsHTML = '');
    const o = r.options;
    const signs = Object.entries(SIGNS)
      .map(([id, emoji]) => {
        const ours = id === r.signal;
        const label = `${t(`sign.${id}`)}${ours ? ` · ${t('ourSignal')}` : ''}`;
        return `<button class="km-sign ${ours ? 'ours' : ''}" data-sign="${id}" aria-label="${esc(label)}" title="${esc(label)}">${emoji}${ours ? '<b aria-hidden="true">★</b>' : ''}</button>`;
      })
      .join('');
    let calls;
    if (mode === 'corta') {
      calls = o.corta
        .map((s) => `<button class="call km-corta" data-corta="${s}">✂️ ${esc(seatName(s))}</button>`)
        .concat(`<button class="call sort" data-km="cancel">${t('cancel')}</button>`)
        .join('');
    } else if (mode === 'signal') {
      calls = `<span class="km-note">${t('pickSignal')}</span><button class="call sort" data-km="cancel">${t('cancel')}</button>`;
    } else {
      calls = [
        `<button class="call km-kemps" data-km="kemps">${t('callKemps')}</button>`,
        `<button class="call km-corta" data-km="corta">${t('callCorta')}</button>`,
        `<button class="call km-pass ${o.pass ? '' : 'off'}" data-km="pass">${t(o.pass ? 'pass' : 'passed')}</button>`,
        `<button class="call sort" data-km="signal">${t('changeSignal')}</button>`,
      ].join('');
    }
    const html = `<div class="km-signs ${mode === 'signal' ? 'choosing' : ''}">${signs}</div><div class="km-calls">${calls}</div>`;
    if (html === actionsHTML && el.innerHTML) return;
    el.innerHTML = actionsHTML = html;
  }

  $('actions').addEventListener('click', (e) => {
    if (ctx.state?.game !== 'kemps' || !playing()) return;
    const r = ctx.state.round;
    const sign = e.target.closest('[data-sign]')?.dataset.sign;
    const act = e.target.closest('[data-km]')?.dataset.km;
    const cut = e.target.closest('[data-corta]')?.dataset.corta;
    if (sign && mode === 'signal') {
      mode = null;
      send({ t: 'signal', sign });
      toast(t('signalSet', { sign: `${SIGNS[sign]} ${t(`sign.${sign}`)}` }), 2200);
    } else if (sign) {
      send({ t: 'gesture', sign });
      buzz(8);
    } else if (cut != null) {
      mode = null;
      send({ t: 'corta', seat: Number(cut) });
      buzz([30, 20, 50]);
    } else if (act === 'kemps') {
      send({ t: 'kemps' });
      buzz([30, 20, 50]);
    } else if (act === 'pass') {
      if (r.options.pass) send({ t: 'pass' });
    } else if (act === 'corta' || act === 'signal') mode = act;
    else if (act === 'cancel') mode = null;
    renderActions();
  });

  // ---- the middle ---------------------------------------------------------------

  function paintMiddle(r, fresh) {
    const la = r.lastAction;
    const sig = JSON.stringify([ctx.state.roundNo, r.middle, la?.n, pickedMid, i18n.lang]);
    if (sig === midSig) return;
    midSig = sig;
    if (pickedMid && !r.middle.some((c) => cardKey(c) === pickedMid)) pickedMid = null;
    $('kmMiddle').innerHTML = r.middle
      .map((card, i) => {
        const key = cardKey(card);
        const swapped = fresh === 'swap' && la.slot === i;
        const cls = ['km-slot', key === pickedMid ? 'picked' : '', swapped ? 'swapped' : '', fresh === 'refresh' ? 'dealt' : ''].join(' ');
        const team = swapped ? la.seat % 2 : '';
        return `<button type="button" class="${cls}" data-key="${key}" data-team="${team}" style="--i: ${i}" aria-label="${esc(cardName(card))}">${cardHTML(card)}</button>`;
      })
      .join('');
    const left = r.reshuffles ? t('reshuffled', { n: r.reshuffles }) : '';
    $('kmInfo').innerHTML = `<span class="km-deck"><i class="mini-back"></i>${r.deck}</span><small>${t('middleNo', { n: r.deals })}${left ? ` · ${left}` : ''}</small>`;
  }

  // ---- results ------------------------------------------------------------------

  /** "Ana called Kimi: Bob had four 7s", or how it went wrong. */
  function howItWent(over, hands) {
    const caller = nameOf(over.seat);
    const target = nameOf(over.target);
    const held = hands?.[over.target];
    const rank = held ? rankWord(held[0][0]) : '';
    if (over.reason === 'kemps') return over.right ? t('kempsRight', { caller, target, rank }) : t('kempsWrong', { caller, target });
    return over.right ? t('cortaRight', { caller, target, rank }) : t('cortaWrong', { caller, target });
  }

  return {
    handPiece: '.hand-card',
    ghostScale: 1.06,

    mount() {
      $('board').innerHTML = `
        <div class="km-info" id="kmInfo"></div>
        <div class="km-middle" id="kmMiddle"></div>
        <p class="km-hint" id="kmHint"></p>`;
      midSig = actionsHTML = '';
      pickedHand = pickedMid = mode = null;
    },

    unmount() {
      $('actions').innerHTML = '';
    },

    renderBoard(prev) {
      const r = ctx.state.round;
      if (!r) {
        $('kmMiddle').innerHTML = $('kmInfo').innerHTML = $('kmHint').textContent = '';
        midSig = '';
        $('actions').innerHTML = '';
        return;
      }
      if (!playing()) mode = null;
      if (pickedHand && !r.hand?.some((c) => cardKey(c) === pickedHand)) pickedHand = null;
      const la = r.lastAction;
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      const fresh = la && sameRound && la.n !== prev.round.lastAction?.n ? la.type : null;
      paintMiddle(r, fresh);
      $('kmHint').textContent = seated() && playing() ? t(r.exposed ? 'exposed' : 'hint', { sign: `${SIGNS[r.signal]} ${t(`sign.${r.signal}`)}` }) : '';
      $('kmHint').classList.toggle('warn', !!r.exposed);
      renderActions();
    },

    /** What just happened: the deal, swaps, new middles, gestures and calls. */
    feedback(prev) {
      const r = ctx.state.round;
      if (!r || !prev) return;
      const sameRound = prev.roundNo === ctx.state.roundNo && !!prev.round;
      if (!sameRound && ctx.state.phase === 'playing') {
        // Shuffled in the middle, four each round the table, then the middle turned up.
        const mine = [...$('hand').querySelectorAll('.hand-card')].map((el) => el.dataset.key);
        const drops = [...roundTable({ first: (r.dealer + 1) % 4, each: 4, me: me(), mine }), ...r.middle.map((c) => ({ key: cardKey(c) }))];
        ctx.deal.start({ mix: 'cards', drops, rest: r.deck });
        return;
      }
      if (!sameRound) return;
      const la = r.lastAction;
      if (la && la.n !== prev.round.lastAction?.n) {
        if (la.type === 'swap') sound.play(la.seat === me() ? 'grab' : 'place');
        else if (la.type === 'refresh') {
          sound.play('deal');
          if (la.reshuffled) toast(t('reshuffling'), 1800);
        }
      }
      const g = r.gesture;
      if (g && g.n !== prev.round.gesture?.n) {
        shout(g.seat, SIGNS[g.sign], 'km-gesture');
        sound.play('react');
      }
      const over = r.over;
      if (over && !prev.round.over) {
        shout(over.seat, over.reason === 'kemps' ? t('callKemps') : t('callCorta'), over.right ? 'flor' : 'noquiero');
        sound.play(over.right ? 'flor' : 'no');
        buzz([40, 30, 60]);
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && !!s.round.options?.swap,
    turnAlert: () => true,
    // Everyone plays at once: the ring shows who is still busy with the middle.
    isTurn: (seat) => !!ctx.state.round && !ctx.state.round.passed?.[seat],

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      if (!r) return { badge: '', info: '', bubble: '' };
      const passed = r.passed?.[seat];
      const known = r.known?.[seat] ?? [];
      return {
        badge: passed ? `<b class="mano-tag km-passed" title="${t('passedTag')}">✋</b>` : '',
        info: pos === 0 || !known.length ? '' : `<span class="km-known" title="${t('knownTitle')}">${known.map((c) => cardHTML(c, 'mini')).join('')}</span>`,
        bubble: '',
      };
    },

    // ---- the hand -----------------------------------------------------------

    handKeys: (hand) => hand.map(cardKey),
    // A swap puts the new card where the old one was.
    keepsOrder: () => false,

    handPieceHTML(key, dragging) {
      const card = parseKey(key);
      const cls = ['card hand-card', playing() ? 'playable' : '', key === pickedHand ? 'selected' : '', dragging ? 'dragging' : ''].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-pressed="${key === pickedHand}" aria-label="${esc(cardName(card))}">${cardSVG(card)}</button>`;
    },

    afterHand(hand) {
      $('hand').classList.toggle('km-four', four(hand));
    },

    // Keyboard users press the card to pick it (pointer clicks have a detail).
    handClick(e) {
      const btn = e.target.closest('.hand-card');
      if (btn && e.detail === 0) pickHand(btn.dataset.key);
    },

    dressGhost(ghost) {
      ghost.classList.remove('hand-card', 'selected', 'playable', 'dragging');
      ghost.classList.add('drag-ghost');
    },

    dragOver(key, x, y) {
      const over = playing() ? slotAt(x, y) : null;
      for (const el of $('kmMiddle').querySelectorAll('.km-slot')) el.classList.toggle('drop-hover', el === over);
    },

    dragClear() {
      for (const el of document.querySelectorAll('#board .drop-hover')) el.classList.remove('drop-hover');
    },

    /** The pointer came up. Returns what to do once the drag is cleaned up. */
    drop({ key, ghost, btn, x, y, tapped, dropped, rearranged }) {
      const slot = dropped && !rearranged ? slotAt(x, y) : null;
      return () => {
        if (tapped) return pickHand(key);
        if (slot && playing()) return swap(parseKey(slot.dataset.key), parseKey(key));
        if (ghost && !rearranged && within('board', x, y)) {
          shake(btn);
          toast(t('dropHint'), 1400);
        }
      };
    },

    status(r) {
      if (r.over) return { cls: '', text: t('roundOver') };
      if (!seated()) return { cls: '', text: t('everyone') };
      if (four(r.hand)) return { cls: 'mine', text: t('gotFour') };
      if (!r.options.pass) return { cls: '', text: t('waitingMiddle') };
      return { cls: 'mine', text: t('swapPrompt') };
    },

    resultDelay: () => 1800,

    result() {
      const r = ctx.state.round;
      const { over } = r;
      const details = [];
      if (over.shown) details.push(`<div class="ra" data-team="${over.target % 2}"><span>${esc(t('gaveAway', { name: nameOf(over.target) }))}</span><b>${SIGNS[over.shown]}</b></div>`);
      return {
        winTeam: over.team ?? 0,
        gained: [over.team === 0 ? 1 : 0, over.team === 1 ? 1 : 0],
        emoji: over.reason === 'corta' ? '✂️' : '🃏',
        sub: over.reason === 'deck' ? '' : howItWent(over, r.hands),
        lastRound: over.reason === 'deck' ? null : howItWent(over, r.hands),
        tie: over.team === null ? { title: t('deadTitle'), sub: t('deadSub') } : null,
        details: details.join(''),
      };
    },

    resultHand: (hand) => `<span class="rh-cards">${hand.map((c) => cardHTML(c, 'mini')).join('')}</span>`,

    historyRow(h) {
      const how = h.reason === 'deck' ? t('histDead') : t(`hist.${h.reason}.${h.right ? 'right' : 'wrong'}`, { name: nameOf(h.seat), target: nameOf(h.target) });
      return { cell: (team) => (h.team === team ? '+1' : '·'), how: esc(how) };
    },
  };
}
