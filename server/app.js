// The local server (server/index.js), and what the tests and the sim run: one Node process
// serves the static files, the admin data and the WebSockets, and keeps every match in
// memory. Each match is a room from room.js, the same one the Worker runs as a Durable
// Object (worker/); here its storage is a Map and its alarm a setTimeout.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createAdmin } from './admin.js';
import { idCookie, idFromCookie, saveId, withId } from './identity.js';
import { MATCH_ID, createRoom, matchIdFrom } from './room.js';
import { Stats, memoryKv } from './stats.js';
import { devTools } from './dev/config.js';
import { createDevHandler } from './dev/tools.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

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
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
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

// Static files, with the same routes as the Worker's assets.
function serveStatic(req, res) {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/index.html') return sendFile(res, path.join(PUBLIC, 'index.html'));
  const play = p.match(/^\/play\/([^/]+)\/?$/);
  if (play) {
    if (!MATCH_ID.test(play[1].toLowerCase())) {
      res.writeHead(302, { location: '/' });
      return res.end();
    }
    const id = idFromCookie(req.headers.cookie);
    if (!id) return sendFile(res, path.join(PUBLIC, 'play.html'));
    // With the cookie the page carries this device's token, as on the Worker.
    return fs.readFile(path.join(PUBLIC, 'play.html'), 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500);
        return res.end();
      }
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'private, no-store', 'set-cookie': idCookie(id, false) });
      res.end(withId(html, id));
    });
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

export function createApp({ analytics } = {}) {
  const records = new Map(); // id -> each room's saved record as JSON, like a Durable Object's storage
  const stats = new Stats(memoryKv());
  /** id -> { room, conns: Map<id, conn>, timer } */
  const rooms = new Map();
  let lastConn = 0;

  function roomFor(id) {
    let r = rooms.get(id);
    if (r) return r;
    r = { conns: new Map(), timer: null };
    r.room = createRoom(id, {
      load: () => (records.has(id) ? JSON.parse(records.get(id)) : undefined),
      save: (record) => records.set(id, JSON.stringify(record)),
      forget: () => {
        records.delete(id);
        if (rooms.get(id) === r) rooms.delete(id);
      },
      connections: () => r.conns.values(),
      wakeAt: (at) => {
        clearTimeout(r.timer);
        r.timer = at == null ? null : setTimeout(() => r.room.wake(), Math.max(0, at - Date.now()));
        r.timer?.unref?.();
      },
      report: (room, live, usage) => stats.report(room, live, usage),
      analytics,
    });
    rooms.set(id, r);
    return r;
  }

  // What the dev tools change a match through, the same way a move does.
  const matches = {
    get: async (id) => roomFor(id).room.snapshot(),
    update: async (id, fn) => roomFor(id).room.update(fn),
    setPresence: async (id, token) => roomFor(id).room.markOnline(token),
  };

  const admin = createAdmin({ stats, storage: 'memory' });
  const dev = devTools() ? createDevHandler(matches, MATCH_ID) : null;
  const server = http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/api/admin') {
      const { status, body } = await admin({ method: req.method, authorization: req.headers.authorization, address: req.socket.remoteAddress });
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(body));
    }
    if (p === '/api/id') {
      let body = '';
      for await (const chunk of req) if (body.length < 100) body += chunk;
      const { status, cookie } = saveId({
        method: req.method,
        fetchSite: req.headers['sec-fetch-site'],
        origin: req.headers.origin,
        host: req.headers.host,
        secure: false,
        body,
      });
      res.writeHead(status, cookie ? { 'set-cookie': cookie, 'cache-control': 'no-store' } : {});
      return res.end();
    }
    if (dev && (p === '/api/dev' || p.startsWith('/api/dev/'))) return dev(req, res);
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const id = matchIdFrom(req.url);
    if (!id) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => (ws.isAlive = true));
      const r = roomFor(id);
      const conn = {
        id: String(++lastConn),
        state: null,
        setState(state) {
          return (this.state = state);
        },
        send: (text) => ws.readyState === 1 && ws.send(text),
      };
      r.conns.set(conn.id, conn);
      r.room.connect(conn);
      ws.on('message', (raw) => {
        ws.isAlive = true; // client pings count too
        r.room.message(conn, raw.toString());
      });
      ws.on('close', () => {
        r.conns.delete(conn.id);
        r.room.close(conn);
      });
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

  return { server, rooms, records, stats, matches };
}
