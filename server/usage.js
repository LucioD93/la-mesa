// Usage counters for the admin page. Counts are buffered per instance and
// written in batches, so busy matches don't add a Redis command per message.
const FLUSH_MS = 30_000;
const VOICE_LIVE_MS = 65_000; // refreshed every 15s, and a refresh can wait a flush

export const usageDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export function createUsage(store) {
  let counts = {}; // day -> { field: n }
  let live = new Map(); // "<match>:<peer>" -> expiresAt, or 0 when they left
  let flushing = Promise.resolve();

  function add(fields) {
    const day = (counts[usageDay()] ??= {});
    for (const [field, n] of Object.entries(fields)) if (n > 0) day[field] = (day[field] || 0) + n;
  }

  const voiceSeen = (id, peer) => live.set(`${id}:${peer}`, Date.now() + VOICE_LIVE_MS);
  const voiceGone = (id, peer) => live.set(`${id}:${peer}`, 0);

  function flush() {
    if (!Object.keys(counts).length && !live.size) return flushing;
    const batch = { counts, live };
    counts = {};
    live = new Map();
    flushing = flushing
      .then(() => store.saveUsage(batch.counts, batch.live))
      .catch((err) => console.error('[usage]', err));
    return flushing;
  }

  setInterval(flush, FLUSH_MS).unref?.();

  return { add, voiceSeen, voiceGone, flush };
}
