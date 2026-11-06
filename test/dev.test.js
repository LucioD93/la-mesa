import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createApp } from '../server/app.js';
import { Match } from '../server/match.js';
import { MemoryStore } from '../server/store.js';
import { GAME_IDS } from '../server/games/index.js';
import { diceValues, devTools, rig, seededRng, timeScale } from '../server/dev/config.js';
import { SCENARIOS, applyScenario, playUntil } from '../server/dev/scenarios.js';
import { merge } from '../server/dev/tools.js';
import { florType, envidoValue } from '../server/games/truco.js';
import { cantoOf } from '../server/games/caida.js';
import { bestMelds } from '../server/games/rummy.js';

/** Set env vars for one test. */
function withEnv(t, vars) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) v == null ? delete process.env[k] : (process.env[k] = v);
  t.after(() => {
    for (const [k, v] of Object.entries(before)) v == null ? delete process.env[k] : (process.env[k] = v);
  });
}

// ---- the knobs ----------------------------------------------------------------------

test('the dev knobs are off unless set, and never work on Vercel', (t) => {
  withEnv(t, { DEV_TOOLS: null, TIME_SCALE: null, SEED: null, VERCEL: null });
  assert.equal(devTools(), false);
  assert.equal(timeScale(), 1);
  process.env.DEV_TOOLS = '1';
  process.env.TIME_SCALE = '0.1';
  assert.equal(devTools(), true);
  assert.equal(timeScale(), 0.1);
  process.env.TIME_SCALE = 'fast';
  assert.equal(timeScale(), 1, 'nonsense is ignored');
  process.env.TIME_SCALE = '0';
  assert.equal(timeScale(), 0);
  process.env.VERCEL = '1';
  assert.equal(devTools(), false);
  assert.equal(timeScale(), 1);
});

test('SEED repeats deals and bot moves, per match', (t) => {
  withEnv(t, { SEED: 'abc', VERCEL: null });
  const play = (id) => {
    const m = new Match(id, { game: 'truco' });
    for (const s of ['a', 'b', 'c', 'd']) m.join(s, s);
    m.handle('a', { t: 'stand' }, new Set());
    m.handle('a', { t: 'addBots' }, new Set());
    m.startRound();
    for (let i = 0; i < 6 && m.pendingAuto(); i++) m.runAuto(m.pendingAuto().key);
    return JSON.stringify(m.round);
  };
  assert.equal(play('one'), play('one'));
  assert.notEqual(play('one'), play('two'));
  delete process.env.SEED;
  assert.notEqual(play('one'), play('one'), 'without a seed, deals are random again');
});

test('rigged draws come before the random ones, and roll the dice asked for', () => {
  const m = new Match('rigged', { game: 'parchis' });
  for (const s of ['a', 'b', 'c', 'd']) m.join(s, s);
  m.nextStarter = 0;
  m.startRound();
  rig('rigged', diceValues([6, 6]));
  assert.ok(m.handle('a', { t: 'roll' }, new Set()));
  assert.deepEqual(m.round.lastRoll.values, [6, 6]);
});

