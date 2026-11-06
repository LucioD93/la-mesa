// The roba la cochina table: the loose cards, each team's cochina, grabbing them, and how a round reads.
import { cardSVG, cardKey, parseKey, sameCard } from './cards.js';
import { canFly, FLIGHT_MS, isFlying, launch, whenLanded } from './flight.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const GLIDE_MS = 380; // a grabbed card sliding onto the cochina

export function createView(ctx) {
  const { $, esc, me, seatName, seatEl, seatAvatar, toast, buzz, shake, send, laughAtMe, within, teamLabel } = ctx;
  let active = false;
  let tableSig = '';
  let pilesSig = '';
  let barFor = null; // the grab window the countdown bar is showing
  let sent = new Set(); // grabs sent and not answered yet, so a double tap sends one
  let sentAt = null; // the moment those were sent in

  const cardHTML = (card, cls = '') => `<span class="card ${cls}">${cardSVG(card)}</span>`;
  const myTeamNow = () => (me() === -1 ? 0 : me() % 2);
  const myGrab = () => ctx.state?.phase === 'playing' && !!ctx.state.round?.options.grab;
  /** In your own window, the number you can grab and the card you played; otherwise null. */
  const grabbing = (r) => (myGrab() ? r.grab : null);

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

  // ---- playing a card ---------------------------------------------------------

  function playCard(key) {
    send({ t: 'play', card: parseKey(key) });
    buzz(15);
  }

  function waitToast(r) {
    if (r.options.grab) toast(t('grabFirst'), 1200);
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

  // ---- grabbing ---------------------------------------------------------------

  /** A tap on the table during your window: the right card or cochina is yours, anything else is laughed at. */
  function tapBoard(target) {
    if (!myGrab()) return;
    const r = ctx.state.round;
    const n = r.grab.card[0];
    const theirs = 1 - myTeamNow();
    const item = target.closest('.loose-item');
    const pile = target.closest('.cochina');
    if (item) {
      const card = parseKey(item.dataset.key);
      if (sameCard(card, r.grab.card)) return; // your own card comes along by itself
      if (card[0] !== n) return miss(item);
      if (sent.has(item.dataset.key)) return;
      sent.add(item.dataset.key);
      send({ t: 'grab', card });
    } else if (pile) {
      if (Number(pile.dataset.pile) !== theirs || r.tops[theirs]?.[0] !== n) return miss(pile);
      if (sent.has('pile')) return;
      sent.add('pile');
      send({ t: 'grab', pile: true });
    } else return;
    buzz(12);
  }

  function miss(el) {
    shake(el);
    laughAtMe();
  }

  $('board').addEventListener('pointerdown', (e) => active && e.button === 0 && tapBoard(e.target));
  // Keyboard users press the card or cochina (pointer clicks have a detail).
  $('board').addEventListener('click', (e) => active && e.detail === 0 && tapBoard(e.target));

  /** The countdown of the open window, for everyone at the table. */
  function paintBar(r) {
    const bar = $('grabBar');
    const g = r.grab;
    $('board').classList.toggle('grab-me', myGrab());
    if (!g) {
      barFor = null;
      bar.hidden = true;
      return;
    }
    if (barFor === g.n) return;
    barFor = g.n;
    bar.hidden = false;
    bar.dataset.team = g.seat % 2;
    bar.innerHTML = `<i style="animation-duration: ${g.left}ms"></i>`;
  }

  // ---- the loose cards and the cochinas ------------------------------------------

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

  function paintTable(r, la, isNew) {
    const g = grabbing(r);
    const sig = JSON.stringify([ctx.state.roundNo, r.table, la?.n, g?.n, i18n.lang]);
    if (sig === tableSig) return;
    tableSig = sig;
    const played = la?.type === 'play' ? la : null;
    $('loose').innerHTML = r.table
      .map((card) => {
        const key = cardKey(card);
        const justPlayed = played && cardKey(played.card) === key;
        const flying = justPlayed && (isFlying(played.seat) || (isNew && played.seat !== me() && canFly()));
        const motion = flying ? 'incoming' : justPlayed && isNew ? 'fresh' : '';
        const label = t('aria.card', { n: card[0], suit: card[1] });
        const glow = g && card[0] === g.card[0] && !sameCard(card, g.card) ? 'grabbable' : '';
        return `<button type="button" class="loose-item ${motion} ${glow}" data-key="${key}" data-team="${la ? la.seat % 2 : 0}" aria-label="${label}">${cardHTML(card)}</button>`;
      })
      .join('');
  }

  /** Our cochina on the left, theirs on the right: the top card and how many under it. */
  function paintPiles(r) {
    const g = grabbing(r);
    const sig = JSON.stringify([r.piles, r.tops, me(), g?.n, i18n.lang]);
    if (sig === pilesSig) return;
    pilesSig = sig;
    const team = myTeamNow();
    $('cochinas').innerHTML = [team, 1 - team]
      .map((tm) => {
        const top = r.tops[tm];
        const stack = Math.min(r.piles[tm], 4); // a few edges peeking out under the top card
        const edges = top ? '<i class="edge"></i>'.repeat(Math.max(stack - 1, 0)) : '';
        const face = top ? cardHTML(top) : '<span class="card place"></span>';
        const label = t('aria.cochina', { team: teamLabel(tm), n: r.piles[tm] });
        const glow = g && tm !== team && top?.[0] === g.card[0] ? 'grabbable' : '';
        return `<button type="button" class="cochina ${glow}" data-team="${tm}" data-pile="${tm}" aria-label="${esc(label)}">
          <span class="pile">${edges}${face}</span>
          <span class="pile-info"><small>${esc(teamLabel(tm))}</small><b>${r.piles[tm]}</b></span>
        </button>`;
      })
      .join('');
  }

  const pileEl = (team) => $('cochinas')?.querySelector(`[data-pile="${team}"] .pile`);

  /** Copies of what a grab takes, where it was, to slide onto the cochina once the table is repainted. */
  function lift(la, prev) {
    if (!canFly()) return [];
    const keys = la.cards.map(cardKey);
    if (la.first && prev.round?.grab) keys.push(cardKey(prev.round.grab.card));
    const els = keys.map((key) => $('loose').querySelector(`[data-key="${key}"] .card`));
    if (la.stolen) els.push(pileEl(1 - (la.seat % 2)));
    return els.filter(Boolean).map((el) => ({ node: el.cloneNode(true), rect: el.getBoundingClientRect() }));
  }

  function glide(lifted, team) {
    const to = pileEl(team)?.getBoundingClientRect();
    if (!to) return;
    for (const { node, rect } of lifted) {
      Object.assign(node.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: 0, zIndex: 40, pointerEvents: 'none' });
      document.body.append(node);
      const dx = to.left + to.width / 2 - rect.left - rect.width / 2;
      const dy = to.top + to.height / 2 - rect.top - rect.height / 2;
      node
        .animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) rotate(-6deg)` }], { duration: GLIDE_MS, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' })
        .finished.finally(() => node.remove());
    }
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

  // ---- results ------------------------------------------------------------------

  /** "Cochina 22 to 14", the winner's count first. */
  const cardsLine = (cards, team) => t('award.cards', { a: cards[team ?? 0], b: cards[1 - (team ?? 0)] });

  return {
    handPiece: '.hand-card',
    ghostScale: 1.06,

    mount() {
      $('board').innerHTML = `
        <div class="deal-info" id="dealInfo"></div>
        <div class="grab-bar" id="grabBar" hidden></div>
        <div class="loose" id="loose"></div>
        <div class="cochinas" id="cochinas"></div>`;
      tableSig = pilesSig = '';
      barFor = null;
      active = true;
    },

    unmount() {
      active = false;
      $('board').classList.remove('grab-me');
    },

    renderBoard(prev) {
      const r = ctx.state.round;
      if (r?.lastAction?.n !== sentAt) {
        sent = new Set();
        sentAt = r?.lastAction?.n;
      }
      if (!r) {
        $('dealInfo').innerHTML = $('loose').innerHTML = $('cochinas').innerHTML = '';
        tableSig = pilesSig = '';
        paintBar({ grab: null });
        return;
      }
      const sameRound = prev?.roundNo === ctx.state.roundNo;
      const pips = [1, 2, 3].map((n) => `<i class="pip ${n <= r.deal ? 'tie' : ''}"></i>`).join('');
      const team = myTeamNow();
      $('dealInfo').innerHTML = `
        <span class="deal-pips"><span class="pips">${pips}</span><small>${t('dealOf', { n: r.deal })}</small></span>
        <span class="piles"><small>${t('steals')}</small> <b data-team="${team}">${r.steals[team]}</b> · <b data-team="${1 - team}">${r.steals[1 - team]}</b></span>`;

      const la = r.lastAction;
      const isNew = !!la && sameRound && la.n !== prev?.round?.lastAction?.n;
      const lifted = isNew && la.type === 'grab' ? lift(la, prev) : [];
      paintTable(r, la, isNew);
      paintPiles(r);
      paintBar(r);
      if (lifted.length) glide(lifted, la.seat % 2);
    },

    /** What just happened: sound, flights, grabs, steals, the catchphrase. */
    feedback(prev) {
      const r = ctx.state.round;
      const la = r?.lastAction;
      if (!la || prev?.roundNo !== ctx.state.roundNo || la.n === prev?.round?.lastAction?.n) return;
      if (la.type === 'play') {
        if (la.seat === me()) sound.play('place');
        else flyCard(la, () => {});
        if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
      } else if (la.type === 'grab') {
        sound.play('grab');
        if (la.stolen) {
          shout(la.seat, `${t('stole')} +${la.stolen}`, 'cochina');
          sound.play('oink');
          buzz([40, 30, 60]);
        }
      } else if (la.type === 'close' && la.missed) {
        shout(la.seat, t('tooSlow'), 'slow');
        sound.play('no');
      }
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && (s.round.options.play || s.round.options.grab),

    turnAlert: () => true,

    isTurn: (seat) => ctx.state.round?.turn === seat,

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      return {
        badge: r?.dealer === seat ? `<b class="mano-tag" title="${t('dealer')}">${t('dealerTag')}</b>` : '',
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
      const cls = ['card hand-card', canPlay ? 'playable' : '', dragging ? 'dragging' : ''].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-label="${t('aria.card', { n: card[0], suit: card[1] })}">${cardSVG(card)}</button>`;
    },

    // Keyboard users press the card instead of dragging it (pointer clicks have a detail).
    handClick(e) {
      const btn = e.target.closest('.hand-card');
      if (btn && e.detail === 0 && canDrag(btn)) playCard(btn.dataset.key);
    },

    dressGhost(ghost) {
      ghost.className = `${ghost.className.replace('playable', '')} drag-ghost`;
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

    /** While a window is open, the status says who has to be quick. */
    status(r) {
      if (!r.grab) return null;
      return r.options.grab ? { cls: 'mine', text: t('grabNow') } : { cls: '', text: t('grabbing', { name: seatName(r.grab.seat) }) };
    },

    resultDelay(prev) {
      const la = ctx.state.round.lastAction;
      const thrown = la?.type === 'play' && la.seat !== me() && la.n !== prev.round?.lastAction?.n;
      return (thrown ? FLIGHT_MS : 0) + GLIDE_MS + 800;
    },

    result() {
      const { over, steals, missed, leftovers, lastCapture } = ctx.state.round;
      const { team, cards } = over;
      const row = (text, tm, value) => `<div class="ra" data-team="${tm}"><span>${esc(text)}</span><b>${value}</b></div>`;
      const details = [0, 1]
        .map((tm) => row(t('cochinaOf', { team: teamLabel(tm) }), tm, cards[tm]))
        .concat([0, 1].filter((tm) => steals[tm]).map((tm) => row(t('stealsOf', { team: teamLabel(tm) }), tm, steals[tm])))
        .concat([0, 1].filter((tm) => missed[tm]).map((tm) => row(t('missedOf', { team: teamLabel(tm) }), tm, missed[tm])));
      if (leftovers && lastCapture !== null) details.push(row(t('leftovers', { n: leftovers }), lastCapture % 2, `+${leftovers}`));
      return {
        winTeam: team ?? 0,
        gained: [team === 0 ? 1 : 0, team === 1 ? 1 : 0],
        emoji: '🐷',
        sub: cardsLine(cards, team),
        lastRound: cardsLine(cards, team),
        tie: team === null ? { title: t('tieTitle'), sub: t('tieSub', { n: cards[0] }) } : null,
        details: details.join(''),
      };
    },

    historyRow(h) {
      return { cell: (team) => (h.team === team ? '+1' : '·'), how: esc(cardsLine(h.cards, h.team)) };
    },
  };
}
