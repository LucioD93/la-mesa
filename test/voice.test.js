import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/app.js';
import { createVoice } from '../public/js/voice.js';

// Voice chat signaling: the server relays {t: 'voice'} messages between
// connections in the same match and never leaks player tokens.

async function client(port, match, token, session) {
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
  ws.send(JSON.stringify({ t: 'hello', token, name: token, session }));
  const next = (pred) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve) => waiters.push({ pred, resolve }));
  };
  const config = await next((m) => m.t === 'voiceConfig');
  return { ws, next, inbox, peer: config.peer, config, send: (m) => ws.send(JSON.stringify(m)) };
}

test('relays voice signaling within a match only', async (t) => {
  const { server } = createApp();
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

test('a socket handover keeps the voice id and does not hang up', async (t) => {
  const { server } = createApp();
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  t.after(() => server.close());

  const a = await client(port, 'room-1', 'token-a', 'session-1');
  const b = await client(port, 'room-1', 'token-b');
  const a2 = await client(port, 'room-1', 'token-a', 'session-1');
  t.after(() => [a, b, a2].forEach((x) => x.ws.terminate()));

  assert.equal(a2.peer, a.peer);

  // Same session, different token: the id can't be claimed by someone else.
  const other = await client(port, 'room-1', 'token-x', 'session-1');
  t.after(() => other.ws.terminate());
  assert.notEqual(other.peer, a.peer);

  a.send({ t: 'handoff' });
  a.ws.close();
  await once(a.ws, 'close');
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!b.inbox.some((m) => m.t === 'voice' && m.data.kind === 'bye'));

  // Still online, and signaling for that id now reaches the new socket.
  const state = await (b.send({ t: 'rename', name: 'B' }), b.next((m) => m.t === 'state' && m.seats[1]?.name === 'B'));
  assert.equal(state.seats[0].online, true);
  b.send({ t: 'voice', to: a.peer, data: { kind: 'hello' } });
  assert.equal((await a2.next((m) => m.t === 'voice')).from, b.peer);

  // A real drop still hangs up.
  a2.ws.close();
  const bye = await b.next((m) => m.t === 'voice' && m.data.kind === 'bye');
  assert.equal(bye.from, a.peer);
});

test('relays player photos without storing them', async (t) => {
  const { server, records } = createApp();
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  t.after(() => server.close());

  const a = await client(port, 'room-1', 'token-a');
  const b = await client(port, 'room-1', 'token-b');
  const c = await client(port, 'room-2', 'token-c');
  t.after(() => [a, b, c].forEach((x) => x.ws.terminate()));

  const image = 'data:image/jpeg;base64,AAAA';
  const seats = (await b.next((m) => m.t === 'state' && m.seats[1])).seats;
  assert.notEqual(seats[0].pid, seats[1].pid);
  assert.match(seats[0].pid, /^[0-9a-f]{12}$/); // a hash, not the secret token

  // A photo reaches the others under the sender's seat id, with a peer to reply to.
  a.send({ t: 'avatar', image, ask: true });
  assert.deepEqual(await b.next((m) => m.t === 'avatar'), { t: 'avatar', peer: a.peer, from: seats[0].pid, image, ask: true });

  // The reply goes straight back.
  b.send({ t: 'avatar', to: a.peer, image: null });
  assert.deepEqual(await a.next((m) => m.t === 'avatar'), { t: 'avatar', peer: b.peer, from: seats[1].pid, image: null, ask: false });

  // Anything but a JPEG data URL is dropped, so it can't reach another player's page.
  a.send({ t: 'avatar', image: 'javascript:alert(1)' });
  a.send({ t: 'avatar', image: 'data:image/svg+xml;base64,AAAA' });
  a.send({ t: 'avatar', image: `data:image/jpeg;base64,${'A'.repeat(12_000)}` });

  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!b.inbox.some((m) => m.t === 'avatar'));
  assert.ok(!c.inbox.some((m) => m.t === 'avatar'));
  assert.ok(records.size && ![...records.values()].some((raw) => raw.includes('image/jpeg')));
});

test('follows who is in voice while out of it', () => {
  const sent = [];
  const kinds = [];
  const voice = createVoice({ send: (m) => sent.push(m), onChange() {}, onJoin() {}, onRoster: (k) => kinds.push(k) });

  // Connecting asks who is in voice; members answer `here`.
  voice.setConfig({ peer: 'aaa', iceServers: [] });
  assert.deepEqual(sent, [{ t: 'voice', to: null, data: { kind: 'who' } }]);
  voice.receive('bbb', { kind: 'here', seat: 1, name: 'Ana', muted: false });
  assert.deepEqual(voice.others, [{ seat: 1, name: 'Ana', muted: false }]);

  // Joins, mutes and hang-ups keep the list current; others' signaling doesn't add anyone.
  voice.receive('ccc', { kind: 'join', seat: -1, name: 'Luis', muted: false });
  voice.receive('bbb', { kind: 'meta', seat: 1, name: 'Ana', muted: true });
  voice.receive('ddd', { kind: 'who' });
  voice.receive('eee', { kind: 'bye' });
  assert.deepEqual(voice.others.map((p) => p.name), ['Ana', 'Luis']);
  assert.deepEqual([...voice.bySeat()], [[1, { muted: true, speaking: false }]]);
  voice.receive('ccc', { kind: 'leave' });
  voice.receive('bbb', { kind: 'bye' });
  assert.deepEqual(voice.others, []);
  assert.deepEqual(kinds, ['here', 'join', 'meta', 'leave', 'bye']);

  // Out of voice we don't answer `who`; a reconnect forgets everyone and asks again.
  assert.equal(sent.length, 1);
  voice.receive('bbb', { kind: 'here', seat: 1, name: 'Ana' });
  voice.setConfig({ peer: 'fff', iceServers: [] });
  assert.deepEqual(voice.others, []);
  assert.equal(kinds.at(-1), 'reset');
  assert.deepEqual(sent.at(-1), { t: 'voice', to: null, data: { kind: 'who' } });
});
