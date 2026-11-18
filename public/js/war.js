// The war table: each seat's cards in the middle, the two piles of cards taken, and your
// deck face down where a hand would be. Nobody chooses a card: you tap (or drag) the deck
// to turn the top one, all four at once, and the highest takes the battle.
import { cardName, cardSVG } from './french.js';
import { canFly, isFlying, launch, whenLanded } from './flight.js';
import { roundTable } from './deal.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

const GLIDE_MS = 420; // a battle's cards sliding onto the pile of the team that took them

export function createView(ctx) {
  const { $, esc, me, posOf, seatName, seatEl, seatAvatar, toast, buzz, shake, send, within, teamLabel } = ctx;
  let fieldSig = '';
  let pilesSig = '';
  let seen = new Set(); // cards already shown on the table, so only new ones animate
  let flights = []; // other seats' cards just turned, to throw from their seats
  let sentAt = null; // the deck size when we last turned, so a double tap sends one

  const myTeamNow = () => (me() === -1 ? 0 : me() % 2);
  const cardHTML = (card) => (card ? `<span class="card">${cardSVG(card)}</span>` : '<span class="card back"></span>');
  const canFlip = () => ctx.state?.phase === 'playing' && !!ctx.state.round?.options.flip;
  const names = (seats) => new Intl.ListFormat(i18n.lang, { type: 'conjunction' }).format(seats.map(seatName));

  // ---- turning a card ---------------------------------------------------------

  function flip(el) {
    const r = ctx.state.round;
    if (!canFlip()) {
      if (el) shake(el);
      if (r.result || r.over) return;
      if (r.fighting.includes(me())) toast(t('waitOthers'), 1200);
      else if (r.war) toast(t('notInWar'), 1400);
      return;
    }
    if (sentAt === r.hand) return;
    sentAt = r.hand;
    send({ t: 'flip' });
    buzz(15);
  }

  // ---- table talk -------------------------------------------------------------

  /** A big shout at a point on the screen. */
  function shoutAt(x, y, text, cls) {
    const el = document.createElement('span');
    el.className = `shout ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(x, 90), innerWidth - 90)}px`;
    el.style.top = `${y}px`;
    el.addEventListener('animationend', () => el.remove());
    document.body.append(el);
  }

  const shoutOver = (el, text, cls) => {
    const rect = el.getBoundingClientRect();
    shoutAt(rect.left + rect.width / 2, rect.top + rect.height / 2, text, cls);
  };

  // ---- the battle -------------------------------------------------------------

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
  }

  /** Each seat's cards in front of it, earlier ones further out; the winner's glows. */
  function paintField(r, animate) {
    const sig = JSON.stringify([ctx.state.roundNo, r.battles, r.table, r.result, me()]);
    if (sig === fieldSig) return;
    fieldSig = sig;
    $('warField').innerHTML = r.table
      .flatMap((stack, seat) => {
        const lastUp = stack.findLastIndex(Boolean);
        return stack.map((card, i) => {
          const key = `${ctx.state.roundNo}:${r.battles}:${seat}:${i}`;
          const fresh = animate && !seen.has(key);
          seen.add(key);
          // Someone else's card stays hidden while it flies in from their seat.
          const thrown = fresh && card && seat !== me() && canFly();
          if (thrown) flights.push({ seat, key });
          const inAir = thrown || (isFlying(seat) && i === lastUp);
          const motion = inAir ? 'incoming' : fresh ? 'fresh' : '';
          const won = r.result?.seat === seat && i === lastUp;
          const cls = ['slot', `p${posOf(seat)}`, motion, won ? 'won' : '', i < lastUp ? 'past' : ''].join(' ');
          const label = card ? cardName(card) : t('faceDown');
          return `<span class="${cls}" style="--i: ${i}" data-team="${seat % 2}" data-seat="${seat}" data-slot="${key}" aria-label="${esc(label)}">${cardHTML(card)}</span>`;
        });
      })
      .join('');
  }

  /** Throw a card just turned from its player's seat to its place. */
  function flyCard({ seat, key }) {
    const slotOf = () => $('warField')?.querySelector(`[data-slot="${key}"]`); // gone once the battle is taken
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
      target: slotOf,
      fit: () => [width, height],
      onImpact: (el) => impact(el, seat % 2),
      onDone: () => slotOf()?.classList.remove('incoming'),
    });
  }

  // ---- the piles --------------------------------------------------------------

  /** Our pile on the left, theirs on the right: face down, and how many. */
  function paintPiles(r) {
    const sig = JSON.stringify([r.won, me(), i18n.lang, ctx.state.teamNames]);
    if (sig === pilesSig) return;
    pilesSig = sig;
    const team = myTeamNow();
    $('warPiles').innerHTML = [team, 1 - team]
      .map((tm) => {
        const n = r.won[tm];
        const edges = '<i class="edge"></i>'.repeat(Math.min(Math.max(n - 1, 0), 3));
        const face = n ? '<span class="card back"></span>' : '<span class="card place"></span>';
        return `<div class="cochina" data-team="${tm}" data-pile="${tm}" role="img" aria-label="${esc(t('aria.pile', { team: teamLabel(tm), n }))}">
          <span class="pile">${edges}${face}</span>
          <span class="pile-info"><small>${esc(teamLabel(tm))}</small><b>${n}</b></span>
        </div>`;
      })
      .join('');
  }

  const pileEl = (team) => $('warPiles')?.querySelector(`[data-pile="${team}"] .pile`);

  /** Copies of the battle's cards, where they lie, to slide onto a pile once the table is cleared. */
  function lift() {
    if (!canFly()) return [];
    return [...$('warField').querySelectorAll('.slot .card')].map((el) => ({ node: el.cloneNode(true), rect: el.getBoundingClientRect() }));
  }

  function glide(lifted, team) {
    const to = team === null ? null : pileEl(team)?.getBoundingClientRect();
    lifted.forEach(({ node, rect }, i) => {
      Object.assign(node.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: 0, zIndex: 40, pointerEvents: 'none' });
      document.body.append(node);
      // A war nobody finished just fades away.
      const end = to
        ? { transform: `translate(${to.left + to.width / 2 - rect.left - rect.width / 2}px, ${to.top + to.height / 2 - rect.top - rect.height / 2}px) scale(${to.width / rect.width}) rotate(-6deg)` }
        : { transform: 'scale(0.6)', opacity: 0 };
      node.animate([{ transform: 'none' }, end], { duration: GLIDE_MS, delay: i * 25, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' }).finished.finally(() => node.remove());
    });
  }

  // ---- results ------------------------------------------------------------------

  /** "Cards 30 to 22", the winner's count first. */
  const cardsLine = (cards, team) => t('award.cards', { a: cards[team ?? 0], b: cards[1 - (team ?? 0)] });

  return {
    handPiece: '.war-deck',
    ghostScale: 1.04,

    mount() {
      $('board').innerHTML = `
        <div class="deal-info" id="warInfo"></div>
        <div class="war-field" id="warField"></div>
        <div class="cochinas war-piles" id="warPiles"></div>`;
      fieldSig = pilesSig = '';
      seen = new Set();
      flights = [];
    },

    unmount() {
      flights = [];
    },

    renderBoard(prev) {
      const r = ctx.state.round;
      if (!r) {
        $('warInfo').innerHTML = $('warField').innerHTML = $('warPiles').innerHTML = '';
        fieldSig = pilesSig = '';
        return;
      }
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      const la = r.lastAction;
      const taken = sameRound && la?.type === 'collect' && la.n !== prev.round.lastAction?.n;
      const lifted = taken ? lift() : [];
      const team = myTeamNow();
      const war = r.war ? `<b class="war-tag">${t('guerra')}${r.war > 1 ? ` ×${r.war}` : ''}</b>` : `<small>${t('battle', { n: r.battles + (r.over ? 0 : 1) })}</small>`;
      $('warInfo').innerHTML = `
        <span class="deal-pips">${war}</span>
        <span class="piles"><small>${t('wars')}</small> <b data-team="${team}">${r.wars[team]}</b> · <b data-team="${1 - team}">${r.wars[1 - team]}</b></span>`;
      // No animations on the first state: a reload just shows the table as it is.
      paintField(r, !!prev);
      paintPiles(r);
      if (lifted.length) glide(lifted, la.team);
    },

    /** What just happened: the deal, cards flying in, wars, who takes the battle. */
    feedback(prev) {
      const r = ctx.state.round;
      const sameRound = prev?.roundNo === ctx.state.roundNo && !!prev.round;
      const la = r?.lastAction;
      if (prev && r && !la && !sameRound && ctx.state.phase === 'playing') {
        // The deck riffled, then thirteen each round the table; all of yours go to your deck.
        const drops = roundTable({ first: (r.dealer + 1) % 4, each: 13, me: me(), mine: Array(13).fill('deck') });
        ctx.deal.start({ mix: 'cards', drops });
      }
      const queued = flights;
      flights = [];
      if (!sameRound) return;
      queued.forEach(flyCard);
      // A card that didn't take flight (hidden tab) just shows.
      $('warField').querySelectorAll('.slot.incoming').forEach((el) => isFlying(Number(el.dataset.seat)) || queued.some((f) => f.key === el.dataset.slot) || el.classList.remove('incoming'));
      if (!la || la.n === prev.round.lastAction?.n) return;
      if (la.type === 'flip' && la.seat === me()) sound.play('place');
      if (la.phrase) whenLanded(() => sound.playClip('manguangua'));
      if (la.type === 'war') {
        whenLanded(() => {
          const b = $('board').getBoundingClientRect();
          shoutAt(b.left + b.width / 2, b.top + b.height * 0.46, la.war > 1 ? `${t('guerra')} ×${la.war}` : t('guerra'), 'guerra');
          sound.play('truco');
          buzz(la.seats.includes(me()) ? [60, 40, 120] : 40);
        });
      } else if (la.type === 'win') {
        whenLanded(() => {
          if (la.team === null) return sound.play('no');
          sound.play(la.team === myTeamNow() && me() !== -1 ? 'score' : 'call');
          if (la.war) shoutOver(seatEl(la.seat), `+${la.cards}`, 'guerra');
        });
      } else if (la.type === 'collect') sound.play('grab');
    },

    canAct: (s) => !!s?.round && s.phase === 'playing' && s.round.options.flip,

    // Every battle would beep; only a war, where the others wait on you, calls for it.
    turnAlert: (r) => r.war > 0,

    isTurn: (seat) => {
      const r = ctx.state.round;
      return !!r && !r.result && r.toFlip.includes(seat);
    },

    // ---- seats --------------------------------------------------------------

    seatParts(seat, pos) {
      const r = ctx.state.round;
      const n = ctx.state.seats[seat].count;
      return {
        badge: '',
        info: pos === 0 || !r ? '' : `<span class="count" title="${t('cardsLeft')}"><i class="mini-back"></i>${n}</span>`,
        bubble: '',
      };
    },

    // ---- the deck, where a hand would be ---------------------------------------------

    handKeys: (n) => (n ? ['deck'] : []),

    handPieceHTML(key, dragging) {
      const n = ctx.state.round.hand;
      const ready = canFlip();
      const edges = '<i class="edge"></i>'.repeat(Math.min(n - 1, 3));
      const cls = ['war-deck', ready ? 'ready' : '', dragging ? 'dragging' : ''].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-label="${esc(t('aria.deck', { n }))}">
        <span class="pile">${edges}<span class="card back"></span></span>
        <span class="deck-info"><b>${n}</b><small>${ready ? t(ctx.state.round.war ? 'warFlip' : 'tapToFlip') : t('cardsLeft')}</small></span>
      </button>`;
    },

    // Keyboard users press the deck (pointer clicks have a detail).
    handClick(e) {
      const btn = e.target.closest('.war-deck');
      if (btn && e.detail === 0) flip(btn);
    },

    dressGhost(ghost) {
      ghost.classList.remove('ready', 'dragging');
      ghost.classList.add('drag-ghost');
    },

    dragOver(key, x, y) {
      $('board').classList.toggle('drop-hover', canFlip() && within('board', x, y));
    },

    dragClear() {
      $('board').classList.remove('drop-hover');
    },

    /** A tap on the deck turns a card, and so does dragging it onto the table. */
    drop({ btn, x, y, tapped, dropped, rearranged }) {
      const onBoard = dropped && !rearranged && within('board', x, y);
      return () => {
        if (tapped || onBoard) flip(btn);
      };
    },

    status(r) {
      if (r.result) {
        if (r.result.team === null) return { cls: '', text: t('nobodyTakes') };
        return { cls: '', text: r.result.seat === me() ? t('youTake', { n: r.result.cards }) : t('takes', { name: seatName(r.result.seat), n: r.result.cards }) };
      }
      if (r.options.flip) return { cls: 'mine', text: t(r.war ? 'warPrompt' : 'flipPrompt') };
      const waiting = r.toFlip.filter((s) => s !== me());
      if (r.war) return { cls: '', text: t('warOn', { names: names(r.fighting) }) };
      if (me() !== -1 && !r.fighting.includes(me())) return { cls: '', text: t('outOfCards') };
      return { cls: '', text: t('waitingOn', { names: names(waiting) }) };
    },

    resultDelay: () => GLIDE_MS + 900,

    result() {
      const { over, wars, lost } = ctx.state.round;
      const { team, cards } = over;
      const row = (text, tm, value) => `<div class="ra" data-team="${tm}"><span>${esc(text)}</span><b>${value}</b></div>`;
      const details = [0, 1]
        .map((tm) => row(t('pileOf', { team: teamLabel(tm) }), tm, cards[tm]))
        .concat([0, 1].filter((tm) => wars[tm]).map((tm) => row(t('warsOf', { team: teamLabel(tm) }), tm, wars[tm])));
      if (lost) details.push(`<div class="ra"><span>${esc(t('lost', { n: lost }))}</span><b>${lost}</b></div>`);
      return {
        winTeam: team ?? 0,
        gained: [team === 0 ? 1 : 0, team === 1 ? 1 : 0],
        emoji: '⚔️',
        sub: cardsLine(cards, team),
        lastRound: cardsLine(cards, team),
        tie: team === null ? { title: t('tieTitle'), sub: t('tieSub', { n: cards[0] }) } : null,
        details: details.join(''),
      };
    },

    historyRow(h) {
      const wars = h.wars[0] + h.wars[1];
      return { cell: (team) => (h.team === team ? '+1' : '·'), how: esc(cardsLine(h.cards, h.team) + (wars ? ` · ${t('warsN', { n: wars })}` : '')) };
    },
  };
}
