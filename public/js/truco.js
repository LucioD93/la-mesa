// The truco table: vira, the trick, the calls, and how a hand reads.
import { cardSVG, cardKey, parseKey, pieceOf } from './cards.js';
import { canFly, FLIGHT_MS, isFlying, launch, whenLanded } from './flight.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const trucoCall = (level) => t(`truco${level}`);
const gainedBy = (awards, team) => awards.reduce((sum, a) => sum + (a.team === team ? a.points : 0), 0);

export function createView(ctx) {
  const { $, esc, me, posOf, seatName, seatEl, seatAvatar, toast, buzz, shake, send, laughAtMe, within, teamLabel } = ctx;
  const seenCards = new Set(); // cards already on the table, so only new ones animate
  let trickSig = '';

  function cardHTML(card, cls = '', pieces = ctx.state.round?.pieces) {
    const piece = pieceOf(card, pieces);
    const badge = piece && !cls.includes('mini') ? `<em class="badge">${t(piece)}</em>` : '';
    return `<span class="card ${piece} ${cls}">${cardSVG(card)}${badge}</span>`;
  }

  function renderActions() {
    const r = ctx.state.round;
    const el = $('actions');
    const o = r?.options;
    if (!o || ctx.state.phase !== 'playing') return void (el.innerHTML = '');
    const btn = (attr, label, cls = '') => `<button class="call ${cls}" ${attr}>${label}</button>`;
    const raises = { envido: t('plusTwo'), cinco: t('cinco'), falta: t('falta') };
    const buttons = [];
    if (o.answer) {
      buttons.push(btn('data-answer="1"', t('quiero'), 'yes'), btn('data-answer="0"', t('noquiero'), 'no'));
    }
    if (o.flor) buttons.push(btn('data-call="flor"', t('flor'), 'flor'));
    for (const what of o.envido) {
      const label = what === 'envido' && !r.envido ? t('envido') : raises[what];
      buttons.push(btn(`data-call="${what}"`, label, 'envido'));
    }
    if (o.truco) buttons.push(btn('data-call="truco"', trucoCall(o.truco), 'truco'));
    if (o.mazo) buttons.push(btn('data-call="mazo"', t('mazo'), 'mazo'));
    el.innerHTML = buttons.join('');
  }

  // ---- table talk -------------------------------------------------------------

  /** A big shout over the seat that made the call. */
  function showCall({ seat, what }) {
    const rect = seatEl(seat).getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `shout ${what.startsWith('truco') ? 'truco' : what}`;
    el.textContent = t(what);
    el.style.left = `${Math.min(Math.max(rect.left + rect.width / 2, 90), innerWidth - 90)}px`;
    el.style.top = `${rect.top + rect.height / 2}px`;
    el.addEventListener('animationend', () => el.remove());
    document.body.append(el);
    sound.play(what.startsWith('truco') ? 'truco' : what === 'flor' ? 'flor' : what === 'noquiero' || what === 'mazo' ? 'no' : 'call');
    if (what.startsWith('truco')) buzz([40, 30, 60]);
  }

  function announceTrick(r, prevRound) {
    const finished = (round) => round.tricks.filter((tr) => tr.cards.length === 4).length;
    if (!prevRound || finished(r) <= finished(prevRound)) return;
    const tr = r.tricks[finished(r) - 1];
    if (tr.winnerSeat == null) toast(t('parda'), 1400);
    else toast(tr.winnerSeat === me() ? t('trickToYou') : t('trickTo', { name: seatName(tr.winnerSeat) }), 1400);
  }

  // ---- playing a card ---------------------------------------------------------

  /** You played your first card holding an unsung flor: it's gone, and the table laughs. */
  function forgotFlor() {
    $('toast').classList.remove('show');
    laughAtMe();
  }

  function playCard(key) {
    if (ctx.state.round.options.flor) forgotFlor();
    send({ t: 'play', card: parseKey(key) });
    buzz(15);
  }

  /** Can this hand card be picked up right now? */
  function canDrag(btn) {
    const r = ctx.state?.round;
    if (!r || ctx.state.phase !== 'playing') return false;
    if (r.options.play) return true;
    shake(btn);
    toast(r.options.answer ? t('answerFirst') : t('waitFor', { name: seatName(r.turn) }), 1200);
    return false;
  }

  // ---- cards played by the others ---------------------------------------------

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

  /** Fly a card from the seat that played it to its spot on the table. */
  function flyCard({ seat }) {
    // The trick can be rebuilt mid-flight when another card lands, so look it up each time.
    const slotOf = () => $('trick')?.querySelector(`.slot[data-seat="${seat}"]`);
    const slot = slotOf();
    const face = slot?.querySelector('.card');
    const avatar = seatAvatar(seat);
    if (!face || !avatar || !canFly()) {
      slot?.classList.remove('incoming');
      return sound.play('place');
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
      target: slotOf, // gone if a new trick or hand started mid-flight
      // Match the side slots' slight tilt so the card doesn't snap flat on landing.
      rotation: slot.classList.contains('p1') ? 4 : slot.classList.contains('p3') ? -4 : 0,
      fit: () => [width, height],
      onImpact: (el) => impact(el, seat % 2),
      onDone: () => slotOf()?.classList.remove('incoming'),
    });
  }

  function awardLabel(a) {
    if (a.kind === 'flor' || a.kind === 'reservada') return t(`award.${a.kind}`, { who: `${seatName(a.seat)}: ${a.value}` });
    if (a.kind === 'envido') {
      return a.refused ? t('award.envidoRefused') : t('award.envido', { a: a.value, b: a.rivalValue });
    }
    const call = a.level ? trucoCall(a.level) : t('award.tricks');
    if (a.reason === 'mazo') return t('award.mazo', { call });
    if (a.reason === 'refused') return t('award.refused', { call });
    return t('award.truco', { call });
  }

  $('actions').addEventListener('click', (e) => {
    const el = e.target.closest('[data-call],[data-answer]');
    if (!el) return;
    if (el.dataset.call) send({ t: 'call', what: el.dataset.call });
    else send({ t: 'answer', yes: el.dataset.answer === '1' });
  });

  return {
    handPiece: '.hand-card',
    ghostScale: 1.06,

    mount() {
      $('board').innerHTML = `
        <div class="vira-box" id="viraBox"></div>
        <div class="hand-info" id="handInfo"></div>
        <div class="trick" id="trick"></div>`;
      seenCards.clear();
      trickSig = '';
    },

    unmount() {
      $('actions').innerHTML = '';
    },

    renderBoard(prev) {
      renderActions();
      const r = ctx.state.round;
      if (!r) {
        $('viraBox').innerHTML = $('handInfo').innerHTML = $('trick').innerHTML = '';
        trickSig = '';
        return;
      }
      const { perico, perica } = r.pieces;
      $('viraBox').innerHTML = `
        <span class="card vira">${cardSVG(r.vira)}</span>
        <span class="vira-text"><b>${t('vira')}</b><small>${t('perico')} ${perico[0]}</small><small>${t('perica')} ${perica[0]}</small></span>`;

      const dot = (i) => {
        const tr = r.tricks[i];
        if (!tr || tr.cards.length < 4) return '<i class="pip"></i>';
        return tr.winnerTeam == null ? '<i class="pip tie"></i>' : `<i class="pip won" data-team="${tr.winnerTeam}"></i>`;
      };
      const level = r.truco.level;
      const worth = level === 4 ? t('worthGame') : t('worth', { n: [1, 3, 6, 9][level] });
      $('handInfo').innerHTML = `<span class="pips">${[0, 1, 2].map(dot).join('')}</span><span class="worth ${level ? 'hot' : ''}">${worth}</span>`;

      // Show the current trick, or the one that just ended until a new card lands.
      const idx = r.tricks.length - 1;
      const showing = r.tricks[idx].cards.length || idx === 0 ? idx : idx - 1;
      const trick = r.tricks[showing];
      // Rebuild only when the table changed, so other updates can't cut a card's flight short.
      const sig = JSON.stringify([ctx.state.roundNo, showing, trick, me(), i18n.lang]);
      if (sig === trickSig) return;
      trickSig = sig;
      $('trick').innerHTML = trick.cards
        .map(({ seat, card }) => {
          const key = `${ctx.state.roundNo}:${showing}:${seat}`;
          // No animations on the first state: a reload just shows the table as it is.
          const fresh = !seenCards.has(key) && prev;
          seenCards.add(key);
          // Someone else's card stays hidden until the one in the air lands (see flyCard).
          const motion = isFlying(seat) || (fresh && seat !== me() && canFly()) ? 'incoming' : fresh && seat === me() ? 'fresh' : '';
          const won = trick.cards.length === 4 && trick.winnerSeat === seat;
          return `<span class="slot p${posOf(seat)} ${motion} ${won ? 'won' : ''}" data-team="${seat % 2}" data-seat="${seat}">${cardHTML(card)}</span>`;
        })
        .join('');
    },

    /** What just happened: sound, flights, calls, the catchphrase. */
    feedback(prev) {
      const r = ctx.state.round;
      const sameHand = prev?.roundNo === ctx.state.roundNo;
      const la = r?.lastAction;
      const pla = prev?.round?.lastAction;
      if (la && JSON.stringify(la) !== JSON.stringify(pla) && sameHand) {
        if (la.seat === me()) sound.play('place');
        else flyCard(la);
        if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
      }
      // A new card that didn't take flight (reload, hidden tab) just shows.
      $('trick').querySelectorAll('.slot.incoming').forEach((el) => isFlying(Number(el.dataset.seat)) || el.classList.remove('incoming'));
      if (r?.lastCall && r.lastCall.n !== prev?.round?.lastCall?.n && prev) {
        showCall(r.lastCall);
        if (r.lastCall.phrase) sound.playClip('manguangua');
      }
      if (sameHand && r) whenLanded(() => announceTrick(r, prev.round));
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && (s.round.options.play || s.round.options.answer),

    turnAlert(r) {
      whenLanded(() => r.options.flor && r.hand.length === 3 && toast(t('singFlor'), 2600));
      return true;
    },

    isTurn: (seat) => {
      const r = ctx.state.round;
      return !!r && !r.pending && r.turn === seat;
    },

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      return {
        badge: r?.mano === seat ? `<b class="mano-tag" title="${t('mano')}">M</b>` : '',
        info: pos === 0 ? '' : `<span class="backs">${'<i></i>'.repeat(ctx.state.seats[seat].count)}</span>`,
        bubble: '',
      };
    },

    // ---- the hand -----------------------------------------------------------

    handKeys: (hand) => hand.map(cardKey),

    handPieceHTML(key, dragging) {
      const r = ctx.state.round;
      const canPlay = r.options.play && ctx.state.phase === 'playing';
      const card = parseKey(key);
      const piece = pieceOf(card, r.pieces);
      const cls = ['card hand-card', piece, canPlay ? 'playable' : '', dragging ? 'dragging' : ''].join(' ');
      const badge = piece ? `<em class="badge">${t(piece)}</em>` : '';
      return `<button class="${cls}" data-key="${key}" aria-label="${t('aria.card', { n: card[0], suit: card[1] })}">${cardSVG(card)}${badge}</button>`;
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
          if (!r.options.play) toast(r.options.answer ? t('answerFirst') : t('waitFor', { name: seatName(r.turn) }), 1200);
        }
      };
    },

    /** A status line for when "your turn" / "their turn" isn't the whole story. */
    status(r) {
      if (!r.pending) return null;
      const name = seatName(r.pending.by);
      if (!r.options.answer) return { cls: '', text: t('youWaitAnswer') };
      return {
        cls: 'mine',
        text:
          r.pending.kind === 'envido'
            ? t('envidoPending', { name, stake: r.envido.falta ? t('faltaStake') : r.envido.stake })
            : t('trucoPending', { name, call: trucoCall(r.pending.level) }),
      };
    },

    // ---- results ------------------------------------------------------------

    resultDelay(prev) {
      const la = ctx.state.round.lastAction;
      const thrown = la && la.seat !== me() && JSON.stringify(la) !== JSON.stringify(prev.round?.lastAction);
      return thrown ? FLIGHT_MS + 800 : 1600;
    },

    result() {
      const r = ctx.state.round;
      const awards = r.awards ?? [];
      const gained = [gainedBy(awards, 0), gainedBy(awards, 1)];
      return {
        winTeam: gained[0] === gained[1] ? r.over.team : gained[0] > gained[1] ? 0 : 1,
        gained,
        emoji: '🃏',
        sub: '',
        lastRound: null,
        tie: null,
        details: awards
          .map((a) => `<div class="ra" data-team="${a.team}"><span>${esc(awardLabel(a))}</span><b>${teamLabel(a.team)} +${a.points}</b></div>`)
          .join(''),
      };
    },

    resultHand: (hand) => `<span class="rh-cards">${hand.map((c) => cardHTML(c, 'mini')).join('')}</span>`,

    historyRow(h) {
      const cell = (team) => {
        const n = gainedBy(h.awards, team);
        return n ? `+${n}` : '·';
      };
      return { cell, how: h.awards.map((a) => esc(awardLabel(a))).join(' · ') };
    },
  };
}
