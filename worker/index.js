// The Cloudflare Worker: static files from public/, the admin data, and each match's
// WebSocket, which goes to that match's Durable Object (MatchServer).
import { MATCH_ID, matchIdFrom } from '../server/room.js';
import { createAdmin } from '../server/admin.js';
import { createMetered } from '../server/metered.js';
import { COUNTRY_HEADER, countryOf } from '../server/analytics.js';
import { idCookie, idFromCookie, saveId, withId } from '../server/identity.js';

export { MatchServer } from './match-server.js';
export { StatsServer } from './stats-server.js';

// Kept between requests for its cache.
const metered = createMetered();

/** Cloudflare's numbers, as the stats object fetches and caches them. */
const cloudflareOf = (env) => ({
  usage: (now) =>
    env.STATS.getByName('global')
      .cloudflareUsage(now)
      .catch((err) => {
        console.error('[cloudflare]', err);
        return { ok: false, error: err.message };
      }),
});

/** The stats object, through a new stub for each call: a stub belongs to the request that made it. */
const statsOf = (env) => {
  const stub = () => env.STATS.getByName('global');
  return {
    readUsage: (days) => stub().readUsage(days),
    overview: (now) => stub().overview(now),
    failedLogins: (address) => stub().failedLogins(address),
    addFailedLogin: (address, ttlS) => stub().addFailedLogin(address, ttlS),
  };
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ws' || url.pathname.startsWith('/ws/')) {
      const id = matchIdFrom(request.url);
      if (!id || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Bad request', { status: 400 });
      // Where Cloudflare saw the player, for analytics. Set (or cleared) here, so a client can't.
      const headers = new Headers(request.headers);
      headers.set(COUNTRY_HEADER, countryOf(request.cf?.country) ?? '');
      return env.MATCHES.getByName(id).fetch(new Request(request, { headers }));
    }

    if (url.pathname === '/api/admin') {
      const admin = createAdmin({ stats: statsOf(env), storage: 'durable-objects', metered, cloudflare: cloudflareOf(env) });
      const { status, body } = await admin({
        method: request.method,
        authorization: request.headers.get('authorization'),
        address: request.headers.get('cf-connecting-ip'),
      });
      return json(status, body);
    }

    // The page keeps its player token in a cookie too (server/identity.js).
    if (url.pathname === '/api/id') {
      const { status, cookie } = saveId({
        method: request.method,
        fetchSite: request.headers.get('sec-fetch-site'),
        origin: request.headers.get('origin'),
        host: url.host,
        secure: url.protocol === 'https:',
        body: request.method === 'POST' ? (await request.text()).slice(0, 100) : '',
      });
      return new Response(null, { status, headers: cookie ? { 'set-cookie': cookie, 'cache-control': 'no-store' } : {} });
    }

    // /play/<id> is the table, for any match id.
    const play = url.pathname.match(/^\/play\/([^/]+)\/?$/);
    if (play) {
      if (!MATCH_ID.test(play[1].toLowerCase())) return Response.redirect(new URL('/', url), 302);
      const id = idFromCookie(request.headers.get('cookie'));
      if (!id) return env.ASSETS.fetch(new Request(new URL('/play', url), request));
      // With the cookie the page is this device's own: it carries the token, is never a 304
      // or cached, and gives the cookie another 400 days.
      const page = await env.ASSETS.fetch(new URL('/play', url));
      if (!page.ok) return page;
      const headers = new Headers(page.headers);
      for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) headers.delete(name);
      headers.set('cache-control', 'private, no-store');
      headers.append('set-cookie', idCookie(id, url.protocol === 'https:'));
      return new Response(withId(await page.text(), id), { status: 200, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