test('seeded random numbers repeat and spread out', () => {
  const a = seededRng('x');
  const b = seededRng('x');
  const draws = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(draws.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert.ok(draws.every((n) => n >= 0 && n < 1));
  const mean = draws.reduce((s, n) => s + n, 0) / draws.length;
  assert.ok(mean > 0.45 && mean < 0.55);
});

test('a patch merges objects, replaces arrays, and patches an array by index', () => {
  const base = { scores: [1, 2], round: { turn: 0, hands: [[1], [2], [3], [4]] }, phase: 'playing' };
  assert.deepEqual(merge(base, { scores: [9, 9] }).scores, [9, 9]);
  assert.deepEqual(merge(base, { round: { turn: 2 } }).round, { turn: 2, hands: [[1], [2], [3], [4]] });
  assert.deepEqual(merge(base, { round: { hands: { 2: [7, 7] } } }).round.hands, [[1], [2], [7, 7], [4]]);
  assert.equal(merge(base, { round: null }).round, null);
  assert.equal(base.round.turn, 0, 'the original is untouched');
});

// ---- scenarios ------------------------------------------------------------------------

/** What each scenario promises about seat 0, checked on the match it builds. */
const PROMISES = {
  lobby: (m) => m.phase === 'lobby' && m.seats.every(Boolean),
  deal: (m) => m.phase === 'playing' && m.roundNo === 1,
  'match-point': (m) => m.phase === 'playing' && m.scores.every((s) => s === m.target - 1),
  'round-end': (m) => m.phase === 'roundEnd' || m.phase === 'matchEnd',
  'match-end': (m) => m.phase === 'matchEnd',
  'domino-opening': (m) => m.round.turn === 0 && m.round.hands[0].some((x) => x[0] === 6 && x[1] === 6),
  'domino-last-tile': (m) => m.round.turn === 0 && m.round.hands[0].length === 1,
  'domino-stuck': (m) => m.round.turn === 0 && m.pendingAuto()?.delay > 0,
  'domino-block': (m) => m.round.turn === 0,
  'truco-flor': (m) => florType(m.round.dealt[0], m.round.vira) === 'flor' && m.round.turn === 0,
  'truco-reservada': (m) => florType(m.round.dealt[0], m.round.vira) === 'reservada',
  'truco-envido': (m) => envidoValue(m.round.dealt[0], m.round.vira) === 33,
  'truco-answer': (m) => m.round.pending?.team === 0 && m.waitingOn()?.seat === 0,
  'caida-ronda': (m) => m.round.turn === 0 && cantoOf(m.round.hands[0])?.kind === 'ronda',
  'caida-caida': (m) => m.round.hands[0].some((c) => c[0] === m.round.lastDrop[0]),
  'caida-mesa-limpia': (m) => m.round.turn === 0 && m.round.table.length >= 2,
  'parchis-home': (m) => m.round.turn === 0 && m.round.pieces[2].every((p) => p === 71),
  'parchis-capture': (m) => m.round.turn === 0,
  'parchis-leave': (m) => m.round.pieces.flat().every((p) => p === -1),
  'cochina-steal': (m) => m.round.hands[0].some((c) => c[0] === m.round.piles[1].at(-1)[0]),
  'cochina-steal-run': (m) => {
    const top = m.round.piles[1].slice(-4).map((c) => c[0]);
    return top.slice(1).every((n) => n === top[1]) && top[0] !== top[1] && m.round.hands[0].some((c) => c[0] === top[1]);
  },
  'cochina-grab': (m) => m.round.turn === 0,
  'rummy-take': (m) => m.round.turn === 0 && !m.round.drawn && m.round.discard.length > 0,
  'rummy-meld': (m) => m.round.turn === 0 && m.round.drawn && bestMelds(m.round.hands[0]).length > 0,
  'rummy-layoff': (m) => m.round.turn === 0 && m.round.drawn && m.round.melds.length > 0,
  'rummy-out': (m) => m.round.turn === 0 && m.round.drawn && bestMelds(m.round.hands[0]).length > 0,
  'rummy-last-card': (m) => m.round.turn === 0 && m.round.drawn && m.round.stock.length === 0,
};

test('every scenario has a check here', () => {
  assert.deepEqual(Object.keys(PROMISES).sort(), Object.keys(SCENARIOS).sort());
});

test('every scenario sets up its moment in every game it takes, and the round plays on from there', () => {
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    for (const game of sc.game ? [sc.game] : GAME_IDS) {
      const m = new Match(`sc-${name}`);
      applyScenario(m, name, { game, seed: 'test' });
      const label = `${name} (${game})`;
      assert.equal(m.game, game, label);
      assert.ok(PROMISES[name](m), label);
      assert.deepEqual(m.seats[0], { token: 'p0', name: 'p0', bot: false }, label);
      assert.ok(m.seats.slice(1).every((s) => s.bot), label);
      if (m.phase === 'playing') assert.equal(playUntil(m, (r) => r.over), true, `${label} plays to the end`);
      // It survives the store's trip through JSON.
      assert.deepEqual(new Match(m.id, JSON.parse(JSON.stringify(m))).toJSON(), m.toJSON(), label);
    }
  }
});

test('a scenario repeats with the same seed, and seats as many players as asked', () => {
  const build = () => JSON.stringify(applyScenario(new Match('s'), 'domino-stuck', { seed: 9, humans: 3 }).round);
  assert.equal(build(), build());
  const m = applyScenario(new Match('s'), 'deal', { game: 'truco', humans: 4 });
  assert.deepEqual(m.seats.map((s) => s.token), ['p0', 'p1', 'p2', 'p3']);
  assert.throws(() => applyScenario(new Match('s'), 'nope'), /unknown scenario/);
});

// ---- over HTTP and sockets ------------------------------------------------------------

async function serve(t, env = { DEV_TOOLS: '1' }) {
  withEnv(t, { VERCEL: null, ...env });
  const { server } = createApp({ store: new MemoryStore() });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { base, call };
}

