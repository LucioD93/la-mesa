import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/truco.js';
import { BOT_DELAY_MS } from '../server/games/common.js';
import { TRICK_PAUSE_MS } from '../server/games/truco.js';
import { Match } from '../server/match.js';

// Deterministic RNG so failures are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hand with fixed cards. Vira defaults to the 4 of copas, mano to seat 0. */
function fixed(hands, { vira = [4, 'c'], mano = 0 } = {}) {
  const r = G.newRound({ mano, rng: mulberry32(1) });
  r.vira = vira;
  r.hands = hands.map((h) => h.slice());
  r.dealt = hands.map((h) => h.slice());
  return r;
}

const WEAK = [[[4, 'o'], [5, 'e'], [6, 'b']], [[4, 'e'], [5, 'o'], [6, 'c']], [[4, 'b'], [5, 'b'], [6, 'o']], [[5, 'c'], [6, 'e'], [12, 'o']]];

/** Play the listed cards, one per seat, in turn order. */
function playTrick(r, cards) {
  for (const card of cards) G.play(r, r.turn, card);
}

test('deck has 40 unique cards, no 8s or 9s, and deals 3 each plus the vira', () => {
  const deck = G.fullDeck();
  assert.equal(deck.length, 40);
  assert.ok(!deck.some(([n]) => n === 8 || n === 9));
  const r = G.newRound({ rng: mulberry32(1) });
  assert.deepEqual(r.hands.map((h) => h.length), [3, 3, 3, 3]);
  const keys = new Set([...r.hands.flat(), r.vira].map((c) => c.join()));
  assert.equal(keys.size, 13);
});

test('perico is the 11 and perica the 10 of the vira suit', () => {
  assert.deepEqual(G.pieces([4, 'o']), { perico: [11, 'o'], perica: [10, 'o'] });
});

test('the 12 stands in when the vira is the 11 or the 10', () => {
  assert.deepEqual(G.pieces([11, 'b']), { perico: [12, 'b'], perica: [10, 'b'] });
  assert.deepEqual(G.pieces([10, 'b']), { perico: [11, 'b'], perica: [12, 'b'] });
});

test('cards rank perico, perica, then the matas and the rest', () => {
  const order = [
    [11, 'o'], [10, 'o'], [1, 'e'], [1, 'b'], [7, 'e'], [7, 'o'], [3, 'c'], [2, 'c'],
    [1, 'c'], [12, 'c'], [11, 'c'], [10, 'c'], [7, 'c'], [6, 'c'], [5, 'c'], [4, 'c'],
  ];
  const vira = [4, 'o'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(G.rank(order[i - 1], vira) > G.rank(order[i], vira), `${order[i - 1]} beats ${order[i]}`);
  }
  assert.equal(G.rank([3, 'c'], vira), G.rank([3, 'e'], vira));
  // A fake perico is just an 11 in another hand.
  assert.ok(G.rank([11, 'e'], vira) < G.rank([12, 'e'], vira));
});

test('envido values', () => {
  const vira = [4, 'o'];
  assert.equal(G.envidoValue([[3, 'c'], [7, 'c'], [5, 'e']], vira), 30);
  assert.equal(G.envidoValue([[12, 'c'], [11, 'c'], [5, 'e']], vira), 20);
  assert.equal(G.envidoValue([[3, 'c'], [7, 'b'], [5, 'e']], vira), 7);
  assert.equal(G.envidoValue([[11, 'o'], [5, 'c'], [2, 'e']], vira), 35);
  assert.equal(G.envidoValue([[10, 'o'], [7, 'c'], [2, 'e']], vira), 36);
  assert.equal(G.envidoValue([[11, 'o'], [10, 'o'], [7, 'c']], vira), 39);
  // The stand-in 12 takes the value of the piece it replaces.
  assert.equal(G.envidoValue([[12, 'b'], [5, 'c'], [2, 'e']], [11, 'b']), 35);
});

