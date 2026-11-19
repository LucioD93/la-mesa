#!/usr/bin/env node
// Plays a whole match over real WebSockets and prints what happens. Every human seat is
// a headless player making simple random choices from what its own state offers, so the
// run goes through the same protocol, store and hub as a browser. Exits with 1 if the
// server refuses a move or the match stalls.
//
//   node scripts/sim.js truco                          its own server, fast clocks
//   node scripts/sim.js parchis --bots 2 --seed 7      two headless players, two bots, repeatable
//   node scripts/sim.js domino --url http://localhost:3000 --match demo --pace 600
//                                                      on a running server: watch at /play/demo
import { parseArgs } from 'node:util';
import { WebSocket } from 'ws';
import { setRng } from './sim/common.js';

const USAGE = `usage: node scripts/sim.js [game] [options]
  game              any game in server/games/index.js: domino, truco, war… (default domino)
  --bots <n>        seats for bots, 0-3 (default 0); headless players take the rest from seat 0
  --seed <s>        repeat the same deals, dice and choices (its own server only)
  --target <n>      the match's target, one of the game's choices
  --variant <n>     the game's variant (parchís: how many dice)
  --rounds <n>      stop after this many rounds instead of the whole match
  --url <url>       use a running server instead of starting one
  --match <id>      match id (default sim-<random>); it has to be new or in the lobby
  --pace <ms>       wait before each headless move, to watch it (default 0)
  --scale <n>       its own server's TIME_SCALE (default 0.02)
  --stall <s>       give up after this long without news (default 20)
  --quiet           only the rounds and the result`;

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    bots: { type: 'string', default: '0' },
    seed: { type: 'string' },
    target: { type: 'string' },
    variant: { type: 'string' },
    rounds: { type: 'string' },
    url: { type: 'string' },
    match: { type: 'string' },
    pace: { type: 'string', default: '0' },
    scale: { type: 'string', default: '0.02' },
    stall: { type: 'string', default: '20' },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (opt.help) {
  console.log(USAGE);
  process.exit(0);
}

const game = positionals[0] ?? 'domino';
const bots = Math.min(Math.max(Number(opt.bots) || 0, 0), 3);
const humans = 4 - bots;
const pace = Number(opt.pace) || 0;
const maxRounds = opt.rounds ? Number(opt.rounds) : Infinity;
// A seed fixes the match id too, since the server's seeded draws depend on it.
const suffix = opt.seed && !opt.url ? opt.seed.toLowerCase().replace(/[^a-z0-9-]/g, '-') : Math.random().toString(36).slice(2, 8);
const matchId = opt.match ?? `sim-${suffix}`.slice(0, 40);

// Our own server reads its knobs when it starts, so set them first.
if (!opt.url) {
  process.env.TIME_SCALE ??= opt.scale;
  if (opt.seed) process.env.SEED = opt.seed;
}
const { GAME_IDS } = await import('../server/games/index.js');
const { seededRng } = await import('../server/dev/config.js');
if (!GAME_IDS.includes(game)) {
  console.error(`unknown game ${game}: one of ${GAME_IDS.join(', ')}\n\n${USAGE}`);
  process.exit(2);
}
// The game's headless player and how its moves read in the log: scripts/sim/<game>.js.
const sim = await import(`./sim/${game}.js`);

const logError = console.error;
let base = opt.url;
let server;
if (!base) {
  const { createApp } = await import('../server/app.js');
  ({ server } = createApp());
  // The server logs an exception and play goes on; here it fails the run.
  console.error = (...args) => {
    logError(...args);
    done(1, '✖ the server threw an error (above)');
  };
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
const wsUrl = `${base.replace(/^http/, 'ws')}/api/ws?match=${encodeURIComponent(matchId)}`;

// Refusals the game expects when a move races another (its `races`): the game, not a bug.
const RACES = new Set(sim.races);

// ---- what happened, for the log ----------------------------------------------------

const said = new Map(); // what was last printed for each kind of action
function logActions(st) {
  if (opt.quiet || !st.round) return;
  const r = st.round;
  const lines = [sim.describe(r)].flat();
  const sources = sim.actors ?? ['lastAction'];
  lines.forEach((text, i) => {
    const src = r[sources[i]];
    if (!text || !src) return;
    const key = `${st.roundNo}:${JSON.stringify(src)}`;
    if (said.get(sources[i]) === key) return;
    said.set(sources[i], key);
    const seat = st.seats[src.seat];
    console.log(`    ${src.seat} ${seat?.bot ? '🤖' : '🧪'} ${seat?.name ?? '?'}: ${text}`);
  });
}

// ---- running it --------------------------------------------------------------------

const started = Date.now();
let moves = 0;
let lastNews = Date.now();
let finished = false;

function done(code, message) {
  if (finished) return;
  finished = true;
  if (message) (code ? logError : console.log)(message);
  for (const p of players) p.ws.close();
  server?.close();
  server?.closeAllConnections?.();
  setTimeout(() => process.exit(code), 50);
}

const players = [];
function join(seat) {
  return new Promise((resolve, reject) => {
    const p = { seat, token: `sim-${matchId}-${seat}`, state: null, acted: null, waiters: [], mine: {} };
    p.ws = new WebSocket(wsUrl);
    p.ws.on('open', () => p.ws.send(JSON.stringify({ t: 'hello', token: p.token, name: `sim${seat}`, games: GAME_IDS, game })));
    p.ws.on('error', reject);
    p.ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      lastNews = Date.now();
      if (msg.t === 'error') {
        if (RACES.has(msg.message)) return;
        return done(1, `✖ the server refused ${p.token}: ${msg.message}\n  last state: ${JSON.stringify(p.state?.round ?? p.state)}`);
      }
      if (msg.t !== 'state') return;
      p.state = msg;
      p.waiters = p.waiters.filter((w) => !w(msg));
      if (p === players[0]) watch(msg);
      act(p);
    });
    p.waiters.push((st) => (resolve(p), true));
    players.push(p);
  });
}

