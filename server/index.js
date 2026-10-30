import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Match } from './match.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const MATCH_ID = /^[a-z0-9-]{3,40}$/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

/** @type {Map<string, Match>} */
const matches = new Map();

function getMatch(id) {
  const key = id.toLowerCase();
  let m = matches.get(key);
  if (!m) {
    m = new Match(key, {
      onIdle: (match) => {
        match.dispose();
        matches.delete(match.id);
      },
    });
    matches.set(key, m);
  }
  return m;
}

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/' || p === '/index.html') return sendFile(res, path.join(PUBLIC, 'index.html'));
  const play = p.match(/^\/play\/([^/]+)\/?$/);
  if (play) {
    if (!MATCH_ID.test(play[1])) {
      res.writeHead(302, { location: '/' });
      return res.end();
    }
    return sendFile(res, path.join(PUBLIC, 'play.html'));
  }
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
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (req, socket, head) => {
  const m = new URL(req.url, 'http://x').pathname.match(/^\/ws\/([^/]+)$/);
  if (!m || !MATCH_ID.test(m[1])) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, getMatch(m[1])));
});

function onConnection(ws, match) {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  let joined = false;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === 'ping') return ws.send('{"t":"pong"}');
    if (!joined) {
      if (msg.t !== 'hello' || !msg.token) return;
      joined = true;
      return match.join(ws, msg.token, msg.name);
    }
    try {
      match.handle(ws, msg);
    } catch (err) {
      console.error(`[${match.id}]`, err);
    }
  });
  ws.on('close', () => joined && match.leave(ws));
}

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

server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  console.log(`Domino running on http://localhost:${PORT}`);
  if (lan) console.log(`On your phone (same Wi-Fi): http://${lan.address}:${PORT}`);
});
