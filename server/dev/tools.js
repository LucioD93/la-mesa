// /api/dev: read any match whole and change it while people are at the table. Every
// change goes through the store like a move does, so open tabs redraw right away.
// Only mounted with DEV_TOOLS=1 and never on Vercel (see config.js).
//
//   GET    /api/dev                              what's here: routes, scenarios, the knobs
//   GET    /api/dev/match/<id>                   the match, every hand included
//   PUT    /api/dev/match/<id>                   replace it ({} is a fresh lobby)
//   PATCH  /api/dev/match/<id>                   deep-merge into it; arrays are replaced, or patched by index with {"0": …}
//   POST   /api/dev/match/<id>/scenario/<name>   set up a scenario; body: { game?, humans?, seed?, target?, variant?, kind? }
//   POST   /api/dev/match/<id>/send              { as, msg }: send a message as that player's token
//   POST   /api/dev/match/<id>/auto              play the pending automatic move now
//   POST   /api/dev/match/<id>/hurry             mock the slow player now
//   POST   /api/dev/match/<id>/rig               { dice: [3, 2] } or { values: [0.1, …] }: the next random draws
import { MoveError } from '../games/common.js';
import { diceValues, rig, seed, timeScale } from './config.js';
import { SCENARIOS, applyScenario, playerToken, replaceMatch } from './scenarios.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `patch` laid over `base`. An object of indexes patches an array; anything else replaces. */
export function merge(base, patch) {
  if (Array.isArray(base) && isObject(patch) && Object.keys(patch).every((k) => /^\d+$/.test(k))) {
    const out = base.slice();
    for (const [k, v] of Object.entries(patch)) out[k] = merge(base[k], v);
    return out;
  }
  if (!isObject(base) || !isObject(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(base[k], v);
  return out;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new HttpError(413, 'body too large');
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'body is not JSON');
  }
}

/** The match as the server holds it, plus what the table is about to do. */
function report(match, online, changed) {
  const out = { changed, match: match.toJSON(), online: [...online] };
  try {
    out.auto = match.pendingAuto();
    out.waitingOn = match.waitingOn();
  } catch (err) {
    out.broken = `the rules can't read this match: ${err.message}`; // a patch left it inconsistent
  }
  return out;
}

const ROUTES = [
  'GET /api/dev',
  'GET /api/dev/match/<id>',
  'PUT /api/dev/match/<id>',
  'PATCH /api/dev/match/<id>',
  'POST /api/dev/match/<id>/scenario/<name>',
  'POST /api/dev/match/<id>/send',
  'POST /api/dev/match/<id>/auto',
  'POST /api/dev/match/<id>/hurry',
  'POST /api/dev/match/<id>/rig',
];

export function createDevHandler(storeReady, matchId) {
  async function route(req, path) {
    const store = await storeReady;
    if (path === '/api/dev' || path === '/api/dev/') {
      return {
        routes: ROUTES,
        scenarios: Object.fromEntries(Object.entries(SCENARIOS).map(([name, s]) => [name, { game: s.game ?? 'any', about: s.about }])),
        seed: seed(),
        timeScale: timeScale(),
        players: 'Scenarios seat p0, p1… from seat 0. Open /play/<id>?as=p0 to sit as one.',
      };
    }
    const m = path.match(/^\/api\/dev\/match\/([^/]+)(?:\/([a-z]+)(?:\/([a-z0-9-]+))?)?\/?$/);
    if (!m) throw new HttpError(404, 'no such route; GET /api/dev lists them');
    const [, rawId, action = null, name] = m;
    const id = rawId.toLowerCase();
    if (!matchId.test(id)) throw new HttpError(400, 'bad match id');
    const key = `${req.method} ${action ?? ''}`;
    const update = async (fn) => {
      const { match, online, changed } = await store.update(id, fn);
      return report(match, online, !!changed);
    };

    switch (key) {
      case 'GET ': {
        const { match, online } = await store.get(id);
        return report(match, online, false);
      }
      case 'PUT ': {
        const body = await readJson(req);
        return update((match) => !!replaceMatch(match, body));
      }
      case 'PATCH ': {
        const body = await readJson(req);
        if (!isObject(body)) throw new HttpError(400, 'send an object to merge');
        return update((match) => !!replaceMatch(match, merge(match.toJSON(), body)));
      }
      case 'POST scenario': {
        const opts = await readJson(req);
        if (!Object.hasOwn(SCENARIOS, name ?? '')) throw new HttpError(404, `unknown scenario ${name}; GET /api/dev lists them`);
        // The scenario's players count as online, so nobody offers to swap them for bots.
        const humans = Math.min(Math.max(Math.trunc(Number(opts.humans ?? 1)) || 0, 0), 4);
        for (let s = 0; s < humans; s++) await store.setPresence(id, playerToken(s));
        try {
          return await update((match) => !!applyScenario(match, name, opts));
        } catch (err) {
          throw new HttpError(422, err.message);
        }
      }
      case 'POST send': {
        const { as, msg } = await readJson(req);
        if (typeof as !== 'string' || !isObject(msg)) throw new HttpError(400, 'send { as: <token>, msg: { t: … } }');
        try {
          return await update((match, online) => match.handle(as, msg, online));
        } catch (err) {
          if (err instanceof MoveError) throw new HttpError(409, err.message);
          throw err;
        }
      }
      case 'POST auto':
        return update((match) => {
          const p = match.pendingAuto();
          return !!p && match.runAuto(p.key);
        });
      case 'POST hurry':
        return update((match) => {
          const w = match.waitingOn();
          return !!w && match.hurry(w.key);
        });
      case 'POST rig': {
        const { dice, values } = await readJson(req);
        const draws = Array.isArray(dice) ? diceValues(dice) : values;
        if (!Array.isArray(draws) || !draws.every((n) => typeof n === 'number' && n >= 0 && n < 1)) {
          throw new HttpError(400, 'send { dice: [1-6, …] } or { values: [0 <= n < 1, …] }');
        }
        rig(id, draws);
        return { rigged: draws };
      }
      default:
        throw new HttpError(404, 'no such route; GET /api/dev lists them');
    }
  }

  return async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    let status = 200;
    let body;
    try {
      body = await route(req, path);
    } catch (err) {
      status = err.status ?? 500;
      body = { error: err.message };
      if (status === 500) console.error('[dev]', err);
    }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body, null, 2));
  };
}
