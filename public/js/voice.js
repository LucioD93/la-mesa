// Voice chat for everyone in the match: a full mesh of peer-to-peer WebRTC
// audio connections. The server only relays signaling messages
// ({t: 'voice', to?, data}); audio never goes through it.
//
// Joining broadcasts `join`; everyone already in voice answers with `hello`.
// For each pair, only the peer with the smaller id makes the offer (and later
// ICE restarts), so offers never collide.
//
// Out of voice we still follow who is in it, to offer joining: on connect we
// broadcast `who` and everyone in voice answers `here`; after that `join`,
// `meta`, `leave` and `bye` keep the list current.

const SPEAK_LEVEL = 0.04; // RMS above this counts as talking
const SPEAK_HOLD_MS = 350; // keep the indicator on through short pauses

/**
 * @param {{ send: (msg: object) => void, onChange: () => void, onJoin: (name: string) => void, onRoster?: (kind: string) => void }} hooks
 */
export function createVoice({ send, onChange, onJoin, onRoster = () => {} }) {
  let me = null; // my peer id for the current socket
  let iceServers = [];
  let joined = false;
  let muted = false;
  let stream = null; // my microphone (null when listening only)
  let meta = { seat: -1, name: '' };
  const peers = new Map(); // peer id -> peer
  const roster = new Map(); // peer id -> { seat, name, muted } for everyone else in voice, followed even when we're out
  let audioCtx = null;
  let meter = null; // { analyser, buf, lastLoud } for my mic
  let selfSpeaking = false;
  let meterTimer = null;

  const signal = (to, data) => send({ t: 'voice', to, data });
  const myMeta = () => ({ seat: meta.seat, name: meta.name, muted });

  // ---- peers -------------------------------------------------------------------

  function peerFor(id) {
    let p = peers.get(id);
    if (!p) {
      p = { id, pc: null, seat: -1, name: '', muted: false, speaking: false, audio: null, meter: null, chain: Promise.resolve() };
      peers.set(id, p);
    }
    return p;
  }

  const isInitiator = (p) => me < p.id;

  function createPc(p) {
    const pc = new RTCPeerConnection({ iceServers });
    p.pc = pc;
    pc.onicecandidate = (e) => e.candidate && signal(p.id, { kind: 'ice', candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => attachAudio(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') p.restarted = false;
      if (pc.connectionState !== 'failed') return;
      // The initiator tries one ICE restart; if that fails too, give up on the peer.
      if (isInitiator(p) && !p.restarted) {
        p.restarted = true;
        pc.restartIce();
      } else setTimeout(() => p.pc === pc && pc.connectionState === 'failed' && closePeer(p.id), 10_000);
    };
    if (isInitiator(p)) {
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription();
          signal(p.id, { kind: 'sdp', sdp: pc.localDescription.toJSON() });
        } catch (err) {
          console.warn('voice offer failed', err);
        }
      };
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
      else pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    return pc;
  }

  function attachAudio(p, remote) {
    if (!p.audio) {
      p.audio = document.createElement('audio');
      p.audio.autoplay = true;
      p.audio.setAttribute('playsinline', '');
      p.audio.hidden = true;
      document.body.append(p.audio);
    }
    if (p.audio.srcObject !== remote) {
      p.audio.srcObject = remote;
      p.audio.play().catch(() => {});
      p.meter = makeMeter(remote);
    }
  }

  function closePeer(id) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    p.pc?.close();
    p.audio?.remove();
    p.meter?.source.disconnect();
    onChange();
  }

  // Handle one peer's messages in order (ICE must wait for its description).
  function receive(from, data) {
    if (!me || !data || typeof data !== 'object') return;
    follow(from, data);
    if (!joined || data.kind === 'who' || data.kind === 'here') return;
    if (data.kind === 'bye' || data.kind === 'leave') return closePeer(from);
    const p = peerFor(from);
    p.chain = p.chain.then(() => step(p, data)).catch((err) => console.warn('voice signal failed', err));
  }

  async function step(p, data) {
    if (peers.get(p.id) !== p) return; // hung up meanwhile
    switch (data.kind) {
      case 'join':
      case 'hello': {
        setMeta(p, data);
        if (data.kind === 'join') {
          signal(p.id, { kind: 'hello', ...myMeta() });
          onJoin(p.name);
        }
        if (isInitiator(p) && !p.pc) createPc(p);
        onChange();
        break;
      }
      case 'meta':
        setMeta(p, data);
        onChange();
        break;
      case 'sdp': {
        const desc = data.sdp;
        if (desc?.type === 'offer') {
          if (isInitiator(p)) return; // the other side should never offer
          const fresh = !p.pc;
          const pc = p.pc || createPc(p);
          await pc.setRemoteDescription(desc);
          if (fresh && stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
          await pc.setLocalDescription();
          signal(p.id, { kind: 'sdp', sdp: pc.localDescription.toJSON() });
        } else if (desc?.type === 'answer' && p.pc?.signalingState === 'have-local-offer') {
          await p.pc.setRemoteDescription(desc);
        }
        break;
      }
      case 'ice':
        if (p.pc && data.candidate) await p.pc.addIceCandidate(data.candidate).catch(() => {});
        break;
    }
  }

  /** Keep the roster: only people in voice send join, hello, here and meta. */
  function follow(from, data) {
    const { kind } = data;
    if (kind === 'who') {
      if (joined) signal(from, { kind: 'here', ...myMeta() });
      return;
    }
    if (kind === 'join' || kind === 'hello' || kind === 'here' || kind === 'meta') {
      const known = roster.get(from) ?? { seat: -1, name: '', muted: false };
      roster.set(from, setMeta(known, data));
    } else if (kind === 'bye' || kind === 'leave') {
      if (!roster.delete(from)) return;
    } else return;
    onRoster(kind);
  }

  function setMeta(p, data) {
    if (Number.isInteger(data.seat)) p.seat = data.seat;
    if (typeof data.name === 'string') p.name = data.name.slice(0, 16);
    p.muted = !!data.muted;
    return p;
  }

  // ---- speaking indicator ---------------------------------------------------------

  function makeMeter(media) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(media);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      return { source, analyser, buf: new Float32Array(analyser.fftSize), lastLoud: 0 };
    } catch {
      return null;
    }
  }

  function loud(m, now) {
    if (!m) return false;
    m.analyser.getFloatTimeDomainData(m.buf);
    let sum = 0;
    for (const v of m.buf) sum += v * v;
    if (Math.sqrt(sum / m.buf.length) > SPEAK_LEVEL) m.lastLoud = now;
    return now - m.lastLoud < SPEAK_HOLD_MS;
  }

  function tick() {
    const now = performance.now();
    let changed = false;
    const self = !muted && loud(meter, now);
    if (self !== selfSpeaking) (selfSpeaking = self), (changed = true);
    for (const p of peers.values()) {
      const s = !p.muted && loud(p.meter, now);
      if (s !== p.speaking) (p.speaking = s), (changed = true);
    }
    if (changed) onChange();
  }

  // ---- public ---------------------------------------------------------------------

  /** The server gave this socket a peer id (first connect or after a reconnect). */
  function setConfig(config) {
    const moved = config.peer !== me; // a planned socket handover keeps the same id
    me = config.peer;
    iceServers = Array.isArray(config.iceServers) ? config.iceServers : [];
    if (!moved) return;
    // We may have missed people leaving while disconnected; ask again (joining asks too).
    if (roster.size) {
      roster.clear();
      onRoster('reset');
    }
    if (!joined) return signal(null, { kind: 'who' });
    // Our old peer id is gone; everyone hung up on it. Start over.
    for (const id of [...peers.keys()]) closePeer(id);
    signal(null, { kind: 'join', ...myMeta() });
  }

  /**
   * Without a microphone (blocked, missing, or plain-http page) we still join
   * and just listen.
   * @returns {Promise<'ok' | 'blocked' | 'noMic'>}
   */
  let joining = null;
  function join() {
    if (joined) return Promise.resolve('ok');
    joining ??= start().finally(() => (joining = null));
    return joining;
  }

  async function start() {
    let result = 'ok';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      stream = null;
      result = err?.name === 'NotAllowedError' ? 'blocked' : 'noMic';
    }
    joined = true;
    muted = !stream;
    meter = stream && makeMeter(stream);
    meterTimer = setInterval(tick, 120);
    if (me) signal(null, { kind: 'join', ...myMeta() });
    onChange();
    return result;
  }

  function leave() {
    if (!joined) return;
    signal(null, { kind: 'leave' });
    joined = false;
    for (const id of [...peers.keys()]) closePeer(id);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    meter?.source.disconnect();
    meter = null;
    selfSpeaking = false;
    clearInterval(meterTimer);
    onChange();
  }

  function setMuted(value) {
    if (!joined || !stream) return;
    muted = value;
    for (const track of stream.getAudioTracks()) track.enabled = !muted;
    signal(null, { kind: 'meta', ...myMeta() });
    onChange();
  }

  /** Keep peers' labels right when I change seats or rename. */
  function updateMeta(next) {
    if (next.seat === meta.seat && next.name === meta.name) return;
    meta = { seat: next.seat, name: next.name };
    if (joined && me) signal(null, { kind: 'meta', ...myMeta() });
  }

  /** seat -> { muted, speaking } for everyone in voice who is seated (me included). Out of voice, nobody is heard talking. */
  function bySeat() {
    const out = new Map();
    if (!joined) {
      for (const p of roster.values()) if (p.seat >= 0) out.set(p.seat, { muted: p.muted, speaking: false });
      return out;
    }
    for (const p of peers.values()) {
      if (p.seat >= 0 && p.pc) out.set(p.seat, { muted: p.muted, speaking: p.speaking });
    }
    if (meta.seat >= 0) out.set(meta.seat, { muted, speaking: selfSpeaking });
    return out;
  }

  return {
    join,
    leave,
    setMuted,
    setConfig,
    receive,
    updateMeta,
    bySeat,
    get joined() {
      return joined;
    },
    get muted() {
      return muted;
    },
    get canTalk() {
      return !!stream;
    },
    /** Everyone else in voice: [{ seat, name, muted }], in the order they joined. */
    get others() {
      return [...roster.values()];
    },
    /** How many other people I'm connected to. */
    get count() {
      return [...peers.values()].filter((p) => p.pc).length;
    },
  };
}