test('flor: three suited, a piece with a suited pair, and the reservada', () => {
  const vira = [4, 'o'];
  assert.equal(G.florType([[3, 'c'], [7, 'c'], [5, 'c']], vira), 'flor');
  assert.equal(G.florValue([[3, 'c'], [7, 'c'], [5, 'c']], vira), 35);
  assert.equal(G.florType([[11, 'o'], [7, 'c'], [5, 'c']], vira), 'flor');
  assert.equal(G.florValue([[11, 'o'], [7, 'c'], [5, 'c']], vira), 42);
  assert.equal(G.florType([[11, 'o'], [10, 'o'], [5, 'c']], vira), 'reservada');
  assert.equal(G.florValue([[11, 'o'], [10, 'o'], [7, 'c']], vira), 46);
  assert.equal(G.florType([[11, 'o'], [7, 'c'], [5, 'b']], vira), null);
  assert.equal(G.florType([[3, 'c'], [7, 'c'], [5, 'b']], vira), null);
});

test('the team that wins two tricks takes the hand for 1 without a truco', () => {
  const r = fixed([[[3, 'e'], [3, 'o'], [4, 'o']], [[4, 'e'], [5, 'o'], [6, 'c']], [[4, 'b'], [5, 'b'], [6, 'o']], [[5, 'c'], [6, 'e'], [12, 'o']]]);
  playTrick(r, [[3, 'e'], [4, 'e'], [4, 'b'], [5, 'c']]);
  assert.equal(r.tricks[0].winnerSeat, 0);
  assert.equal(r.turn, 0);
  playTrick(r, [[3, 'o'], [5, 'o'], [5, 'b'], [6, 'e']]);
  assert.equal(r.over.team, 0);
  assert.deepEqual(G.settle(r, [0, 0], 24).scores, [1, 0]);
});

test('parda: a tied first trick is decided by the second', () => {
  const r = fixed([[[3, 'e'], [2, 'e'], [4, 'o']], [[3, 'o'], [7, 'b'], [6, 'c']], [[4, 'b'], [5, 'b'], [6, 'o']], [[5, 'c'], [6, 'e'], [12, 'o']]]);
  playTrick(r, [[3, 'e'], [3, 'o'], [4, 'b'], [5, 'c']]);
  assert.equal(r.tricks[0].winnerTeam, null);
  assert.equal(r.turn, 0); // the leader of the tied trick leads again
  assert.equal(r.over, null);
  playTrick(r, [[2, 'e'], [7, 'b'], [5, 'b'], [6, 'e']]);
  assert.equal(r.over.team, 0);
});

test('parda: a tied trick after winning the first gives the hand to the first winner', () => {
  const r = fixed([[[3, 'e'], [2, 'e'], [4, 'o']], [[4, 'e'], [2, 'o'], [6, 'c']], [[4, 'b'], [5, 'b'], [6, 'o']], [[5, 'c'], [6, 'e'], [12, 'o']]]);
  playTrick(r, [[3, 'e'], [4, 'e'], [4, 'b'], [5, 'c']]);
  playTrick(r, [[2, 'e'], [2, 'o'], [5, 'b'], [6, 'e']]);
  assert.equal(r.over.team, 0);
});

test('parda: one trick each and a tied third goes to the first winner', () => {
  const r = fixed([[[3, 'e'], [4, 'o'], [2, 'e']], [[4, 'e'], [3, 'o'], [2, 'o']], [[4, 'b'], [5, 'b'], [6, 'o']], [[5, 'c'], [6, 'e'], [12, 'o']]]);
  playTrick(r, [[3, 'e'], [4, 'e'], [4, 'b'], [5, 'c']]);
  playTrick(r, [[4, 'o'], [3, 'o'], [5, 'b'], [6, 'e']]);
  assert.equal(r.turn, 1);
  playTrick(r, [[2, 'o'], [6, 'o'], [12, 'o'], [2, 'e']]);
  assert.equal(r.over.team, 0);
});

