// Match storage + change notifications. MemoryStore for a single long-running
// server (local dev); RedisStore when several server instances must share
// matches (Vercel Functions).
import { EventEmitter } from 'node:events';
import { Match } from './match.js';

const MATCH_TTL_S = 60 * 60 * 24; // forget matches idle for a day
const PRESENCE_MS = 40_000; // a connection refreshes its presence every 15s
export const PRESENCE_REFRESH_MS = 15_000;
export const LEAVE_GRACE_MS = 6_000; // keep "online" briefly so a reload doesn't flicker

const onlineFrom = (entries, now = Date.now()) =>
  new Set(Object.entries(entries || {}).filter(([, exp]) => Number(exp) > now).map(([t]) => t));

export class MemoryStore {
  constructor() {
    this.matches = new Map(); // id -> JSON string (serialized like Redis, so no shared mutation)
    this.presence = new Map(); // id -> { token: expiresAt }
    this.events = new EventEmitter().setMaxListeners(0);
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

  async subscribe(id, cb) {
    this.events.on(id, cb);
    return async () => this.events.off(id, cb);
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

  // Hash tags keep a match's keys in one slot (cluster-safe).
  keys(id) {
    return { m: `domino:{${id}}:m`, v: `domino:{${id}}:v`, p: `domino:{${id}}:p`, ch: `domino:{${id}}:ch` };
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

  async subscribe(id, cb) {
    const ch = this.keys(id).ch;
    if (!this.sub) {
      this.sub = this.client.duplicate();
      this.sub.on('error', (e) => console.error('[redis sub]', e.message));
      await this.sub.connect();
    }
    let set = this.listeners.get(ch);
    if (!set) {
      set = new Set();
      this.listeners.set(ch, set);
      await this.sub.subscribe(ch, (message) => {
        const { json, online } = JSON.parse(message);
        for (const fn of this.listeners.get(ch) ?? []) fn(new Match(id, JSON.parse(json)), new Set(online));
      });
    }
    set.add(cb);
    return async () => {
      set.delete(cb);
      if (!set.size) {
        this.listeners.delete(ch);
        await this.sub.unsubscribe(ch);
      }
    };
  }

  async setPresence(id, token, ms = PRESENCE_MS) {
    const { p } = this.keys(id);
    await this.client.multi().hSet(p, token, String(Date.now() + ms)).expire(p, MATCH_TTL_S).exec();
  }
}

export async function createStore() {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (url) return RedisStore.connect(url);
  if (process.env.VERCEL) console.warn('No REDIS_URL set: matches will not be shared between instances.');
  return new MemoryStore();
}
