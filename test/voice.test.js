import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';

// Voice chat signaling: the server relays {t: 'voice'} messages between
// connections in the same match and never leaks player tokens.

async function client(port, match, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?match=${match}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ t: 'hello', token, name: token }));
  const next = (pred) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve) => waiters.push({ pred, resolve }));
  };
  const config = await next((m) => m.t === 'voiceConfig');
  return { ws, next, inbox, peer: config.peer, config, send: (m) => ws.send(JSON.stringify(m)) };
}

test('relays voice signaling within a match only', async (t) => {
  const { server } = createApp({ store: new MemoryStore() });
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  t.after(() => server.close());

  const a = await client(port, 'room-1', 'token-a');
  const b = await client(port, 'room-1', 'token-b');
  const c = await client(port, 'room-2', 'token-c');
  t.after(() => [a, b, c].forEach((x) => x.ws.terminate()));

  assert.match(a.peer, /^[0-9a-f]{12}$/);
  assert.notEqual(a.peer, b.peer);
  assert.ok(Array.isArray(a.config.iceServers) && a.config.iceServers.length);

  // Broadcast reaches others in the match, with the sender's peer id (not token).
  a.send({ t: 'voice', data: { kind: 'join', seat: 0, name: 'A' } });
  const got = await b.next((m) => m.t === 'voice');
  assert.deepEqual(got, { t: 'voice', from: a.peer, data: { kind: 'join', seat: 0, name: 'A' } });
  assert.ok(!JSON.stringify(got).includes('token'));

  // Direct message reaches only its target.
  b.send({ t: 'voice', to: a.peer, data: { kind: 'hello' } });
  assert.equal((await a.next((m) => m.t === 'voice')).from, b.peer);

  // Hanging up tells the rest of the match.
  b.ws.close();
  const bye = await a.next((m) => m.t === 'voice' && m.data.kind === 'bye');
  assert.equal(bye.from, b.peer);

  // Nothing crossed into the other match, and the sender didn't get its own echo.
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!c.inbox.some((m) => m.t === 'voice'));
  assert.ok(!a.inbox.some((m) => m.t === 'voice' && m.from === a.peer));
});
