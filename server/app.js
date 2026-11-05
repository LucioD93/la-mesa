// HTTP + WebSocket server shared by local dev (server/index.js) and the
// Vercel Function (api/ws.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createAdminHandler } from './admin.js';
import { createHub } from './hub.js';
import { createStore } from './store.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
export const MATCH_ID = /^[a-z0-9-]{3,40}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

// Static files (only used locally; on Vercel they are served from public/).
function serveStatic(req, res) {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/index.html') return sendFile(res, path.join(PUBLIC, 'index.html'));
  const play = p.match(/^\/play\/([^/]+)\/?$/);
  if (play) {
    if (!MATCH_ID.test(play[1].toLowerCase())) {
      res.writeHead(302, { location: '/' });
      return res.end();
    }
    return sendFile(res, path.join(PUBLIC, 'play.html'));
  }
  if (p === '/admin') return sendFile(res, path.join(PUBLIC, 'admin.html'));
  if (p === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  sendFile(res, file);
}

/** Match id from `/api/ws?match=<id>` (or the older `/ws/<id>`). */
function matchIdFrom(reqUrl) {
  const url = new URL(reqUrl, 'http://x');
  const id = (url.searchParams.get('match') || url.pathname.match(/^\/ws\/([^/]+)$/)?.[1] || '').toLowerCase();
  return MATCH_ID.test(id) ? id : null;
}

export function createApp({ store: storeOverride } = {}) {
  const storeReady = storeOverride ? Promise.resolve(storeOverride) : createStore();
  const admin = createAdminHandler(storeReady);
  const server = http.createServer((req, res) =>
    new URL(req.url, 'http://x').pathname === '/api/admin' ? admin(req, res) : serveStatic(req, res),
  );
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const hubReady = storeReady.then(createHub);

  server.on('upgrade', async (req, socket, head) => {
    const id = matchIdFrom(req.url);
    if (!id) return socket.destroy();
    let hub;
    try {
      hub = await hubReady;
    } catch (err) {
      console.error('store unavailable', err);
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => (ws.isAlive = true));
      ws.on('message', () => (ws.isAlive = true)); // client pings count too
      hub.connect(ws, id);
    });
  });

  // Drop dead connections (phones going to sleep, flaky networks).
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000).unref();

  return { server, hubReady };
}