test('parda: three tied tricks go to the mano', () => {
  const hands = [[[3, 'e'], [2, 'e'], [12, 'e']], [[3, 'o'], [2, 'o'], [12, 'o']], [[4, 'b'], [5, 'b'], [6, 'o']], [[5, 'c'], [6, 'e'], [4, 'e']]];
  const r = fixed(hands, { mano: 1 });
  playTrick(r, [[3, 'o'], [4, 'b'], [5, 'c'], [3, 'e']]);
  playTrick(r, [[2, 'o'], [5, 'b'], [6, 'e'], [2, 'e']]);
  playTrick(r, [[12, 'o'], [6, 'o'], [4, 'e'], [12, 'e']]);
  assert.equal(r.over.team, 1);
});

test('truco ladder: accepted values and alternating raises', () => {
  const r = fixed(WEAK);
  G.call(r, 0, 'truco');
  assert.throws(() => G.play(r, 0, [4, 'o']), G.MoveError); // must be answered first
  assert.throws(() => G.answer(r, 2, true), G.MoveError); // not the caller's partner
  G.answer(r, 1, true);
  assert.deepEqual(r.truco, { level: 1, owner: 1 });
  assert.equal(G.options(r, 0).truco, 0); // only the team that accepted may raise
  G.play(r, 0, [4, 'o']);
  G.call(r, 1, 'truco');
  G.answer(r, 2, true);
  assert.deepEqual(r.truco, { level: 2, owner: 0 });
  assert.equal(G.options(r, 1).truco, 0);
});

test('refusing each level pays the level below', () => {
  for (const [level, paid] of [[1, 1], [2, 3], [3, 6], [4, 9]]) {
    const r = fixed(WEAK);
    r.truco = { level: level - 1, owner: level === 1 ? null : 0 };
    G.call(r, 0, 'truco');
    assert.equal(r.pending.level, level);
    G.answer(r, 1, false);
    assert.deepEqual(G.settle(r, [0, 0], 24).scores, [paid, 0]);
  }
});

test('a truco can be raised straight back without a separate quiero', () => {
  const r = fixed(WEAK);
  G.call(r, 0, 'truco');
  G.call(r, 1, 'truco'); // quiero y retruco
  assert.equal(r.pending.level, 2);
  assert.equal(r.pending.team, 0);
  G.answer(r, 0, false);
  assert.deepEqual(G.settle(r, [0, 0], 24).scores, [0, 3]);
});

test('vale juego wins the match outright', () => {
  const r = fixed(WEAK);
  r.truco = { level: 3, owner: 0 };
  G.call(r, 0, 'truco');
  G.answer(r, 1, true);
  assert.equal(r.truco.level, 4);
  G.call(r, 0, 'mazo'); // folding a vale juego still costs the whole game
  assert.deepEqual(G.settle(r, [5, 7], 24).scores, [5, 24]);
});

test('going to the mazo gives the rival the current value', () => {
  const r = fixed(WEAK);
  G.call(r, 0, 'truco');
  G.answer(r, 1, true);
  G.call(r, 0, 'mazo');
  assert.deepEqual(G.settle(r, [0, 0], 24).scores, [0, 3]);
});

function envidoHands() {
  return [
    [[7, 'o'], [5, 'o'], [4, 'b']], // 32
    [[6, 'e'], [5, 'e'], [4, 'e']], // flor
    [[4, 'o'], [5, 'c'], [6, 'b']],
    [[3, 'b'], [2, 'b'], [12, 'o']],
  ];
}

function envidoRound(mano = 0) {
  const hands = envidoHands();
  hands[1] = [[6, 'e'], [5, 'c'], [12, 'c']]; // 25
  return fixed(hands, { mano });
}

test('envido accepted: the best hand on either team takes the 2', () => {
  const r = envidoRound();
  G.call(r, 0, 'envido');
  G.answer(r, 1, true);
  assert.equal(r.pending, null);
  G.call(r, 0, 'mazo');
  const { scores, awards } = G.settle(r, [0, 0], 24);
  assert.deepEqual(awards[0], { kind: 'envido', team: 0, seat: 0, points: 2, value: 32, rivalValue: 25 });
  assert.deepEqual(scores, [2, 1]); // envido for team 0, mazo for team 1
});

