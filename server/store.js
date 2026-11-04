// Match storage + change notifications. MemoryStore for a single long-running
// server (local dev); RedisStore when several server instances must share
// matches (Vercel Functions).
import { EventEmitter } from 'node:events';
import { Match } from './match.js';

const MATCH_TTL_S = 60 * 60 * 24; // forget matches idle for a day
const PRESENCE_MS = 40_000; // a connection refreshes its presence every 15s
export const PRESENCE_REFRESH_MS = 15_000;
export const LEAVE_GRACE_MS = 20_000; // keep "online" briefly so a reload or network blip doesn't free the seat

const USAGE_TTL_S = 60 * 60 * 24 * 100; // daily usage counters outlive the 30 days the admin page shows

const onlineFrom = (entries, now = Date.now()) =>
  new Set(Object.entries(entries || {}).filter(([, exp]) => Number(exp) > now).map(([t]) => t));

/** Who is in voice now, from "<match>:<peer>" entries, plus how many matches have people online. */
function overview(voiceMembers, onlineCounts) {
  const rooms = new Map();
  for (const member of voiceMembers) {
    const match = member.split(':')[0];
    rooms.set(match, (rooms.get(match) || 0) + 1);
  }
  const voice = [...rooms].map(([match, people]) => ({ match, people })).sort((a, b) => b.people - a.people);
  const active = onlineCounts.filter((n) => n > 0);
  return { voice, matches: active.length, online: active.reduce((a, b) => a + b, 0) };
}

export class MemoryStore {
  constructor() {
    this.matches = new Map(); // id -> JSON string (serialized like Redis, so no shared mutation)
    this.presence = new Map(); // id -> { token: expiresAt }
    this.events = new EventEmitter().setMaxListeners(0);
    this.usage = new Map(); // day or 'total' -> { field: n }
    this.voiceLive = new Map(); // "<match>:<peer>" -> expiresAt
    this.fails = new Map(); // address -> { n, until }
  }

  async saveUsage(counts, live) {
    for (const [day, fields] of Object.entries(counts)) {
      for (const key of [day, 'total']) {
        if (!this.usage.has(key)) this.usage.set(key, {});
        const row = this.usage.get(key);
        for (const [field, n] of Object.entries(fields)) row[field] = (row[field] || 0) + n;
      }
    }
    for (const [member, until] of live) {
      if (until) this.voiceLive.set(member, until);
      else this.voiceLive.delete(member);
    }
  }

  async readUsage(days) {
    return {
      days: Object.fromEntries(days.map((d) => [d, this.usage.get(d) || {}])),
      total: this.usage.get('total') || {},
    };
  }

  async liveOverview(now = Date.now()) {
    const members = [...this.voiceLive].filter(([, until]) => until > now).map(([m]) => m);
    return overview(members, [...this.presence.values()].map((p) => onlineFrom(p, now).size));
  }

  async info() {
    return { type: 'memory', ok: true };
  }

  async failedLogins(address) {
    const f = this.fails.get(address);
    return f && f.until > Date.now() ? f.n : 0;
  }

  async addFailedLogin(address, ttlS) {
    this.fails.set(address, { n: (await this.failedLogins(address)) + 1, until: Date.now() + ttlS * 1000 });
  }

  online(id) {
    return onlineFrom(this.presence.get(id));
  }

  async get(id) {
    const raw = this.matches.get(id);
    return { match: new Match(id, raw ? JSON.parse(raw) : null), online: this.online(id) };
  }

  async update(id, fn) {
    const { match, online } = await this.get(id);
    const changed = fn(match, online);
    if (changed) {
      match.v += 1;
      this.matches.set(id, JSON.stringify(match));
      this.events.emit(id, new Match(id, JSON.parse(this.matches.get(id))), online);
    }
    return { match, online, changed };
  }

  async notify(id) {
    const { match, online } = await this.get(id);
    this.events.emit(id, match, online);
  }

  /** Fire-and-forget message for everyone in the match (voice chat signaling). */
  async signal(id, msg) {
    this.events.emit(`${id}:sig`, msg);
  }

  async subscribe(id, cb, onSignal) {
    this.events.on(id, cb);
    if (onSignal) this.events.on(`${id}:sig`, onSignal);
    return async () => {
      this.events.off(id, cb);
      if (onSignal) this.events.off(`${id}:sig`, onSignal);
    };
  }

  async setPresence(id, token, ms = PRESENCE_MS) {
    if (!this.presence.has(id)) this.presence.set(id, {});
    this.presence.get(id)[token] = Date.now() + ms;
  }
}

// Compare-and-set: only write if nobody else saved a newer version meanwhile.
const CAS = `
local cur = redis.call('GET', KEYS[2]) or '0'
if cur ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
return 1`;

export class RedisStore {
  /** @param {import('redis').RedisClientType} client */
  constructor(client) {
    this.client = client;
    this.sub = null;
    this.listeners = new Map(); // channel -> Set<cb>
  }

  static async connect(url) {
    const { createClient } = await import('redis');
    const client = createClient({ url });
    client.on('error', (e) => console.error('[redis]', e.message));
    await client.connect();
    return new RedisStore(client);
  }

  // Hash tags keep a match's keys in one slot (cluster-safe). The `domino:` prefix
  // predates truco and covers both games: renaming it would lose live matches and
  // the admin page's usage counters.
  keys(id) {
    return {
      m: `domino:{${id}}:m`,
      v: `domino:{${id}}:v`,
      p: `domino:{${id}}:p`,
      ch: `domino:{${id}}:ch`,
      sig: `domino:{${id}}:sig`,
    };
  }

