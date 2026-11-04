// Connects WebSocket clients to matches in a store. Each server instance keeps
// only its own sockets; match state and change notifications go through the
// store, so players on different instances still share a match.
import { createHash, randomBytes } from 'node:crypto';
import { MoveError } from './game.js';
import { publicId } from './match.js';
import { PRESENCE_REFRESH_MS, LEAVE_GRACE_MS } from './store.js';
import { createUsage } from './usage.js';

// Voice chat is peer-to-peer WebRTC; the server only relays the signaling
// (offers, answers, ICE candidates) between connections in the same match.
const VOICE_MAX_BYTES = 12_000; // an SDP offer is a few KB
const VOICE_RATE = 120; // signaling messages per connection per 10s (ICE trickles a burst)

// Player photos live on each device. They pass through here like voice signaling
// and are never written to the match or the store.
const AVATAR_MAX_BYTES = 12_000;
const AVATAR_IMAGE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

/** STUN/TURN servers for the browser. Set ICE_SERVERS to a JSON array to add TURN. */
export function iceServers() {
  try {
    if (process.env.ICE_SERVERS) return JSON.parse(process.env.ICE_SERVERS);
  } catch {
    console.error('ICE_SERVERS is not valid JSON; using the default STUN server');
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export function createHub(store) {
  /** id -> { conns: Set<{ws, token, peer}>, ready, unsub, timer, autoKey, onlineKey } */
  const rooms = new Map();
  const usage = createUsage(store);

  const send = (ws, data) => {
    if (ws.readyState !== 1) return;
    const json = JSON.stringify(data);
    usage.add({ socketOut: json.length });
    ws.send(json);
  };
  const onlineKey = (online) => [...online].sort().join(',');
  const log = (id) => (err) => console.error(`[${id}]`, err);

  function room(id) {
    let r = rooms.get(id);
    if (!r) {
      r = { conns: new Set(), unsub: null, timer: null, autoKey: null, onlineKey: '' };
      r.ready = store
        .subscribe(
          id,
          (match, online) => fanout(id, match, online),
          (sig) => relay(id, sig),
        )
        .then((u) => (r.unsub = u));
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

  // Voice signaling and photos: to one peer (`to`) or everyone else in the match.
  function relay(id, { from, to, data, avatar }) {
    const r = rooms.get(id);
    if (!r) return;
    const out = avatar ? { t: 'avatar', peer: from, ...avatar } : { t: 'voice', from, data };
    for (const c of r.conns) {
      if (c.token && c.peer !== from && (!to || to === c.peer)) send(c.ws, out);
    }
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
      for (const c of r.conns) if (c.inVoice) usage.voiceSeen(id, c.peer);
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
    // `peer` is a public id for voice chat; the token stays secret.
    const conn = { ws, token: null, peer: randomBytes(6).toString('hex') };
    const r = room(id);
    r.conns.add(conn);
    usage.add({ sockets: 1 });
    // Handle one message at a time per socket so moves keep their order.
    let queue = r.ready;
    let voiceQueue = r.ready; // separate so signaling isn't stuck behind match writes
    let voiceBudget = { left: VOICE_RATE, reset: Date.now() + 10_000 };

    const spendBudget = () => {
      const now = Date.now();
      if (now > voiceBudget.reset) voiceBudget = { left: VOICE_RATE, reset: now + 10_000 };
      return voiceBudget.left-- > 0;
    };

    const setInVoice = (inVoice) => {
      conn.inVoice = inVoice;
      if (inVoice) usage.voiceSeen(id, conn.peer);
      else usage.voiceGone(id, conn.peer);
    };

    const onVoice = (msg, size) => {
      if (!conn.token || size > VOICE_MAX_BYTES || !msg.data || typeof msg.data !== 'object') return;
      if (msg.to != null && typeof msg.to !== 'string') return;
      if (!spendBudget()) return;
      if (msg.data.kind === 'join') {
        usage.add({ voiceJoins: 1 });
        setInVoice(true);
      } else if (msg.data.kind === 'leave') setInVoice(false);
      const sig = { from: conn.peer, to: msg.to || null, data: msg.data };
      voiceQueue = voiceQueue.then(() => store.signal(id, sig)).catch(log(id));
    };

    const onAvatar = (msg, size) => {
      if (!conn.token || size > AVATAR_MAX_BYTES) return;
      if (msg.to != null && typeof msg.to !== 'string') return;
      if (msg.image != null && !(typeof msg.image === 'string' && AVATAR_IMAGE.test(msg.image))) return;
      if (!spendBudget()) return;
      const avatar = { from: publicId(conn.token), image: msg.image ?? null, ask: !!msg.ask };
      const sig = { from: conn.peer, to: msg.to || null, avatar };
      voiceQueue = voiceQueue.then(() => store.signal(id, sig)).catch(log(id));
    };

    const onMessage = async (msg) => {
      if (!conn.token) {
        if (msg.t !== 'hello' || !msg.token) return;
        conn.token = String(msg.token).slice(0, 64);
        // A client handing over to a new socket keeps its voice id by sending the
        // same session. Hashing in the token means nobody else can claim that id.
        if (typeof msg.session === 'string') {
          conn.peer = createHash('sha256').update(`${conn.token}:${msg.session.slice(0, 64)}`).digest('hex').slice(0, 12);
        }
        if (msg.inVoice) setInVoice(true); // a handover doesn't join voice again
        await store.setPresence(id, conn.token);
        await store.update(id, (m) => m.join(conn.token, msg.name));
        send(ws, { t: 'voiceConfig', peer: conn.peer, iceServers: iceServers() });
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
      usage.add({ socketIn: raw.length });
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') return send(ws, { t: 'pong' });
      if (msg.t === 'voice') return onVoice(msg, raw.length);
      if (msg.t === 'avatar') return onAvatar(msg, raw.length);
      if (msg.t === 'handoff') return void (conn.handoff = true);
      queue = queue.then(() => onMessage(msg)).catch(log(id));
    });

    ws.on('close', () => {
      r.conns.delete(conn);
      // After a handoff the player is still here, on another socket.
      const token = conn.handoff ? null : conn.token;
      if (token && conn.inVoice) usage.voiceGone(id, conn.peer);
      // Tell voice peers to hang up on this connection.
      if (token) {
        voiceQueue = voiceQueue
          .then(() => store.signal(id, { from: conn.peer, to: null, data: { kind: 'bye' } }))
          .catch(log(id));
      }
      queue = Promise.all([queue, voiceQueue])
        .then(async () => {
          if (token && ![...r.conns].some((c) => c.token === token)) {
            await store.setPresence(id, token, LEAVE_GRACE_MS);
          }
          if (!r.conns.size && rooms.get(id) === r) {
            rooms.delete(id);
            clearTimeout(r.timer);
            await r.unsub?.();
            await usage.flush(); // this instance may stop soon after its last socket
          }
        })
        .catch(log(id));
    });
  }

  return { connect, rooms, usage };
}