test('envido refused pays 1, a refused raise pays what was accepted', () => {
  let r = envidoRound();
  G.call(r, 0, 'envido');
  G.answer(r, 1, false);
  G.call(r, 0, 'mazo');
  assert.equal(G.settle(r, [0, 0], 24).awards[0].points, 1);

  r = envidoRound();
  G.call(r, 0, 'envido');
  G.call(r, 1, 'envido'); // quiero y envido
  assert.equal(r.envido.stake, 4);
  G.answer(r, 0, false);
  G.call(r, 0, 'mazo');
  const award = G.settle(r, [0, 0], 24).awards[0];
  assert.deepEqual([award.team, award.points], [1, 2]);
});

test('envido raises: y cinco adds 5, and falta is the leader’s missing points', () => {
  let r = envidoRound();
  G.call(r, 0, 'envido');
  G.call(r, 1, 'cinco');
  assert.equal(r.envido.stake, 7);
  G.answer(r, 0, true);
  G.call(r, 0, 'mazo');
  assert.equal(G.settle(r, [0, 0], 24).awards[0].points, 7);

  r = envidoRound();
  G.call(r, 0, 'falta');
  assert.deepEqual(G.options(r, 1).envido, []); // nothing above the falta
  G.answer(r, 1, true);
  G.call(r, 0, 'mazo');
  assert.equal(G.settle(r, [10, 15], 24).awards[0].points, 9);
});

test('an envido tie goes to the seat closest to the mano', () => {
  const hands = [[[7, 'o'], [4, 'b'], [5, 'c']], [[7, 'e'], [4, 'c'], [5, 'o']], [[6, 'o'], [4, 'e'], [12, 'b']], [[6, 'b'], [5, 'e'], [12, 'c']]];
  const r = fixed(hands, { mano: 1 });
  G.call(r, 1, 'envido');
  G.answer(r, 0, true);
  G.call(r, 1, 'mazo');
  assert.equal(G.settle(r, [0, 0], 24).awards[0].team, 1);
});

test('envido can answer a truco, and the truco waits for it', () => {
  const r = envidoRound();
  G.call(r, 0, 'truco');
  assert.deepEqual(G.options(r, 1).envido, ['envido', 'falta']);
  G.call(r, 1, 'envido');
  assert.equal(r.pending.kind, 'envido');
  G.answer(r, 0, true);
  assert.equal(r.pending.kind, 'truco');
  assert.equal(r.pending.team, 1);
  assert.equal(G.options(r, 1).envido.length, 0);
});

test('envido closes once you have played your first card', () => {
  const r = envidoRound();
  G.play(r, 0, [7, 'o']);
  assert.deepEqual(G.options(r, 0).envido, []);
  assert.deepEqual(G.options(r, 1).envido, ['envido', 'falta']);
});

test('a sung flor scores 3 and cancels the envido', () => {
  const r = fixed(envidoHands());
  G.call(r, 0, 'envido');
  assert.equal(G.options(r, 1).flor, true);
  G.call(r, 1, 'flor');
  assert.equal(r.envido, null);
  assert.equal(r.pending, null);
  assert.deepEqual(G.options(r, 0).envido, []); // can't be called any more either
  G.call(r, 0, 'mazo');
  const { awards } = G.settle(r, [0, 0], 24);
  assert.equal(awards[0].kind, 'flor');
  assert.equal(awards[0].team, 1);
  assert.equal(awards[0].points, 3);
});

test('flor is lost if you play your first card without singing it', () => {
  const r = fixed(envidoHands());
  G.play(r, 0, [7, 'o']);
  G.play(r, 1, [6, 'e']);
  assert.equal(G.options(r, 1).flor, false);
  assert.throws(() => G.call(r, 1, 'flor'), G.MoveError);
  assert.equal(r.flor.length, 0);
});

test('only someone holding a flor can sing it', () => {
  const r = fixed(WEAK);
  assert.throws(() => G.call(r, 0, 'flor'), G.MoveError);
});

