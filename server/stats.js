// Usage counters and who's online in every match, for the admin page. Each room reports
// here when its people change and at least once a minute while it has some, so one copy
// sees all matches (a Durable Object on Cloudflare, an object in memory locally).
// It keeps everything in a small key-value store: `kv` has get, put, delete and list({ prefix }).

const USAGE_DAYS = 100; // daily counters outlive the 30 days the admin page shows
const LIVE_TTL_MS = 15 * 60_000; // a match that stopped reporting (its room was reset) drops out

const day = (key) => key.slice('usage:'.length);

export class Stats {
  constructor(kv) {
    this.kv = kv;
  }

  /** A room's people now, and the counters it gathered since it last reported. */
  report(id, live, usage = {}) {
    const total = this.kv.get('usage:total') ?? {};
    let newDay = false;
    for (const [d, fields] of Object.entries(usage)) {
      const row = this.kv.get(`usage:${d}`);
      newDay ||= !row;
      const next = { ...row };
      for (const [field, n] of Object.entries(fields)) {
        next[field] = (next[field] || 0) + n;
        total[field] = (total[field] || 0) + n;
      }
      this.kv.put(`usage:${d}`, next);
    }
    if (Object.keys(usage).length) this.kv.put('usage:total', total);
    if (newDay) this.prune();
    if (live) {
      if (!live.online && !live.voice) this.kv.delete(`live:${id}`);
      else this.kv.put(`live:${id}`, { online: live.online, voice: live.voice, at: Date.now() });
    }
  }

  /** Drop daily counters older than USAGE_DAYS. */
  prune(now = Date.now()) {
    const oldest = new Date(now - USAGE_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (const [key] of [...this.kv.list({ prefix: 'usage:2' })]) if (day(key) < oldest) this.kv.delete(key);
  }

  /** Who is in voice now, by match, plus how many matches have people online. */
  overview(now = Date.now()) {
    const voice = [];
    let matches = 0;
    let online = 0;
    for (const [key, live] of [...this.kv.list({ prefix: 'live:' })]) {
      if (live.at < now - LIVE_TTL_MS) {
        this.kv.delete(key);
        continue;
      }
      const match = key.slice('live:'.length);
      if (live.voice) voice.push({ match, people: live.voice });
      if (live.online) {
        matches++;
        online += live.online;
      }
    }
    voice.sort((a, b) => b.people - a.people);
    return { voice, matches, online };
  }

  readUsage(days) {
    return {
      days: Object.fromEntries(days.map((d) => [d, this.kv.get(`usage:${d}`) ?? {}])),
      total: this.kv.get('usage:total') ?? {},
    };
  }

  failedLogins(address, now = Date.now()) {
    const f = this.kv.get(`fail:${address}`);
    return f && f.until > now ? f.n : 0;
  }

  addFailedLogin(address, ttlS, now = Date.now()) {
    for (const [key, f] of [...this.kv.list({ prefix: 'fail:' })]) if (f.until <= now) this.kv.delete(key);
    this.kv.put(`fail:${address}`, { n: this.failedLogins(address, now) + 1, until: now + ttlS * 1000 });
  }
}

/** The key-value store Stats and the local rooms use: a Map, copied in and out like real storage. */
export function memoryKv() {
  const map = new Map();
  return {
    map,
    get: (key) => (map.has(key) ? structuredClone(map.get(key)) : undefined),
    put: (key, value) => void map.set(key, structuredClone(value)),
    delete: (key) => map.delete(key),
    *list({ prefix = '' } = {}) {
      for (const key of [...map.keys()].sort()) if (key.startsWith(prefix)) yield [key, structuredClone(map.get(key))];
    },
  };
}
