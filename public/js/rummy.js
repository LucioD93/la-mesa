// The rummy table: the deck, the discard pile, the melds everyone shares, and a hand
// you pick cards from. Tap cards to select them, then meld, lay off on a meld or
// discard; or drag one card straight onto the discard pile or a meld.
import { cardKey, cardName, cardSVG, parseKey, sameCard } from './french.js';
import { canFly, FLIGHT_MS, isFlying, launch, whenLanded } from './flight.js';
import { roundTable } from './deal.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const DRAW_MS = 500;
const SUITS = ['S', 'H', 'D', 'C'];

// The same check the server makes (server/games/rummy.js), to light up what's legal.
function arrange(cards) {
  if (cards.length < 3 || new Set(cards.map(cardKey)).size !== cards.length) return null;
  if (cards.every(([n]) => n === cards[0][0])) return { kind: 'set', cards };
  if (!cards.every(([, s]) => s === cards[0][1])) return null;
  for (const high of [false, true]) {
    const at = ([n]) => (high && n === 1 ? 14 : n);
    const sorted = cards.slice().sort((a, b) => at(a) - at(b));
    if (sorted.every((c, i) => !i || at(c) === at(sorted[i - 1]) + 1)) return { kind: 'run', cards: sorted };
  }
  return null;
}
const fits = (meld, card) => arrange([...meld.cards, card])?.kind === meld.kind;

const bySuit = (a, b) => SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]) || a[0] - b[0];
const byRank = (a, b) => a[0] - b[0] || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]);
const signed = (n) => (n < 0 ? `−${-n}` : `+${n}`);