test('two flores: only the higher scores', () => {
  const hands = [[[7, 'o'], [5, 'o'], [6, 'o']], [[6, 'e'], [5, 'e'], [4, 'e']], [[4, 'o'], [5, 'c'], [6, 'b']], [[3, 'b'], [2, 'b'], [12, 'o']]];
  const r = fixed(hands);
  G.call(r, 0, 'flor');
  G.play(r, 0, [7, 'o']);
  G.call(r, 1, 'flor');
  G.call(r, 1, 'mazo');
  const { awards } = G.settle(r, [0, 0], 24);
  assert.equal(awards[0].team, 0);
  assert.equal(awards[0].value, 38);
  assert.equal(awards.filter((a) => a.kind === 'flor').length, 1);
});

test('the flor reservada scores 5 without being sung', () => {
  const hands = [[[11, 'c'], [10, 'c'], [4, 'b']], ...WEAK.slice(1)];
  const r = fixed(hands);
  assert.equal(G.options(r, 0).flor, false);
  G.call(r, 0, 'mazo');
  const { awards } = G.settle(r, [0, 0], 24);
  assert.deepEqual([awards[0].kind, awards[0].team, awards[0].points], ['reservada', 0, 5]);
});

test('flor and envido count before truco, and stop at the target', () => {
  const r = envidoRound();
  G.call(r, 0, 'envido');
  G.answer(r, 1, true);
  G.call(r, 0, 'mazo');
  const { scores, awards } = G.settle(r, [23, 23], 24);
  assert.deepEqual(scores, [25, 23]); // team 1's mazo point never counts
  assert.equal(awards.length, 1);
});

test('bot-only matches always reach a winner (state survives JSON round-trips)', () => {
  const rng = mulberry32(42);
  const random = Math.random;
  Math.random = rng;
  try {
    for (let game = 0; game < 40; game++) {
      let m = new Match('bots', { game: 'truco' });
      m.handle('p', { t: 'addBots' }, new Set());
      m.seats[0] = { token: 'p', name: 'P', bot: true };
      m.startRound(rng);
      let guard = 0;
      while (m.phase !== 'matchEnd') {
        assert.ok(guard++ < 20000, 'game should end');
        if (m.phase === 'roundEnd') m.startRound(rng);
        else {
          const p = m.pendingAuto();
          assert.ok(p, 'a bot should always have something to do');
          assert.equal(m.runAuto(p.key), true);
        }
        m = new Match('bots', JSON.parse(JSON.stringify(m)));
      }
      assert.ok(m.scores.some((s) => s >= m.target));
    }
  } finally {
    Math.random = random;
  }
});

function lobbyMatch() {
  const m = new Match('t', { game: 'truco' });
  m.join('a', 'Ana');
  m.handle('a', { t: 'addBots' }, new Set(['a']));
  return m;
}

test('rejoining with the same token keeps the seat', () => {
  const m = new Match('t', { game: 'truco' });
  m.join('a', 'Ana');
  m.join('b', 'Beto');
  m.join('a', 'Ana');
  assert.equal(m.seatOf('a'), 0);
  assert.equal(m.seatOf('b'), 1);
});

test('a player replaced by a bot after dropping gets the seat back on rejoin', () => {
  const m = new Match('t', { game: 'truco' });
  m.join('a', 'Ana');
  m.join('b', 'Beto');
  m.handle('a', { t: 'addBots' }, new Set(['a', 'b']));
  m.handle('a', { t: 'start' }, new Set(['a', 'b']));
  assert.equal(m.handle('a', { t: 'botify', seat: 1 }, new Set(['a'])), true);
  assert.ok(m.seats[1].bot);
  m.join('b', 'Beto');
  assert.equal(m.seatOf('b'), 1);
});

test('lobby frees seats of players who went offline', () => {
  const m = lobbyMatch();
  assert.equal(m.cleanupLobby(new Set()), true);
  assert.equal(m.seats[0], null);
  assert.ok(m.seats[1].bot);
});

test('target can only be set in the lobby, to 12, 24 or 32', () => {
  const m = lobbyMatch();
  assert.equal(m.target, 24);
  assert.equal(m.handle('a', { t: 'target', target: 13 }, new Set()), false);
  assert.equal(m.handle('a', { t: 'target', target: 12 }, new Set()), true);
  m.handle('a', { t: 'start' }, new Set(['a']));
  assert.equal(m.handle('a', { t: 'target', target: 32 }, new Set()), false);
});

