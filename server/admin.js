// Read-only JSON for the admin page (/api/admin), behind one shared password
// (ADMIN_PASSWORD). The page sends it as `Authorization: Bearer <password>`.
import { createHash, timingSafeEqual } from 'node:crypto';
import { iceServers } from './hub.js';
import { createMetered } from './metered.js';
import { usageDay } from './usage.js';

const HISTORY_DAYS = 30;
const MAX_FAILS = 10; // wrong passwords per address before it is locked out
const FAIL_WINDOW_S = 15 * 60;

const digest = (s) => createHash('sha256').update(s).digest();

export function passwordMatches(given, expected) {
  return timingSafeEqual(digest(String(given)), digest(String(expected)));
}

/** Vercel sets x-forwarded-for itself; elsewhere the header could be spoofed. */
function clientAddress(req) {
  const forwarded = process.env.VERCEL && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

/** Hostnames of the TURN servers in use; never their credentials. */
export function turnHosts(servers = iceServers()) {
  const urls = servers.flatMap((s) => s?.urls ?? []);
  const hosts = urls
    .filter((u) => /^turns?:/i.test(String(u)))
    .map((u) => String(u).replace(/^turns?:/i, '').split(/[:?]/)[0]);
  return [...new Set(hosts)];
}

export async function adminReport(store, metered, now = Date.now()) {
  const dayList = Array.from({ length: HISTORY_DAYS }, (_, i) => usageDay(now - i * 86_400_000)).reverse();
  const [usage, live, storeInfo, turnUsage] = await Promise.all([
    store.readUsage(dayList),
    store.liveOverview(now),
    store.info().catch((err) => ({ type: store.constructor.name, ok: false, error: err.message })),
    metered.usage(now),
  ]);
  return {
    now,
    days: dayList.map((day) => ({ day, ...usage.days[day] })),
    total: usage.total,
    live,
    metered: turnUsage,
    services: {
      store: storeInfo,
      turn: { hosts: turnHosts() },
    },
  };
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** @param {Promise<object>} storeReady */
export function createAdminHandler(storeReady) {
  const metered = createMetered();
  return async function adminHandler(req, res) {
    try {
      if (req.method !== 'GET') return json(res, 405, { error: 'method' });
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected) return json(res, 503, { error: 'unconfigured' });

      const store = await storeReady;
      const failKey = clientAddress(req);
      if ((await store.failedLogins(failKey)) >= MAX_FAILS) return json(res, 429, { error: 'locked' });

      const given = String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (!passwordMatches(given, expected)) {
        await store.addFailedLogin(failKey, FAIL_WINDOW_S);
        return json(res, 401, { error: 'password' });
      }
      json(res, 200, await adminReport(store, metered));
    } catch (err) {
      console.error('[admin]', err);
      json(res, 500, { error: 'server' });
    }
  };
}
