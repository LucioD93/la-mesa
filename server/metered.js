// TURN usage as Metered counts it, for the admin page. Needs METERED_APP (the
// subdomain of <app>.metered.live) and METERED_SECRET_KEY.
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

export function createMetered(fetcher = (...args) => fetch(...args)) {
  let cached = null; // { at, value }

  async function call(path) {
    const { METERED_APP: app, METERED_SECRET_KEY: key } = process.env;
    const url = `https://${app}.metered.live/api/v1/turn/${path}?secretKey=${encodeURIComponent(key)}`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** The current billing cycle, or null when Metered isn't configured. */
  async function usage(now = Date.now()) {
    if (!process.env.METERED_APP || !process.env.METERED_SECRET_KEY) return null;
    if (cached && now - cached.at < CACHE_MS) return cached.value;
    let value;
    try {
      const [totals, days] = await Promise.all([call('current_usage'), call('current_usage_by_date')]);
      value = {
        ok: true,
        quotaGB: totals.quotaInGB,
        usedGB: totals.usageInGB,
        overageGB: totals.overageInGB,
        days: days.map((d) => ({ date: d.date, usedGB: d.usageInGB })),
      };
    } catch (err) {
      // The request URL holds the secret key, so only keep the reason.
      console.error('[metered]', err.name, err.message.includes('secretKey') ? '' : err.message);
      value = { ok: false };
    }
    cached = { at: now, value };
    return value;
  }

  return { usage };
}