test('the mano rotates each hand', () => {
  const m = lobbyMatch();
  m.handle('a', { t: 'start' }, new Set(['a']));
  const first = m.round.mano;
  m.round.over = { reason: 'mazo', team: 0, level: 0 };
  m.afterMove();
  m.handle('a', { t: 'next' }, new Set(['a']));
  assert.equal(m.round.mano, (first + 1) % 4);
  assert.equal(m.round.turn, m.round.mano);
});

test('views hide other hands and the envido result until the hand ends', () => {
  const m = lobbyMatch();
  m.handle('a', { t: 'start' }, new Set(['a']));
  m.round.turn = 0;
  m.handle('a', { t: 'call', what: 'envido' }, new Set(['a']));
  const v = m.stateFor('a', new Set(['a']));
  assert.equal(v.round.hands, null);
  assert.equal(v.round.hand.length, 3);
  assert.equal(v.round.envido.status, 'pending');
  assert.ok(!('dealt' in v.round));
  assert.equal(m.stateFor('watcher', new Set(['a'])).round.hand, null);
  assert.ok(m.round.pending);
  G.answer(m.round, 1, true);
  m.round.turn = 0;
  m.handle('a', { t: 'call', what: 'mazo' }, new Set(['a']));
  const end = m.stateFor('a', new Set(['a']));
  assert.equal(end.round.hands.length, 4);
  assert.ok(end.round.awards.length);
});

test('bots wait for the human on their team, and pause after a finished trick', () => {
  const m = new Match('t', { game: 'truco' });
  m.join('a', 'Ana');
  m.handle('a', { t: 'addBots' }, new Set(['a']));
  m.round = fixed(WEAK);
  m.phase = 'playing';
  m.roundNo = 1;
  // Seat 0 (human) is on turn: nothing automatic.
  assert.equal(m.pendingAuto(), null);
  // Seat 1 bets against the human's team: seat 2 is a bot, but Ana answers.
  m.round.turn = 1;
  G.call(m.round, 1, 'truco');
  assert.equal(m.pendingAuto(), null);
  // Ana bets against a team of two bots: seat 1 answers on its own.
  G.answer(m.round, 0, true);
  m.round.turn = 0;
  m.round.truco = { level: 0, owner: null };
  G.call(m.round, 0, 'truco');
  assert.equal(G.botActor(m), 1);
  assert.equal(m.pendingAuto().delay, BOT_DELAY_MS);
  G.answer(m.round, 1, true);
  playTrick(m.round, [[4, 'o'], [4, 'e'], [4, 'b'], [5, 'c']]);
  m.round.turn = 1;
  assert.equal(m.pendingAuto().delay, BOT_DELAY_MS + TRICK_PAUSE_MS);
});

test('blunders: only the player on turn, rate limited, cards never revealed', () => {
  const m = lobbyMatch();
  m.handle('a', { t: 'start' }, new Set(['a']));
  m.round.turn = 1;
  assert.equal(m.handle('a', { t: 'blunder' }, new Set(['a'])), false);
  m.round.turn = 0;
  assert.equal(m.handle('a', { t: 'blunder' }, new Set(['a'])), true);
  assert.equal(m.handle('a', { t: 'blunder' }, new Set(['a'])), false);
  assert.deepEqual(m.stateFor('a', new Set(['a'])).blunder, { n: 1, seat: 0 });
});

test('reactions: only seated players, known emoji, rate limited', () => {
  const m = lobbyMatch();
  assert.equal(m.handle('watcher', { t: 'react', emoji: '🔥' }, new Set()), false);
  assert.equal(m.handle('a', { t: 'react', emoji: '💩' }, new Set()), false);
  assert.equal(m.handle('a', { t: 'react', emoji: '🔥' }, new Set()), true);
  assert.equal(m.handle('a', { t: 'react', emoji: '🔥' }, new Set()), false);
  m.reaction.sent[0] -= 1000;
  assert.equal(m.handle('a', { t: 'react', emoji: '😂' }, new Set()), true);
  assert.equal(m.stateFor('watcher', new Set()).reaction.crowd, 1);
});