/** Resolves once this player's state passes `test`. */
const until = (p, test) =>
  p.state && test(p.state) ? Promise.resolve(p.state) : new Promise((resolve) => p.waiters.push((st) => test(st) && (resolve(st), true)));

const send = (p, msg) => p.ws.send(JSON.stringify(msg));

/** A key for the moment, so a player acts once per moment however many states arrive. */
const momentOf = (st) => {
  if (sim.moment) return sim.moment(st);
  // Cochina's and the slap's clocks tick without a move.
  const r = st.round && { ...st.round, grab: st.round.grab && { ...st.round.grab, left: null }, window: st.round.window && { ...st.round.window, left: null } };
  return JSON.stringify([st.roundNo, st.phase, r]);
};

function act(p) {
  const st = p.state;
  if (finished || st.phase !== 'playing' || st.you !== p.seat) return;
  const moment = momentOf(st);
  if (p.acted === moment) return;
  if (opt.seed) setRng(seededRng(`sim:${opt.seed}:${p.seat}:${moment}`));
  const msg = sim.play(st, p.mine);
  if (!msg) return;
  p.acted = moment;
  moves += 1;
  setTimeout(() => !finished && send(p, msg), pace);
}

let roundSeen = 0;
function watch(st) {
  if (st.roundNo !== roundSeen && st.phase === 'playing') {
    roundSeen = st.roundNo;
    console.log(`round ${st.roundNo}  ${st.scores.join(' – ')}`);
  }
  logActions(st);
  if (st.phase === 'roundEnd' || st.phase === 'matchEnd') {
    const last = st.history.at(-1);
    const key = `end:${st.roundNo}`;
    if (said.get('end') === key) return;
    said.set('end', key);
    if (!opt.quiet) console.log(`  → ${JSON.stringify(last)}`);
    if (st.phase === 'matchEnd' || st.history.length >= maxRounds) {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      return done(0, `✔ ${game}: ${st.phase === 'matchEnd' ? 'match over' : 'stopped'} after ${st.history.length} rounds, ${moves} headless moves, ${secs}s. Scores ${st.scores.join(' – ')} (target ${st.target}).`);
    }
    setTimeout(() => !finished && send(players[0], { t: 'next' }), pace);
  }
}

setInterval(() => {
  if (Date.now() - lastNews < Number(opt.stall) * 1000) return;
  const st = players[0]?.state;
  done(1, `✖ stalled: nothing for ${opt.stall}s. phase ${st?.phase}, turn ${st?.round?.turn}, round ${JSON.stringify(st?.round)}`);
}, 1000).unref();

console.log(`${game} at ${base}/play/${matchId}  (${humans} headless, ${bots} bots${opt.seed ? `, seed ${opt.seed}` : ''})`);
// One at a time, so each takes the next seat.
for (let s = 0; s < humans; s++) await join(s);
const host = players[0];
if (host.state.phase !== 'lobby' || host.state.you !== 0) done(1, `✖ ${matchId} is not a fresh lobby; pick another --match`);
if (host.state.game !== game) {
  send(host, { t: 'game', game });
  await until(host, (st) => st.game === game);
}
if (opt.target) {
  send(host, { t: 'target', target: Number(opt.target) });
  await until(host, (st) => st.target === Number(opt.target));
}
if (opt.variant) {
  send(host, { t: 'variant', variant: Number(opt.variant) });
  await until(host, (st) => st.variant === Number(opt.variant));
}
if (bots) {
  send(host, { t: 'addBots' });
  await until(host, (st) => st.seats.every(Boolean));
}
send(host, { t: 'start' });
