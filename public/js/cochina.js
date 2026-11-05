// The roba la cochina table: the loose cards, each team's cochina, steals, and how a round reads.
import { cardSVG, cardKey, parseKey } from './cards.js';
import { canFly, FLIGHT_MS, isFlying, launch, whenLanded } from './flight.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const SWEEP_DELAY_MS = 450; // how long a capture stays on the table before it leaves
const SWEEP_MS = 450;

export function createView(ctx) {
  const { $, esc, me, seatName, seatEl, seatAvatar, toast, buzz, shake, send, within, teamLabel } = ctx;
  let tableSig = '';
  let pilesSig = '';
  let sweep = null; // a capture still on the table: { before, piles, tops, taken, played, seat, steals }
  let sweepTimer;

  const cardHTML = (card, cls = '') => `<span class="card ${cls}">${cardSVG(card)}</span>`;
  const myTeamNow = () => (me() === -1 ? 0 : me() % 2);

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

  function showSteal({ seat, stolen }) {
    shout(seat, `${t('stole')} +${stolen}`, 'cochina');
    sound.play('oink');
    buzz([40, 30, 60]);
  }

  // ---- playing a card ---------------------------------------------------------

  function playCard(key) {
    send({ t: 'play', card: parseKey(key) });
    buzz(15);
  }

  const waitToast = (r) => toast(t('waitFor', { name: seatName(r.turn) }), 1200);

  function canDrag(btn) {
    const r = ctx.state?.round;
    if (!r || ctx.state.phase !== 'playing') return false;
    if (r.options.play) return true;
    shake(btn);
    waitToast(r);
    return false;
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

  /** What's drawn: the table, or the table as it was while a capture is still on it. */
  function tableItems(r) {
    if (sweep) {
      const taken = new Set(sweep.taken.map(cardKey));
      return [
        ...sweep.before.map((card) => ({ card, taken: taken.has(cardKey(card)) })),
        { card: sweep.played, taken: true },
      ];
    }
    return r.table.map((card) => ({ card }));
  }

  function paintTable(r, la, isNew) {
    const items = tableItems(r);
    const sig = JSON.stringify([ctx.state.roundNo, items, i18n.lang]);
    if (sig === tableSig) return;
    tableSig = sig;
    $('loose').innerHTML = items
      .map(({ card, taken }) => {
        const key = cardKey(card);
        const justPlayed = la && cardKey(la.card) === key;
        const flying = justPlayed && (isFlying(la.seat) || (isNew && la.seat !== me() && canFly()));
        const motion = flying ? 'incoming' : justPlayed && isNew ? 'fresh' : '';
        const team = la ? la.seat % 2 : 0;
        return `<span class="loose-item ${motion} ${taken ? 'taken' : ''}" data-key="${key}" data-team="${team}">${cardHTML(card)}</span>`;
      })
      .join('');
  }

  /** Our cochina on the left, theirs on the right: the top card and how many under it. */
  function paintPiles(r) {
    const piles = sweep?.piles ?? r.piles;
    const tops = sweep?.tops ?? r.tops;
    const sig = JSON.stringify([piles, tops, me(), i18n.lang]);
    if (sig === pilesSig) return;
    pilesSig = sig;
    const team = myTeamNow();
    $('cochinas').innerHTML = [team, 1 - team]
      .map((tm) => {
        const top = tops[tm];
        const stack = Math.min(piles[tm], 4); // a few edges peeking out under the top card
        const edges = top ? '<i class="edge"></i>'.repeat(Math.max(stack - 1, 0)) : '';
        const face = top ? cardHTML(top) : '<span class="card place"></span>';
        return `<div class="cochina" data-team="${tm}" data-pile="${tm}">
          <span class="pile">${edges}${face}</span>
          <span class="pile-info"><small>${esc(teamLabel(tm))}</small><b>${piles[tm]}</b></span>
        </div>`;
      })
      .join('');
  }

  function endSweep() {
    clearTimeout(sweepTimer);
    sweep = null;
  }

  const pileEl = (team) => $('cochinas')?.querySelector(`[data-pile="${team}"] .pile`);

  function glide(el, to) {
    const from = el.getBoundingClientRect();
    const dx = to.left + to.width / 2 - from.left - from.width / 2;
    const dy = to.top + to.height / 2 - from.top - from.height / 2;
    el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.3 }], {
      duration: SWEEP_MS,
      easing: 'ease-in',
      fill: 'forwards',
    });
  }

  /** The captured cards, and a stolen cochina, slide onto the team's cochina. */
  function startSweep(seat) {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => {
      if (!sweep) return;
      const team = seat % 2;
      const to = pileEl(team)?.getBoundingClientRect();
      if (to) {
        for (const el of $('loose').querySelectorAll('.loose-item.taken')) glide(el, to);
        if (sweep.steals) {
          const theirs = pileEl(1 - team);
          if (theirs) glide(theirs, to);
        }
      }
      sweepTimer = setTimeout(() => {
        endSweep();
        const r = ctx.state.round;
        if (r) {
          paintTable(r, r.lastAction, false);
          paintPiles(r);
        }
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

  // ---- results ------------------------------------------------------------------

  /** "Cochina 22 to 14", the winner's count first. */
  const cardsLine = (cards, team) => t('award.cards', { a: cards[team ?? 0], b: cards[1 - (team ?? 0)] });

  return {
    handPiece: '.hand-card',
    ghostScale: 1.06,

    mount() {
      $('board').innerHTML = `
        <div class="deal-info" id="dealInfo"></div>
        <div class="loose" id="loose"></div>
        <div class="cochinas" id="cochinas"></div>`;
      tableSig = pilesSig = '';
      endSweep();
    },

    unmount() {
      endSweep();
    },

    renderBoard(prev) {
      const r = ctx.state.round;
      if (!r) {
        endSweep();
        $('dealInfo').innerHTML = $('loose').innerHTML = $('cochinas').innerHTML = '';
        tableSig = pilesSig = '';
        return;
      }
      const sameRound = prev?.roundNo === ctx.state.roundNo;
      if (!sameRound) endSweep();
      const pips = [1, 2, 3].map((n) => `<i class="pip ${n <= r.deal ? 'tie' : ''}"></i>`).join('');
      const team = myTeamNow();
      $('dealInfo').innerHTML = `
        <span class="deal-pips"><span class="pips">${pips}</span><small>${t('dealOf', { n: r.deal })}</small></span>
        <span class="piles"><small>${t('steals')}</small> <b data-team="${team}">${r.steals[team]}</b> · <b data-team="${1 - team}">${r.steals[1 - team]}</b></span>`;

      const la = r.lastAction;
      const isNew = !!la && sameRound && la.n !== prev?.round?.lastAction?.n;
      if (isNew) {
        endSweep();
        if ((la.taken.length || la.steals) && canFly()) {
          sweep = {
            before: prev.round.table,
            piles: prev.round.piles,
            tops: prev.round.tops,
            taken: la.taken,
            played: la.card,
            seat: la.seat,
            steals: la.steals,
          };
        }
      }
      paintTable(r, la, isNew);
      paintPiles(r);
    },

    /** What just happened: sound, flights, the steal, the catchphrase. */
    feedback(prev) {
      const r = ctx.state.round;
      const la = r?.lastAction;
      if (!la || prev?.roundNo !== ctx.state.roundNo || la.n === prev?.round?.lastAction?.n) return;
      const landed = () => {
        if (sweep) startSweep(la.seat);
        if (la.steals) showSteal(la);
      };
      if (la.seat === me()) {
        sound.play('place');
        landed();
      } else flyCard(la, landed);
      if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && s.round.options.play,

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

    status: () => null,

    resultDelay(prev) {
      const la = ctx.state.round.lastAction;
      const thrown = la && la.seat !== me() && la.n !== prev.round?.lastAction?.n;
      return (thrown ? FLIGHT_MS : 0) + SWEEP_DELAY_MS + SWEEP_MS + 800;
    },

    result() {
      const { over, steals, leftovers, lastCapture } = ctx.state.round;
      const { team, cards } = over;
      const row = (text, tm, value) => `<div class="ra" data-team="${tm}"><span>${esc(text)}</span><b>${value}</b></div>`;
      const details = [0, 1]
        .map((tm) => row(t('cochinaOf', { team: teamLabel(tm) }), tm, cards[tm]))
        .concat([0, 1].filter((tm) => steals[tm]).map((tm) => row(t('stealsOf', { team: teamLabel(tm) }), tm, steals[tm])));
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