async function player(t, base, id, token) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/api/ws?match=${id}`);
  t.after(() => ws.terminate());
  const states = [];
  const waiting = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.t !== 'state') return;
    states.push(msg);
    for (const w of [...waiting]) if (w.test(msg)) waiting.splice(waiting.indexOf(w), 1) && w.resolve(msg);
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'hello', token, name: token, games: GAME_IDS }));
  const next = (test) => new Promise((resolve) => (states.some(test) ? resolve(states.findLast(test)) : waiting.push({ test, resolve })));
  return { next, say: (msg) => ws.send(JSON.stringify(msg)) };
}

test('without DEV_TOOLS there is no /api/dev', async (t) => {
  const { call } = await serve(t, { DEV_TOOLS: null });
  assert.equal((await call('GET', '/api/dev')).status, 404);
  assert.equal((await call('PUT', '/api/dev/match/abc', {})).status, 404);
});

test('a scenario lands on the tables already open, and the player can play it', async (t) => {
  const { base, call } = await serve(t);
  const list = await call('GET', '/api/dev');
  assert.ok(list.body.scenarios['truco-flor']);
  const p0 = await player(t, base, 'flor', 'p0');
  await p0.next((s) => s.phase === 'lobby');

  const { status, body } = await call('POST', '/api/dev/match/flor/scenario/truco-flor');
  assert.equal(status, 200);
  assert.equal(body.changed, true);
  assert.equal(body.match.round.hands.length, 4, 'the dev view has every hand');
  assert.ok(body.online.includes('p0'));
  const dealt = await p0.next((s) => s.game === 'truco' && s.phase === 'playing');
  assert.equal(dealt.you, 0);
  assert.equal(dealt.round.options.flor, true);

  p0.say({ t: 'call', what: 'flor' });
  await p0.next((s) => s.round?.flor.includes(0));
});

test('patching, sending as a player, automatic moves and the hurry all go through the store', async (t) => {
  const { base, call } = await serve(t);
  const p1 = await player(t, base, 'knobs', 'p1');
  await call('POST', '/api/dev/match/knobs/scenario/deal', { game: 'domino', humans: 2, seed: 4 });

  const patched = await call('PATCH', '/api/dev/match/knobs', { scores: [42, 7], round: { turn: 1 } });
  assert.deepEqual(patched.body.match.scores, [42, 7]);
  const seen = await p1.next((s) => s.scores[0] === 42);
  assert.equal(seen.round.turn, 1);

  const legal = seen.round.legal[0];
  if (legal) {
    const sent = await call('POST', '/api/dev/match/knobs/send', { as: 'p1', msg: { t: 'play', tile: legal.tile, end: legal.end } });
    assert.equal(sent.body.changed, true);
  }
  const refused = await call('POST', '/api/dev/match/knobs/send', { as: 'p1', msg: { t: 'play', tile: [9, 9], end: 'L' } });
  assert.equal(refused.status, 409);

  await call('PATCH', '/api/dev/match/knobs', { round: { turn: 2 } }); // a bot's turn
  const auto = await call('POST', '/api/dev/match/knobs/auto');
  assert.equal(auto.body.changed, true);
  assert.notEqual(auto.body.match.round.turn, 2);

  await call('POST', '/api/dev/match/knobs/scenario/truco-envido'); // seat 0 to play, no automatic move pending
  const hurried = await call('POST', '/api/dev/match/knobs/hurry');
  assert.equal(hurried.body.changed, true);
  assert.equal(hurried.body.match.reaction.slow, 0);

  const fresh = await call('PUT', '/api/dev/match/knobs', {});
  assert.equal(fresh.body.match.phase, 'lobby');
  assert.equal((await call('POST', '/api/dev/match/knobs/scenario/nope')).status, 404);
  assert.equal((await call('POST', '/api/dev/match/knobs/rig', { dice: [7] })).status, 400);
});

test('parchis-home rigs the winning roll, and the dice can be rigged by hand', async (t) => {
  const { base, call } = await serve(t);
  const p0 = await player(t, base, 'home', 'p0');
  await call('POST', '/api/dev/match/home/scenario/parchis-home');
  await p0.next((s) => s.game === 'parchis' && s.round?.options.roll);
  p0.say({ t: 'roll' });
  const rolled = await p0.next((s) => s.round?.lastRoll);
  assert.deepEqual(rolled.round.lastRoll.values, [3, 2]);

  // A scenario starts over: draws it didn't use are dropped, and it lines up its own.
  await call('POST', '/api/dev/match/home/rig', { dice: [1, 1] });
  await call('POST', '/api/dev/match/home/scenario/parchis-leave');
  const left = await call('POST', '/api/dev/match/home/send', { as: 'p0', msg: { t: 'roll' } });
  assert.deepEqual(left.body.match.round.lastRoll.values, [5, 3]);

  await call('PATCH', '/api/dev/match/home', { round: { turn: 0, stage: 'roll', pending: [], again: false } });
  await call('POST', '/api/dev/match/home/rig', { dice: [6, 6] });
  const sent = await call('POST', '/api/dev/match/home/send', { as: 'p0', msg: { t: 'roll' } });
  assert.deepEqual(sent.body.match.round.lastRoll.values, [6, 6]);
});

// ---- the simulator ----------------------------------------------------------------------

const run = promisify(execFile);
const SIM = fileURLToPath(new URL('../scripts/sim.js', import.meta.url));

test('the simulator plays every game over sockets without a refused move', async () => {
  await Promise.all(
    GAME_IDS.map(async (game) => {
      const { stdout } = await run(process.execPath, [SIM, game, '--seed', '1', '--rounds', '2', '--quiet', '--bots', '1', '--stall', '10'], {
        env: { ...process.env, DEV_TOOLS: '', VERCEL: '' },
        timeout: 60_000,
      });
      assert.match(stdout, new RegExp(`✔ ${game}:`), stdout);
    }),
  );
});
