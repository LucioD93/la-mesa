// Connects WebSocket clients to matches in a store. Each server instance keeps
// only its own sockets; match state and change notifications go through the
// store, so players on different instances still share a match.
import { MoveError } from './game.js';
import { PRESENCE_REFRESH_MS, LEAVE_GRACE_MS } from './store.js';

export function createHub(store) {
  /** id -> { conns: Set<{ws, token}>, ready, unsub, timer, autoKey, onlineKey } */
  const rooms = new Map();

  const send = (ws, data) => ws.readyState === 1 && ws.send(JSON.stringify(data));
  const onlineKey = (online) => [...online].sort().join(',');
  const log = (id) => (err) => console.error(`[${id}]`, err);

  function room(id) {
    let r = rooms.get(id);
    if (!r) {
      r = { conns: new Set(), unsub: null, timer: null, autoKey: null, onlineKey: '' };
      r.ready = store.subscribe(id, (match, online) => fanout(id, match, online)).then((u) => (r.unsub = u));
      rooms.set(id, r);
    }
    return r;
  }

  function fanout(id, match, online) {
    const r = rooms.get(id);
    if (!r) return;
    r.onlineKey = onlineKey(online);
    for (const c of r.conns) if (c.token) send(c.ws, match.stateFor(c.token, online));
    scheduleAuto(id, match);
  }

  // Bots and forced passes. Every instance with players in the match schedules
  // the move; the turn key makes duplicates harmless (only the first applies).
  function scheduleAuto(id, match) {
    const r = rooms.get(id);
    const p = match.pendingAuto();
    if (!p) {
      clearTimeout(r.timer);
      r.autoKey = null;
      return;
    }
    if (r.autoKey === p.key) return;
    clearTimeout(r.timer);
    r.autoKey = p.key;
    r.timer = setTimeout(() => {
      r.autoKey = null;
      store.update(id, (m) => m.runAuto(p.key)).catch(log(id));
    }, p.delay);
  }

  // Keep presence fresh, notice players that dropped, and free their lobby seats.
  setInterval(() => {
    for (const [id, r] of rooms) {
      const tokens = new Set([...r.conns].map((c) => c.token).filter(Boolean));
      Promise.all([...tokens].map((t) => store.setPresence(id, t)))
        .then(() => store.update(id, (m, online) => m.cleanupLobby(online)))
        .then(({ match, online, changed }) => {
          // Presence-only changes are not published; refresh our own clients.
          if (!changed && onlineKey(online) !== r.onlineKey) fanout(id, match, online);
        })
        .catch(log(id));
    }
  }, PRESENCE_REFRESH_MS).unref?.();

  function connect(ws, id) {
    const conn = { ws, token: null };
    const r = room(id);
    r.conns.add(conn);
    // Handle one message at a time per socket so moves keep their order.
    let queue = r.ready;

    const onMessage = async (msg) => {
      if (!conn.token) {
        if (msg.t !== 'hello' || !msg.token) return;
        conn.token = String(msg.token).slice(0, 64);
        await store.setPresence(id, conn.token);
        await store.update(id, (m) => m.join(conn.token, msg.name));
        return;
      }
      try {
        await store.update(id, (m, online) => m.handle(conn.token, msg, online));
      } catch (err) {
        if (err instanceof MoveError) send(ws, { t: 'error', message: err.message });
        else throw err;
      }
    };

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') return send(ws, { t: 'pong' });
      queue = queue.then(() => onMessage(msg)).catch(log(id));
    });

    ws.on('close', () => {
      r.conns.delete(conn);
      const token = conn.token;
      queue = queue
        .then(async () => {
          if (token && ![...r.conns].some((c) => c.token === token)) {
            await store.setPresence(id, token, LEAVE_GRACE_MS);
          }
          if (!r.conns.size && rooms.get(id) === r) {
            rooms.delete(id);
            clearTimeout(r.timer);
            await r.unsub?.();
          }
        })
        .catch(log(id));
    });
  }

  return { connect, rooms };
}