  async get(id) {
    const k = this.keys(id);
    const [[raw, ver], presence] = await Promise.all([this.client.mGet([k.m, k.v]), this.client.hGetAll(k.p)]);
    const match = new Match(id, raw ? JSON.parse(raw) : null);
    match.v = Number(ver || 0);
    return { match, online: onlineFrom(presence) };
  }

  async update(id, fn) {
    const k = this.keys(id);
    for (let attempt = 0; attempt < 8; attempt++) {
      const { match, online } = await this.get(id);
      const prev = match.v;
      const changed = fn(match, online);
      if (!changed) return { match, online, changed };
      match.v = prev + 1;
      const json = JSON.stringify(match);
      const ok = await this.client.eval(CAS, {
        keys: [k.m, k.v],
        arguments: [String(prev), String(match.v), json, String(MATCH_TTL_S)],
      });
      if (ok === 1) {
        await this.publish(id, json, online);
        return { match, online, changed };
      }
      // Lost a race with another instance: reload and re-apply.
    }
    throw new Error(`could not save match ${id}`);
  }

  async publish(id, json, online) {
    await this.client.publish(this.keys(id).ch, JSON.stringify({ json, online: [...online] }));
  }

  async notify(id) {
    const { match, online } = await this.get(id);
    await this.publish(id, JSON.stringify(match), online);
  }

  /** Fire-and-forget message for everyone in the match (voice chat signaling). */
  async signal(id, msg) {
    await this.client.publish(this.keys(id).sig, JSON.stringify(msg));
  }

  async subscribe(id, cb, onSignal) {
    const { ch, sig } = this.keys(id);
    const unsubs = [
      await this.listen(ch, (message) => {
        const { json, online } = JSON.parse(message);
        cb(new Match(id, JSON.parse(json)), new Set(online));
      }),
    ];
    if (onSignal) unsubs.push(await this.listen(sig, (message) => onSignal(JSON.parse(message))));
    return async () => {
      for (const u of unsubs) await u();
    };
  }

  // One Redis subscription per channel, shared by every local listener.
  async listen(channel, fn) {
    if (!this.sub) {
      this.sub = this.client.duplicate();
      this.sub.on('error', (e) => console.error('[redis sub]', e.message));
      await this.sub.connect();
    }
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await this.sub.subscribe(channel, (message) => {
        for (const f of this.listeners.get(channel) ?? []) f(message);
      });
    }
    set.add(fn);
    return async () => {
      set.delete(fn);
      if (!set.size && this.listeners.get(channel) === set) {
        this.listeners.delete(channel);
        await this.sub.unsubscribe(channel);
      }
    };
  }

  async setPresence(id, token, ms = PRESENCE_MS) {
    const { p } = this.keys(id);
    await this.client.multi().hSet(p, token, String(Date.now() + ms)).expire(p, MATCH_TTL_S).exec();
  }

  // ---- admin page -------------------------------------------------------------

  async saveUsage(counts, live) {
    const tx = this.client.multi();
    for (const [day, fields] of Object.entries(counts)) {
      const key = `domino:usage:${day}`;
      for (const [field, n] of Object.entries(fields)) {
        tx.hIncrBy(key, field, n);
        tx.hIncrBy('domino:usage:total', field, n);
      }
      tx.expire(key, USAGE_TTL_S);
    }
    for (const [member, until] of live) {
      if (until) tx.zAdd('domino:voice:live', { score: until, value: member });
      else tx.zRem('domino:voice:live', member);
    }
    await tx.exec();
  }

  async readUsage(days) {
    const numbers = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
    const [total, ...rows] = await Promise.all([
      this.client.hGetAll('domino:usage:total'),
      ...days.map((d) => this.client.hGetAll(`domino:usage:${d}`)),
    ]);
    return {
      days: Object.fromEntries(days.map((d, i) => [d, numbers(rows[i])])),
      total: numbers(total),
    };
  }

  async liveOverview(now = Date.now()) {
    await this.client.zRemRangeByScore('domino:voice:live', '-inf', now);
    const members = await this.client.zRange('domino:voice:live', 0, -1);
    const keys = [];
    for await (const batch of this.client.scanIterator({ MATCH: 'domino:{*}:p', COUNT: 200 })) keys.push(...batch);
    const presence = await Promise.all(keys.map((k) => this.client.hGetAll(k)));
    return overview(members, presence.map((p) => onlineFrom(p, now).size));
  }

  async info() {
    const started = performance.now();
    await this.client.ping();
    const latencyMs = Math.round(performance.now() - started);
    const [keys, memory] = await Promise.all([this.client.dbSize(), this.client.info('memory').catch(() => '')]);
    const field = (name) => Number(memory.match(new RegExp(`^${name}:(\\d+)`, 'm'))?.[1]) || null;
    return { type: 'redis', ok: true, latencyMs, keys, usedMemory: field('used_memory'), maxMemory: field('maxmemory') };
  }

  async failedLogins(address) {
    return Number(await this.client.get(`domino:admin:fail:${address}`)) || 0;
  }

  async addFailedLogin(address, ttlS) {
    const key = `domino:admin:fail:${address}`;
    await this.client.multi().incr(key).expire(key, ttlS).exec();
  }
}

export async function createStore() {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (url) return RedisStore.connect(url);
  if (process.env.VERCEL) console.warn('No REDIS_URL set: matches will not be shared between instances.');
  return new MemoryStore();
}
