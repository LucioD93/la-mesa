// The All Fives table: the domino table, plus what the ends add up to, the points each
// play scores, and a round that reads as points rather than pips.
import { createView as createDominoView } from './domino.js';
import { whenLanded } from './flight.js';
import * as sound from './sound.js';
import { t } from './i18n.js';

const endValue = (tile, half) => (tile[0] === tile[1] ? 2 : 1) * half;

/** What the open ends add up to, as server/games/fives.js counts them. */
function endsCount({ line, up = [], down = [] }) {
  if (!line.length) return 0;
  if (line.length === 1) return line[0][0] + line[0][1];
  let n = endValue(line[0], line[0][0]) + endValue(line[line.length - 1], line[line.length - 1][1]);
  for (const arm of [up, down]) if (arm.length) n += endValue(arm[arm.length - 1], arm[arm.length - 1][1]);
  return n;
}

export function createView(ctx) {
  const { $, esc, me, seatName, toast, teamLabel } = ctx;
  const base = createDominoView(ctx);

  /** How the round ended, in a line. */
  function how(o) {
    if (o.reason === 'target') return o.winnerSeat === me() ? t('youReach') : t('reaches', { name: seatName(o.winnerSeat) });
    if (o.reason === 'domino') return o.winnerSeat === me() ? t('youGoOut') : t('goesOut', { name: seatName(o.winnerSeat) });
    return t('blockedPips', { a: teamLabel(0), pa: o.teamPips[0], b: teamLabel(1), pb: o.teamPips[1] });
  }

  return {
    ...base,

    mount() {
      base.mount();
      $('board').insertAdjacentHTML('beforeend', '<p class="ends-count" id="endsCount" hidden></p>');
    },

    renderBoard(prev) {
      base.renderBoard(prev);
      const r = ctx.state.round;
      const el = $('endsCount');
      const count = r?.line.length ? endsCount(r) : 0;
      el.hidden = !count;
      if (!count) return;
      el.textContent = t('ends', { n: count });
      el.classList.toggle('scores', count % 5 === 0);
    },

    feedback(prev) {
      base.feedback(prev);
      const la = ctx.state.round?.lastAction;
      const fresh = la && JSON.stringify(la) !== JSON.stringify(prev?.round?.lastAction) && prev?.roundNo === ctx.state.roundNo;
      if (!fresh || la.type !== 'play' || !la.points) return;
      const team = la.seat % 2;
      whenLanded(() => {
        toast(t('scored', { team: teamLabel(team), n: la.points }), 2000);
        sound.play('score');
      });
    },

    liveScores() {
      const { phase, round: r, scores } = ctx.state;
      return phase === 'playing' && r ? scores.map((s, team) => s + r.points[team]) : scores;
    },

    result(isMatch) {
      const r = ctx.state.round;
      const o = r.over;
      const line = how(o);
      const tied = o.reason === 'blocked' && o.winnerTeam == null;
      const lead = r.points[0] === r.points[1] ? null : r.points[0] > r.points[1] ? 0 : 1;
      const row = (label, team, n) => `<div class="ra" data-team="${team}"><span>${esc(label)}</span><b>${esc(teamLabel(team))} +${n}</b></div>`;
      const played = [0, 1].map((team) => r.points[team] - (o.winnerTeam === team ? o.bonus : 0));
      return {
        winTeam: o.winnerTeam ?? lead,
        gained: isMatch ? [0, 0] : r.points,
        emoji: '🁢',
        sub: line,
        lastRound: line,
        tie: tied && !isMatch ? { title: t('tieTitle'), sub: t('tieSub', { n: o.teamPips[0] }) } : null,
        details: [
          ...[0, 1].filter((team) => played[team]).map((team) => row(t('onTheEnds'), team, played[team])),
          o.bonus ? row(o.reason === 'domino' ? t('outBonus') : t('blockBonus'), o.winnerTeam, o.bonus) : '',
        ].join(''),
      };
    },

    historyRow(h) {
      const cell = (team) => (h.gained[team] ? `+${h.gained[team]}` : '·');
      const what =
        h.reason === 'target'
          ? esc(t('histTarget', { name: seatName(h.winnerSeat) }))
          : h.reason === 'domino'
            ? esc(t('histOut', { name: seatName(h.winnerSeat) }))
            : h.winnerTeam == null
              ? t('histTie')
              : t('histBlocked');
      return { cell, how: what };
    },
  };
}
