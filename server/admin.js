// Read-only JSON for the admin page (/api/admin), behind one shared password
// (ADMIN_PASSWORD). The page sends it as `Authorization: Bearer <password>`.
// The Node server and the Worker each turn their requests into `admin({ method, authorization, address })`.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createCloudflareUsage } from './cloudflare.js';
import { createMetered } from './metered.js';
import { iceServers, usageDay } from './room.js';

const HISTORY_DAYS = 30;
const MAX_FAILS = 10; // wrong passwords per address before it is locked out
const FAIL_WINDOW_S = 15 * 60;

const digest = (s) => createHash('sha256').update(s).digest();

export function passwordMatches(given, expected) {
  return timingSafeEqual(digest(String(given)), digest(String(expected)));
}

/** Hostnames of the TURN servers in use; never their credentials. */
export function turnHosts(servers = iceServers()) {
  const urls = servers.flatMap((s) => s?.urls ?? []);
  const hosts = urls
    .filter((u) => /^turns?:/i.test(String(u)))
    .map((u) => String(u).replace(/^turns?:/i, '').split(/[:?]/)[0]);
  return [...new Set(hosts)];
}

/**
 * @param {object} deps
 * @param {object} deps.stats      a Stats, or a stub whose methods return promises (the Worker's)
 * @param {string} deps.storage    where matches live: 'memory' or 'durable-objects'
 */
export async function adminReport({ stats, storage, metered, cloudflare }, now = Date.now()) {
  const dayList = Array.from({ length: HISTORY_DAYS }, (_, i) => usageDay(now - i * 86_400_000)).reverse();
  const started = performance.now();
  const statsInfo = Promise.all([stats.readUsage(dayList), stats.overview(now)]).then(
    ([usage, live]) => ({ usage, live, info: { type: storage, ok: true, latencyMs: Math.round(performance.now() - started) } }),
  );
  const [{ usage, live, info }, turnUsage, cloudflareUsage] = await Promise.all([statsInfo, metered.usage(now), cloudflare.usage(now)]);
  return {
    now,
    days: dayList.map((day) => ({ day, ...usage.days[day] })),
    total: usage.total,
    live,
    metered: turnUsage,
    cloudflare: cloudflareUsage,
    services: {
      store: info,
      turn: { hosts: turnHosts() },
      metered: !!(process.env.METERED_APP && process.env.METERED_SECRET_KEY),
      cloudflare: !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN),
    },
  };
}

export function createAdmin({ stats, storage, metered = createMetered(), cloudflare = createCloudflareUsage() }) {
  /** @returns {Promise<{ status: number, body: object }>} */
  return async function admin({ method, authorization, address }) {
    try {
      if (method !== 'GET') return { status: 405, body: { error: 'method' } };
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected) return { status: 503, body: { error: 'unconfigured' } };

      const failKey = address || 'unknown';
      if ((await stats.failedLogins(failKey)) >= MAX_FAILS) return { status: 429, body: { error: 'locked' } };

      const given = String(authorization || '').replace(/^Bearer /, '');
      if (!passwordMatches(given, expected)) {
        await stats.addFailedLogin(failKey, FAIL_WINDOW_S);
        return { status: 401, body: { error: 'password' } };
      }
      return { status: 200, body: await adminReport({ stats, storage, metered, cloudflare }) };
    } catch (err) {
      console.error('[admin]', err);
      return { status: 500, body: { error: 'server' } };
    }
  };
}