test('reactions: the crowd counts different players sending the same emoji in time', () => {
  const m = new Match('crowd', { game: 'truco' });
  for (const p of ['a', 'b', 'c']) m.join(p, p);
  const react = (p, emoji) => m.handle(p, { t: 'react', emoji }, new Set());
  const crowd = () => m.stateFor('a', new Set()).reaction.crowd;
  const age = (ms) => {
    m.reaction.at -= ms;
    for (const s in m.reaction.sent) m.reaction.sent[s] -= ms;
  };

  react('a', '🔥');
  assert.equal(crowd(), 1);
  assert.equal(react('b', '🔥'), true, 'one player does not throttle another');
  assert.equal(crowd(), 2);
  age(1000);
  react('a', '🔥');
  assert.equal(crowd(), 2, 'the same player repeating does not grow it');
  react('c', '🔥');
  assert.equal(crowd(), 3);

  age(1000);
  react('a', '😂');
  assert.equal(crowd(), 1, 'another emoji starts over');
  age(4000);
  react('b', '😂');
  assert.equal(crowd(), 1, 'too late to join');
});

test('bots are different Venezuelan memes, also when replacing a dropped player', () => {
  for (let i = 0; i < 20; i++) {
    const m = new Match('memes', { game: 'truco' });
    m.join('a', 'Ana');
    m.join('b', 'Ben');
    m.handle('a', { t: 'addBots' }, new Set(['a', 'b']));
    m.startRound();
    m.handle('a', { t: 'botify', seat: 1 }, new Set(['a']));
    assert.equal(new Set(m.seats.map((s) => s.name)).size, 4);
    assert.ok(m.seats[2].emoji);
    assert.equal(m.stateFor('a', new Set(['a'])).seats[1].emoji, m.seats[1].emoji);
    m.join('b', 'Ben');
    assert.equal(m.seats[1].name, 'Ben');
  }
});

test('seats show a public id that does not reveal the token', () => {
  const m = lobbyMatch();
  const { pid } = m.stateFor('a', new Set(['a'])).seats[0];
  assert.match(pid, /^[0-9a-f]{12}$/);
  assert.ok(!JSON.stringify(m.stateFor('b', new Set(['a']))).includes('"token"'));
});

test('El Manguangua sometimes says it when playing a card or making a call', () => {
  const phraseAfter = (name, roll) => {
    const m = new Match('phrase', { game: 'truco' });
    m.join('a', 'Ana');
    m.handle('a', { t: 'addBots' }, new Set());
    m.startRound();
    const r = m.round;
    m.seats[r.turn] = { token: null, name, emoji: '☕', bot: true };
    m.runAuto(m.pendingAuto().key, () => roll);
    return { played: r.lastAction, called: r.lastCall };
  };
  for (let i = 0; i < 50; i++) {
    for (const { played, called } of [phraseAfter('Plan Conejo', 0), phraseAfter('El Manguangua', 0.99)]) {
      assert.equal(played?.phrase ?? called?.phrase, undefined);
    }
    const { played, called } = phraseAfter('El Manguangua', 0);
    assert.equal(played?.phrase ?? called?.phrase, true);
    // A call is more likely to set it off than a card.
    const at20 = phraseAfter('El Manguangua', 0.2);
    if (at20.played) assert.equal(at20.played.phrase, undefined);
    else assert.equal(at20.called.phrase, true);
  }
});

test('illegal moves through the match throw MoveError', () => {
  const m = lobbyMatch();
  m.handle('a', { t: 'start' }, new Set(['a']));
  m.round.turn = 2;
  assert.throws(() => m.handle('a', { t: 'play', card: m.round.hands[0][0] }, new Set(['a'])), G.MoveError);
  m.round.turn = 0;
  assert.throws(() => m.handle('a', { t: 'play', card: [9, 'x'] }, new Set(['a'])), G.MoveError);
  assert.throws(() => m.handle('a', { t: 'call', what: 'nonsense' }, new Set(['a'])), G.MoveError);
});
