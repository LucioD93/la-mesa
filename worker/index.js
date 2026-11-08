// The Cloudflare Worker: static files from public/, the admin data, and each match's
// WebSocket, which goes to that match's Durable Object (MatchServer).
import { MATCH_ID, matchIdFrom } from '../server/room.js';
import { createAdmin } from '../server/admin.js';
import { createCloudflareUsage } from '../server/cloudflare.js';
import { createMetered } from '../server/metered.js';

export { MatchServer } from './match-server.js';
export { StatsServer } from './stats-server.js';

// Kept between requests for their caches.
const metered = createMetered();
const cloudflare = createCloudflareUsage();

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
      return env.MATCHES.getByName(id).fetch(request);
    }

    if (url.pathname === '/api/admin') {
      const admin = createAdmin({ stats: statsOf(env), storage: 'durable-objects', metered, cloudflare });
      const { status, body } = await admin({
        method: request.method,
        authorization: request.headers.get('authorization'),
        address: request.headers.get('cf-connecting-ip'),
      });
      return json(status, body);
    }

    // /play/<id> is the table, for any match id.
    const play = url.pathname.match(/^\/play\/([^/]+)\/?$/);
    if (play) {
      if (!MATCH_ID.test(play[1].toLowerCase())) return Response.redirect(new URL('/', url), 302);
      return env.ASSETS.fetch(new Request(new URL('/play', url), request));
    }

    return env.ASSETS.fetch(request);
  },
};