export function createView(ctx) {
  const { $, esc, me, seatName, seatEl, seatAvatar, toast, buzz, shake, send, laughAtMe, within, teamLabel } = ctx;
  let selected = new Set(); // keys of the hand cards picked for the next move
  let sortBy = 'suit';
  let incoming = null; // a discard still in the air: its key
  let boardSig = '';

  const cardHTML = (card, cls = '') => `<span class="card ${cls}">${cardSVG(card)}</span>`;
  const picked = () => ctx.state.round.hand.filter((c) => selected.has(cardKey(c)));
  const canPlay = () => ctx.state?.phase === 'playing' && !!ctx.state.round?.options.play;

  // ---- what you can do ------------------------------------------------------

  function renderActions() {
    const r = ctx.state.round;
    const el = $('actions');
    const o = r?.options;
    if (!o || ctx.state.phase !== 'playing' || !r.hand) return void (el.innerHTML = '');
    const buttons = [];
    if (o.draw) {
      buttons.push(`<button class="call draw" data-draw="stock">${t('drawDeck')}</button>`);
      if (r.discard.length) buttons.push(`<button class="call" data-draw="discard">${t('takeDiscard', { card: cardName(r.discard.at(-1)) })}</button>`);
    }
    if (o.play) {
      const cards = picked();
      if (cards.length >= 3) buttons.push(`<button class="call meld ${arrange(cards) ? '' : 'off'}" data-do="meld">${t('meld')}</button>`);
      if (cards.length === 1) buttons.push(`<button class="call discard" data-do="discard">${t('discardIt', { card: cardName(cards[0]) })}</button>`);
    }
    if (r.hand.length > 1) buttons.push(`<button class="call sort" data-do="sort">${t(sortBy === 'suit' ? 'sortRank' : 'sortSuit')}</button>`);
    el.innerHTML = buttons.join('');
  }

  // ---- moves ------------------------------------------------------------------

  function after() {
    selected.clear();
    buzz(15);
  }

  function discard(card) {
    const r = ctx.state.round;
    if (sameCard(card, r.taken) && r.hand.length > 1) return toast(t('justTook'), 1800);
    send({ t: 'discard', card });
    after();
  }

  function meld(cards) {
    if (!arrange(cards)) return laughAtMe();
    send({ t: 'meld', cards });
    after();
  }

  function layoff(card, index) {
    if (!fits(ctx.state.round.melds[index], card)) return laughAtMe();
    send({ t: 'layoff', card, meld: index });
    after();
  }

  function draw(from) {
    const r = ctx.state.round;
    if (!r.options.draw) return waitToast(r);
    if (from === 'discard' && !r.discard.length) return;
    send({ t: 'draw', from });
    buzz(15);
  }

  function waitToast(r) {
    if (r.options.draw) toast(t('drawFirst'), 1400);
    else if (r.options.play) toast(t('alreadyDrew'), 1400);
    else toast(t('waitFor', { name: seatName(r.turn) }), 1200);
  }

  function toggle(key) {
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    buzz(8);
    ctx.redraw();
  }

  function sortHand() {
    sortBy = sortBy === 'suit' ? 'rank' : 'suit';
    const cmp = sortBy === 'suit' ? bySuit : byRank;
    ctx.sortHand((a, b) => cmp(parseKey(a), parseKey(b)));
    renderActions();
  }

  // ---- the table ----------------------------------------------------------------

  function paintBoard(r, fresh) {
    const one = r.options.play && selected.size === 1 ? picked()[0] : null;
    const sig = JSON.stringify([ctx.state.roundNo, r.stock, r.discard, r.melds, r.melded, me(), one, incoming, r.options, i18n.lang]);
    if (sig === boardSig) return;
    boardSig = sig;
    const team = me() === -1 ? 0 : me() % 2;
    const under = r.discard.slice(0, -1).map((c) => cardHTML(c, 'under')).join('');
    const top = r.discard.at(-1);
    const topKey = top && cardKey(top);
    $('rmPiles').innerHTML = `
      <button class="rm-stock ${r.options.draw ? 'ready' : ''}" data-draw="stock" data-key="stock" aria-label="${t('drawDeck')}">
        <span class="card back"></span><small>${r.stock}</small>
      </button>
      <button class="rm-discard ${r.options.draw && top ? 'ready' : ''} ${r.options.play && selected.size === 1 ? 'target' : ''}" data-draw="discard" aria-label="${t('discardPile')}">
        ${under}${top ? cardHTML(top, `top ${incoming === topKey ? 'incoming' : ''} ${fresh === 'discard' ? 'fresh' : ''}`).replace('<span', `<span data-key="${topKey}"`) : '<span class="card place"></span>'}
      </button>
      <div class="rm-melded"><small>${t('melded')}</small> <b data-team="${team}">${r.melded[team]}</b> · <b data-team="${1 - team}">${r.melded[1 - team]}</b></div>`;
    $('rmMelds').innerHTML = r.melds.length
      ? r.melds
          .map((m, i) => {
            const cls = [one && fits(m, one) ? 'fits' : '', fresh === i ? 'fresh' : ''].join(' ');
            return `<button class="meld ${cls}" data-meld="${i}" data-team="${m.team}">${m.cards.map((c) => cardHTML(c)).join('')}</button>`;
          })
          .join('')
      : `<p class="board-empty">${t('noMelds')}</p>`;
  }

  /** Fly a card back from a pile to the seat that drew it. */
  function toSeat(from, seat) {
    const avatar = seatAvatar(seat);
    if (!from || !avatar || !canFly()) return;
    const a = from.getBoundingClientRect();
    const b = avatar.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'card back flier-draw';
    el.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    document.body.append(el);
    const dx = b.left + b.width / 2 - a.left - a.width / 2;
    const dy = b.top + b.height / 2 - a.top - a.height / 2;
    el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.4 }], {
      duration: DRAW_MS,
      easing: 'ease-in',
    }).onfinish = () => el.remove();
  }

  /** Fly a discard from the seat that threw it onto the pile. */
  function flyDiscard(la) {
    const slot = () => $('rmPiles')?.querySelector('.card.top');
    const face = slot();
    const avatar = seatAvatar(la.seat);
    const land = () => {
      incoming = null;
      slot()?.classList.remove('incoming');
    };
    if (!face || !avatar || !canFly()) {
      sound.play('place');
      return land();
    }
    const flier = face.cloneNode(true);
    flier.classList.remove('incoming', 'top', 'fresh');
    flier.classList.add('flier');
    flier.dataset.team = la.seat % 2;
    flier.style.width = `${face.offsetWidth}px`;
    flier.style.height = `${face.offsetHeight}px`;
    flier.insertAdjacentHTML('beforeend', '<span class="flier-back"></span>');
    launch({
      seat: la.seat,
      avatar,
      flier,
      target: slot,
      fit: () => [face.offsetWidth, face.offsetHeight],
      onImpact: () => sound.play('place'),
      onDone: land,
    });
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

  /** Where a dragged card would go: the discard pile, a meld, or nowhere. */
  function dropTarget(x, y) {
    const pile = $('rmPiles').querySelector('.rm-discard');
    if (pile && hit(pile, x, y)) return { type: 'discard' };
    for (const el of $('rmMelds').querySelectorAll('.meld')) if (hit(el, x, y)) return { type: 'layoff', index: Number(el.dataset.meld) };
    return null;
  }
  const hit = (el, x, y) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  $('actions').addEventListener('click', (e) => {
    const el = e.target.closest('[data-draw],[data-do]');
    if (!el) return;
    if (el.dataset.draw) return draw(el.dataset.draw);
    const what = el.dataset.do;
    if (what === 'sort') return sortHand();
    if (!canPlay()) return;
    if (what === 'meld') meld(picked());
    else if (what === 'discard') discard(picked()[0]);
  });

  return {
    handPiece: '.hand-card',
    ghostScale: 1.06,

    mount() {
      $('board').innerHTML = `
        <div class="rm-piles" id="rmPiles"></div>
        <div class="rm-melds" id="rmMelds"></div>`;
      $('board').onclick = (e) => {
        if (ctx.state?.phase !== 'playing') return;
        const pile = e.target.closest('[data-draw]');
        const m = e.target.closest('[data-meld]');
        const r = ctx.state.round;
        if (pile && r.options.draw) return draw(pile.dataset.draw);
        if (!canPlay()) return pile || m ? waitToast(r) : undefined;
        const cards = picked();
        if (pile?.dataset.draw === 'discard') {
          if (cards.length === 1) discard(cards[0]);
          else toast(t('pickOne'), 1400);
        } else if (m) {
          if (cards.length === 1) layoff(cards[0], Number(m.dataset.meld));
          else toast(t('pickOne'), 1400);
        }
      };
      boardSig = '';
      selected = new Set();
    },

    unmount() {
      $('board').onclick = null;
      $('actions').innerHTML = '';
      incoming = null;
    },

    renderBoard(prev) {
      const r = ctx.state.round;
      if (!r) {
        $('rmPiles').innerHTML = $('rmMelds').innerHTML = '';
        boardSig = '';
        return;
      }
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      if (!sameRound) {
        selected.clear();
        incoming = null;
      }
      // Forget picks that left the hand.
      const keys = new Set((r.hand ?? []).map(cardKey));
      for (const k of selected) if (!keys.has(k)) selected.delete(k);
      const la = r.lastAction;
      const isNew = !!la && sameRound && la.n !== prev.round.lastAction?.n;
      let fresh = null;
      if (isNew && la.type === 'discard') {
        fresh = 'discard';
        if (la.seat !== me() && (isFlying(la.seat) || canFly())) incoming = cardKey(la.card);
      }
      if (isNew && (la.type === 'meld' || la.type === 'layoff')) fresh = la.meld;
      renderActions();
      paintBoard(r, fresh);
    },

    feedback(prev) {
      const r = ctx.state.round;
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      const la = r?.lastAction;
      if (prev && r && !la && !sameRound && ctx.state.phase === 'playing') {
        // Shuffled where the deck sits, seven each round the table, then one turned up.
        const mine = [...$('hand').querySelectorAll('.hand-card')].map((el) => el.dataset.key);
        const drops = roundTable({ first: (r.dealer + 1) % 4, each: 7, me: me(), mine });
        if (r.discard.length) drops.push({ key: cardKey(r.discard.at(-1)) });
        const origin = $('rmPiles').querySelector('.rm-stock .card');
        ctx.deal.start({ mix: 'cards', drops, rest: r.stock, hide: ['stock'], origin });
      }
      if (!la || !sameRound || la.n === prev.round.lastAction?.n) return;
      if (la.type === 'draw') {
        if (la.seat !== me()) {
          toSeat($('rmPiles').querySelector(la.from === 'stock' ? '.rm-stock .card' : '.rm-discard'), la.seat);
          if (la.from === 'discard') toast(t('tookDiscard', { name: seatName(la.seat), card: cardName(la.card) }), 1800);
        }
        sound.play('place');
      } else if (la.type === 'discard') {
        if (la.seat !== me() && incoming) flyDiscard(la);
        else sound.play('place');
      } else {
        sound.play(la.type === 'meld' ? 'call' : 'place');
        if (la.phrase) sound.playClip('manguangua');
      }
      if (r.over?.reason === 'out') {
        whenLanded(() => {
          shout(r.over.seat, t('rummyOut'));
          sound.play('flor');
          buzz([40, 30, 60]);
        });
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && (s.round.options.draw || s.round.options.play),
    turnAlert: () => true,
    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      const n = ctx.state.seats[seat].count;
      return {
        badge: r?.dealer === seat ? `<b class="mano-tag" title="${t('dealer')}">${t('dealerTag')}</b>` : '',
        info: pos === 0 || !r ? '' : `<span class="count" title="${t('cardsLeft')}"><i class="mini-back"></i>${n}</span>`,
        bubble: '',
      };
    },

    // ---- the hand -----------------------------------------------------------

    handKeys: (hand) => hand.map(cardKey),
    keepsOrder: (r) => r.lastAction != null,

    handPieceHTML(key, dragging) {
      const r = ctx.state.round;
      const card = parseKey(key);
      const cls = [
        'card hand-card',
        selected.has(key) ? 'selected' : '',
        sameCard(card, r.newCard) ? 'new' : '',
        sameCard(card, r.taken) ? 'taken' : '',
        dragging ? 'dragging' : '',
      ].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-pressed="${selected.has(key)}" aria-label="${t('aria.card', { card: cardName(card) })}">${cardSVG(card)}</button>`;
    },

    afterHand(hand) {
      $('hand').style.setProperty('--n', Math.max(hand.length, 7));
    },

    // Keyboard users press the card to pick it (pointer clicks have a detail).
    handClick(e) {
      const btn = e.target.closest('.hand-card');
      if (btn && e.detail === 0) toggle(btn.dataset.key);
    },

    dressGhost(ghost) {
      ghost.classList.remove('hand-card', 'selected', 'dragging');
      ghost.classList.add('drag-ghost');
    },

    dragOver(key, x, y) {
      const target = canPlay() ? dropTarget(x, y) : null;
      const card = parseKey(key);
      $('rmPiles').querySelector('.rm-discard')?.classList.toggle('drop-hover', target?.type === 'discard');
      for (const el of $('rmMelds').querySelectorAll('.meld')) {
        const over = target?.type === 'layoff' && target.index === Number(el.dataset.meld);
        el.classList.toggle('drop-hover', over && fits(ctx.state.round.melds[target.index], card));
      }
    },

    dragClear() {
      for (const el of document.querySelectorAll('#board .drop-hover')) el.classList.remove('drop-hover');
    },

    /** The pointer came up. Returns what to do once the drag is cleaned up. */
    drop({ key, ghost, btn, x, y, tapped, dropped, rearranged }) {
      const r = ctx.state.round;
      const target = dropped && !rearranged ? dropTarget(x, y) : null;
      const card = parseKey(key);
      return () => {
        if (tapped) return toggle(key);
        if (!target) {
          if (ghost && !rearranged && within('board', x, y)) toast(t('dropHint'), 1600);
          return;
        }
        if (!r.options.play) {
          shake(btn);
          return waitToast(r);
        }
        if (target.type === 'discard') discard(card);
        else layoff(card, target.index);
      };
    },

    status(r) {
      if (r.options.draw) return { cls: 'mine', text: t('drawPrompt') };
      if (r.options.play) return { cls: 'mine', text: t('playPrompt') };
      return null;
    },

    // ---- results ------------------------------------------------------------

    resultDelay(prev) {
      const la = ctx.state.round.lastAction;
      const thrown = la?.type === 'discard' && la.seat !== me() && la.n !== prev.round?.lastAction?.n;
      return (thrown ? FLIGHT_MS : 0) + 1200;
    },

    result() {
      const r = ctx.state.round;
      const gained = r.score.map((s) => s.points);
      const out = r.over.reason === 'out';
      return {
        winTeam: gained[0] >= gained[1] ? 0 : 1,
        gained,
        emoji: '🃏',
        sub: out ? t('wentOut', { name: seatName(r.over.seat) }) : t('deckOut'),
        lastRound: null,
        tie: gained[0] === gained[1] ? { title: t('tieTitle'), sub: t('tieSub', { n: signed(gained[0]) }) } : null,
        details: [0, 1]
          .map((team) => {
            const s = r.score[team];
            return `<div class="ra" data-team="${team}"><span>${esc(teamLabel(team))}: ${t('melded')} ${s.melded} · ${t('inHand')} ${s.held}</span><b>${signed(s.points)}</b></div>`;
          })
          .join(''),
      };
    },

    resultHand: (hand) =>
      hand.length ? `<span class="rh-cards">${hand.map((c) => cardHTML(c, 'mini')).join('')}</span>` : `<span class="muted">${t('outCheck')}</span>`,

    historyRow(h) {
      return {
        cell: (team) => signed(h.score[team].points),
        how: h.out != null ? esc(t('histOut', { name: seatName(h.out) })) : t('histDeck'),
      };
    },
  };
}
