// One match's room: its sockets, its state, and the timers that play the bots and mock
// slow players. Exactly one copy of a room runs at a time (a Durable Object on Cloudflare,
// or the Node server locally), so it changes the match in memory, one message at a time.
//
// The host gives the room what differs between the two (see server/app.js and worker/):
//   load()            the record last saved, or undefined
//   save(record)      keep it; on Cloudflare the room may sleep and wake up from it
//   forget()          drop the record: nobody came back for a day
//   connections()     the open sockets: { id, state, setState(s), send(text) }
//   wakeAt(ms|null)   call wake() at this time (the earliest timer), or never
//   report(id, live, usage)  who's here and the usage counters, for the admin page
//   analytics         optional: where match events go and flags come from (server/analytics.js); POSTHOG_KEY's by default
import { createHash, randomBytes } from 'node:crypto';
import { MoveError } from './games/common.js';
import { FLAGGED, gameRules, isGame } from './games/index.js';
import { Match, SLOW_TURN_MS, publicId } from './match.js';
import { createAnalytics, glance } from './analytics.js';
import { timeScale } from './dev/config.js';

export const MATCH_ID = /^[a-z0-9-]{3,40}$/;

/** Match id from `/api/ws?match=<id>` (or the older `/ws/<id>`). */
export function matchIdFrom(reqUrl) {
  const url = new URL(reqUrl, 'http://x');
  const id = (url.searchParams.get('match') || url.pathname.match(/^\/ws\/([^/]+)$/)?.[1] || '').toLowerCase();
  return MATCH_ID.test(id) ? id : null;
}

// Voice chat is peer-to-peer WebRTC; the room only relays the signaling
// (offers, answers, ICE candidates) between connections in the same match.
const VOICE_MAX_BYTES = 12_000; // an SDP offer is a few KB
const VOICE_RATE = 120; // signaling messages per connection per 10s (ICE trickles a burst)

// Player photos live on each device. They pass through here like voice signaling
// and are never written to the match or the record.
const AVATAR_MAX_BYTES = 12_000;
const AVATAR_IMAGE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

export const LEAVE_GRACE_MS = 20_000; // keep "online" briefly so a reload or network blip doesn't free the seat
export const PRESENCE_MS = 40_000; // how long the dev tools' scenario players count as online
const FLUSH_MS = 60_000; // usage counters go to the stats at most this long after they start
const LIVE_MS = 10 * 60_000; // who's here is reported again this often (the stats forget after 15 minutes)
const MATCH_TTL_MS = 24 * 60 * 60_000; // forget a match nobody has opened for a day
const FLAGS_MS = 5 * 60_000; // how long a match goes by PostHog's answer about its feature flags
const FLAGS_RETRY_MS = 30_000; // asking again after no answer
// An alarm can fire a moment before its time. Whatever is due that soon runs now: set
// again for the same time, the alarm would count as the one that just ran, and never fire.
const WAKE_EARLY_MS = 50;

export const usageDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** STUN/TURN servers for the browser. Set ICE_SERVERS to a JSON array to add TURN. */
export function iceServers() {
  try {
    if (process.env.ICE_SERVERS) return JSON.parse(process.env.ICE_SERVERS);
  } catch {
    console.error('ICE_SERVERS is not valid JSON; using the default STUN server');
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

const fresh = (id, saved) => ({
  match: new Match(id, saved?.match ?? null),
  auto: saved?.auto ?? null, // { key, at }: the bot move or forced pass due
  hurry: saved?.hurry ?? null, // { key, at }: the human the table waits on; `at` is null once mocked
  away: saved?.away ?? {}, // token -> until: just left (or put online by the dev tools)
  usage: saved?.usage ?? {}, // day -> { field: n } not sent to the stats yet
  flushAt: saved?.flushAt ?? null,
  live: saved?.live ?? { online: 0, voice: 0 }, // what the stats were last told
  liveAt: saved?.liveAt ?? null,
  expireAt: saved?.expireAt ?? null,
  onlineKey: saved?.onlineKey ?? '', // who the players were last shown as online
  joined: saved?.joined ?? {}, // token -> 1: reported to analytics as joined, until they leave for good
  flagsDue: saved?.flagsDue ?? null, // when to ask PostHog about the feature flags again; null: never asked
});

export function createRoom(id, host) {
  let rec = fresh(id, host.load());
  let dirty = false; // the record changed since it was saved
  let depth = 0;
  const budgets = new Map(); // connection id -> voice/photo messages left; resets if the room sleeps
  const log = (err) => console.error(`[${id}]`, err);
  const analytics = host.analytics ?? createAnalytics();

  // ---- plumbing ------------------------------------------------------------------

  /** Run one event, then save what changed and set the next wake-up. */
  function run(fn) {
    depth++;
    try {
      return fn();
    } finally {
      if (--depth === 0) {
        if (dirty) host.save({ ...rec, match: rec.match.toJSON() });
        dirty = false;
        host.wakeAt(nextWake());
      }
    }
  }

  const open = () => [...host.connections()].filter((c) => c.state && !c.state.closed);
  const patch = (conn, fields) => conn.setState({ ...conn.state, ...fields });
  const onlineKey = (online) => [...online].sort().join(',');

  function online(now = Date.now()) {
    const tokens = new Set(open().map((c) => c.state.token).filter(Boolean));
    for (const [token, until] of Object.entries(rec.away)) if (until > now) tokens.add(token);
    return tokens;
  }

  function count(fields) {
    const day = (rec.usage[usageDay()] ??= {});
    for (const [field, n] of Object.entries(fields)) day[field] = (day[field] || 0) + n;
    // An empty room keeps its counters until the next report rather than waking up for them.
    if (rec.flushAt == null && open().length) {
      rec.flushAt = Date.now() + FLUSH_MS;
      dirty = true;
    }
  }

  function sendText(conn, text) {
    count({ socketOut: text.length });
    conn.send(text);
  }
  const send = (conn, data) => sendText(conn, JSON.stringify(data));

  function nextWake() {
    const times = [rec.auto?.at, rec.hurry?.at, ...Object.values(rec.away), rec.flushAt, rec.liveAt, rec.expireAt];
    const due = times.filter((t) => t != null);
    return due.length ? Math.min(...due) : null;
  }

  // ---- the match -------------------------------------------------------------------

  /** Countries of everyone connected, for analytics. */
  const countries = () => [...new Set(open().map((c) => c.state.country).filter(Boolean))].sort();

  /**
   * Apply `fn` to a copy of the match; if it says it changed, keep it and show everyone.
   * `conn` is whoever caused it, whose country the analytics events carry.
   */
  function update(fn, conn = null) {
    return run(() => {
      const now = online();
      const before = glance(rec.match);
      const next = new Match(id, JSON.parse(JSON.stringify(rec.match)));
      const changed = fn(next, now);
      if (!changed) return { match: next, online: now, changed };
      next.v += 1;
      rec.match = next;
      dirty = true;
      count({ saves: 1 });
      if (analytics.enabled) analytics.changed(before, next, conn?.state.country ?? null, countries());
      fanout();
      return { match: next, online: now, changed };
    });
  }

  /** Everyone's personalized view. Players in one seat, and every spectator, see the same. */
  function fanout() {
    const now = online();
    rec.onlineKey = onlineKey(now);
    const views = new Map(); // seat -> JSON
    for (const c of open()) {
      const { token, games } = c.state;
      if (!token) continue;
      // A tab from an older deploy can't draw a game added since. It shows `error` as a toast.
      if (!games.includes(rec.match.game)) {
        send(c, { t: 'error', message: 'Reload the page to keep playing' });
        continue;
      }
      const seat = rec.match.seatOf(token);
      if (!views.has(seat)) views.set(seat, JSON.stringify(rec.match.stateFor(token, now)));
      sendText(c, views.get(seat));
    }
    plan();
  }

  // Bots and forced passes, and mocking a human who takes too long. Nothing runs
  // while nobody is connected; the first one back starts the clocks again.
  function plan() {
    const before = JSON.stringify([rec.auto, rec.hurry]);
    const people = open().some((c) => c.state.token);
    const now = Date.now();
    const p = people ? rec.match.pendingAuto() : null;
    if (!p) rec.auto = null;
    else if (rec.auto?.key !== p.key) rec.auto = { key: p.key, at: now + p.delay * timeScale() };
    const w = people ? rec.match.waitingOn() : null;
    const key = w?.key ?? null;
    // Reactions and presence don't restart the clock; a new moment does.
    if (key !== (rec.hurry?.key ?? null)) {
      rec.hurry = key == null ? null : { key, at: rec.match.hurried === key ? null : now + (rec.match.rules.slowTurnMs ?? SLOW_TURN_MS) * timeScale() };
    }
    if (JSON.stringify([rec.auto, rec.hurry]) !== before) dirty = true;
  }

  /** Someone came or went for good: free their lobby seat, and show the change. */
  function presenceChanged() {
    const { changed, online: now } = update((m, people) => m.cleanupLobby(people));
    if (!changed && onlineKey(now) !== rec.onlineKey) fanout();
    report();
  }

  // ---- feature flags ---------------------------------------------------------------

  // Without PostHog (local dev, tests, sims) every game is offered.
  const flagsOn = () => analytics.enabled && !!analytics.flags && FLAGGED.length > 0;

  /**
   * A game behind a flag is offered once PostHog says its flag is on for this match. Until
   * the answer comes, or if it never does, it isn't. Asked in the lobby, where the game is
   * picked, at most every few minutes. A flag can target the match id (`match`).
   */
  function checkFlags() {
    if (!flagsOn() || rec.match.phase !== 'lobby') return;
    if (rec.flagsDue != null && Date.now() < rec.flagsDue) return;
    rec.flagsDue = Date.now() + FLAGS_RETRY_MS; // one question at a time
    dirty = true;
    analytics.flags(id, { match: id }).then(
      (on) =>
        run(() => {
          rec.flagsDue = Date.now() + FLAGS_MS;
          dirty = true;
          update((m) => m.hideGames(FLAGGED.filter((g) => !on[gameRules(g).flag])));
        }),
      (err) => log(err),
    );
  }

  // ---- the admin page --------------------------------------------------------------

  /** Tell the stats who's here (when it changed, or `force`), with the usage counted so far. */
  function report(force = false) {
    const people = open();
    const voice = new Set(people.filter((c) => c.state.token && c.state.inVoice).map((c) => c.state.peer)).size;
    const live = { online: online().size, voice };
    if (!force && live.online === rec.live.online && live.voice === rec.live.voice) return;
    const usage = rec.usage;
    rec.usage = {};
    rec.flushAt = null;
    rec.live = live;
    rec.liveAt = people.length ? Date.now() + LIVE_MS : null;
    dirty = true;
    try {
      host.report(id, live, usage);
    } catch (err) {
      log(err);
    }
  }

  // ---- sockets ---------------------------------------------------------------------

  /** `country` is where the host saw the socket come from (a code from countryOf), if it knows. */
  function connect(conn, country = null) {
    run(() => {
      // `peer` is a public id for voice chat; the token stays secret.
      conn.setState({ peer: randomBytes(6).toString('hex'), country });
      rec.expireAt = null;
      dirty = true;
      count({ sockets: 1 });
    });
  }

  function spend(conn) {
    const now = Date.now();
    let b = budgets.get(conn.id);
    if (!b || now > b.reset) budgets.set(conn.id, (b = { left: VOICE_RATE, reset: now + 10_000 }));
    return b.left-- > 0;
  }

  /** Voice signaling and photos: to one peer (`to`) or everyone else in the match. */
  function relay(from, to, out) {
    const text = JSON.stringify(out);
    for (const c of open()) {
      if (c.state.token && c.state.peer !== from && (!to || to === c.state.peer)) sendText(c, text);
    }
  }

  function onVoice(conn, msg, size) {
    const { token, peer } = conn.state;
    if (!token || size > VOICE_MAX_BYTES || !msg.data || typeof msg.data !== 'object') return;
    if (msg.to != null && typeof msg.to !== 'string') return;
    if (!spend(conn)) return;
    if (msg.data.kind === 'join') {
      patch(conn, { inVoice: true });
      count({ voiceJoins: 1 });
      dirty = true; // joins are counted exactly, so keep this one even if the room sleeps
      analytics.capture('voice_joined', analytics.player(token), { match: id }, conn.state.country);
    } else if (msg.data.kind === 'leave') patch(conn, { inVoice: false });
    relay(peer, msg.to || null, { t: 'voice', from: peer, data: msg.data });
    report();
  }

  function onAvatar(conn, msg, size) {
    const { token, peer } = conn.state;
    if (!token || size > AVATAR_MAX_BYTES) return;
    if (msg.to != null && typeof msg.to !== 'string') return;
    if (msg.image != null && !(typeof msg.image === 'string' && AVATAR_IMAGE.test(msg.image))) return;
    if (!spend(conn)) return;
    relay(peer, msg.to || null, { t: 'avatar', peer, from: publicId(token), image: msg.image ?? null, ask: !!msg.ask });
  }

  function hello(conn, msg) {
    if (msg.t !== 'hello' || !msg.token) return;
    const token = String(msg.token).slice(0, 64);
    // A list of games now. `true` came from pages that knew two games, nothing from those that knew one.
    const games = Array.isArray(msg.games) ? msg.games.filter(isGame) : msg.games ? ['domino', 'truco'] : ['domino'];
    // A client handing over to a new socket keeps its voice id by sending the
    // same session. Hashing in the token means nobody else can claim that id.
    let { peer } = conn.state;
    if (typeof msg.session === 'string') {
      peer = createHash('sha256').update(`${token}:${msg.session.slice(0, 64)}`).digest('hex').slice(0, 12);
    }
    patch(conn, { token, games, peer, inVoice: !!msg.inVoice }); // a handover doesn't join voice again
    delete rec.away[token];
    dirty = true;
    // A match that hasn't heard from PostHog yet keeps its flagged games back.
    const unknown = flagsOn() && rec.flagsDue == null;
    const { match } = update((m) => {
      if (unknown) m.hideGames(FLAGGED);
      return m.join(token, msg.name, msg.game, msg.theme);
    }, conn);
    checkFlags();
    // Once per visit: a reload or a dropped connection doesn't count again, coming back later does.
    if (analytics.enabled && !rec.joined[token]) {
      rec.joined[token] = 1;
      const role = match.seatOf(token) !== -1 ? 'player' : 'spectator';
      analytics.capture('player_joined', analytics.player(token), { match: id, game: match.game, phase: match.phase, role }, conn.state.country);
    }
    send(conn, { t: 'voiceConfig', peer, iceServers: iceServers() });
    report();
  }

  function message(conn, raw) {
    run(() => {
      if (!conn.state || conn.state.closed) return;
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      count({ messages: 1, socketIn: text.length });
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') return send(conn, { t: 'pong' });
      if (msg.t === 'voice') return onVoice(conn, msg, text.length);
      if (msg.t === 'avatar') return onAvatar(conn, msg, text.length);
      // Tabs from before Cloudflare moved to a new socket every 4 minutes and said so first.
      if (msg.t === 'handoff') return patch(conn, { handoff: true });
      if (!conn.state.token) return hello(conn, msg);
      try {
        update((m, now) => m.handle(conn.state.token, msg, now), conn);
      } catch (err) {
        if (err instanceof MoveError) send(conn, { t: 'error', message: err.message });
        else log(err);
      }
    });
  }

  function close(conn) {
    run(() => {
      const st = conn.state;
      if (!st || st.closed) return;
      patch(conn, { closed: true });
      budgets.delete(conn.id);
      // After a handoff the player is still here, on another socket.
      const token = st.handoff ? null : st.token;
      // Tell voice peers to hang up on this connection.
      if (token) relay(st.peer, null, { t: 'voice', from: st.peer, data: { kind: 'bye' } });
      const rest = open().filter((c) => c.id !== conn.id);
      if (token && !rest.some((c) => c.state.token === token)) {
        rec.away[token] = Date.now() + LEAVE_GRACE_MS;
        dirty = true;
      }
      if (rest.length) return report();
      // The last one out: stop the clocks, send the counters, and forget the match in a day.
      rec.expireAt = Date.now() + MATCH_TTL_MS;
      plan();
      report(true);
    });
  }

  /** The time set with `wakeAt` came: run what is due. */
  function wake() {
    run(() => {
      const now = Date.now() + WAKE_EARLY_MS;
      count({ wakes: 1 });
      if (rec.auto && rec.auto.at <= now) {
        const { key } = rec.auto;
        rec.auto = null;
        dirty = true;
        try {
          update((m) => m.runAuto(key));
        } catch (err) {
          log(err);
        }
      }
      if (rec.hurry?.at != null && rec.hurry.at <= now) {
        const { key } = rec.hurry;
        rec.hurry = { key, at: null };
        dirty = true;
        try {
          update((m) => m.hurry(key));
        } catch (err) {
          log(err);
        }
      }
      let left = false;
      for (const [token, until] of Object.entries(rec.away)) {
        if (until > now) continue;
        delete rec.away[token];
        delete rec.joined[token];
        left = dirty = true;
      }
      if (left) presenceChanged();
      if (rec.liveAt != null && rec.liveAt <= now) report(true);
      else if (rec.flushAt != null && rec.flushAt <= now) report(true);
      if (rec.expireAt != null && rec.expireAt <= now && !open().length) {
        host.forget();
        rec = fresh(id, null);
        dirty = false;
      }
    });
  }

  return {
    connect,
    message,
    close,
    wake,
    update,
    /** The match as it is now, and who counts as online. */
    snapshot: () => ({ match: new Match(id, JSON.parse(JSON.stringify(rec.match))), online: online() }),
    /** Count `token` as online for a while without a socket (the dev tools' scenario players). */
    markOnline: (token, ms = PRESENCE_MS) =>
      run(() => {
        rec.away[token] = Math.max(rec.away[token] ?? 0, Date.now() + ms);
        dirty = true;
      }),
  };
}
