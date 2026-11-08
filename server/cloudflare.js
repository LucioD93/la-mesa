// What Cloudflare counts toward the bill, from its GraphQL Analytics API, for the admin
// page. Needs CF_ACCOUNT_ID and CF_API_TOKEN (a token with Account Analytics: Read). The
// numbers are the whole account's, like the bill, for the calendar month in UTC.
const API = 'https://api.cloudflare.com/client/v4/graphql';
const CACHE_MS = 5 * 60_000; // the API itself serves an identical query from a cache for minutes
const TIMEOUT_MS = 8_000;
const HISTORY_DAYS = 30;

// Workers Paid, November 2026: developers.cloudflare.com/workers/platform/pricing and
// /durable-objects/platform/pricing. Each line is { included per month, dollars per unit over it }.
export const PRICING = {
  base: 5, // the plan's monthly minimum
  workerRequests: { label: 'Worker requests', included: 10e6, per: 0.3 / 1e6 },
  workerCpuMs: { label: 'Worker CPU time', unit: 'ms', included: 30e6, per: 0.02 / 1e6 },
  doRequests: { label: 'Durable Object requests', included: 1e6, per: 0.15 / 1e6 },
  doDuration: { label: 'Durable Object duration', unit: 'GB-s', included: 400e3, per: 12.5 / 1e6 },
  rowsRead: { label: 'SQLite rows read', included: 25e9, per: 0.001 / 1e6 },
  rowsWritten: { label: 'SQLite rows written', included: 50e6, per: 1 / 1e6 },
  storage: { label: 'Stored data', unit: 'GB-month', included: 5, per: 0.2 },
};
// Incoming WebSocket messages to hibernating objects are billed 20 to 1 as requests.
const WS_MESSAGE_RATIO = 20;

const QUERY = `query Usage($account: string!, $since: Date!, $until: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date }
        sum { requests cpuTimeUs }
      }
      invocations: durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date type }
        sum { requests }
      }
      periodic: durableObjectsPeriodicGroups(limit: 10000, filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date }
        sum { duration cpuTime inboundWebsocketMsgCount outboundWebsocketMsgCount rowsRead rowsWritten }
      }
      storage: durableObjectsStorageGroups(limit: 10000, filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date }
        max { storedBytes }
      }
    }
  }
}`;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** A WebSocket message to a hibernating object, by the invocation's type (matched loosely). */
const isSocketMessage = (type) => /websocket/i.test(type) && /message/i.test(type);

/** Per-day rows from the API's groups. */
export function dailyUsage(account) {
  const days = new Map();
  const row = (date) => {
    if (!days.has(date)) {
      days.set(date, {
        date,
        workerRequests: 0,
        workerCpuMs: 0,
        doRequests: 0,
        doRequestsBilled: 0,
        socketMessagesIn: 0,
        socketMessagesOut: 0,
        doDuration: 0,
        doCpuMs: 0,
        rowsRead: 0,
        rowsWritten: 0,
        storedBytes: 0,
      });
    }
    return days.get(date);
  };
  for (const g of account.workers ?? []) {
    const r = row(g.dimensions.date);
    r.workerRequests += g.sum.requests;
    r.workerCpuMs += g.sum.cpuTimeUs / 1000;
  }
  const types = {};
  for (const g of account.invocations ?? []) {
    const r = row(g.dimensions.date);
    const { type } = g.dimensions;
    r.doRequests += g.sum.requests;
    r.doRequestsBilled += isSocketMessage(type) ? g.sum.requests / WS_MESSAGE_RATIO : g.sum.requests;
    types[type] = (types[type] || 0) + g.sum.requests;
  }
  for (const g of account.periodic ?? []) {
    const r = row(g.dimensions.date);
    r.doDuration += g.sum.duration;
    r.doCpuMs += g.sum.cpuTime / 1000;
    r.socketMessagesIn += g.sum.inboundWebsocketMsgCount;
    r.socketMessagesOut += g.sum.outboundWebsocketMsgCount;
    r.rowsRead += g.sum.rowsRead;
    r.rowsWritten += g.sum.rowsWritten;
  }
  for (const g of account.storage ?? []) {
    const r = row(g.dimensions.date);
    r.storedBytes = Math.max(r.storedBytes, g.max.storedBytes);
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), types };
}

/** This month's totals, each line's estimated cost, and the same at this month's pace. */
export function monthBill(days, now = Date.now()) {
  const date = new Date(now);
  const monthStart = isoDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = (now - Date.parse(`${monthStart}T00:00:00Z`)) / 86_400_000; // days, with a fraction
  const month = days.filter((d) => d.date >= monthStart);
  const sum = (field) => month.reduce((n, d) => n + d[field], 0);
  // Storage is billed by the GB-month: the average stored over the month so far, for the part elapsed.
  const avgStored = month.length ? month.reduce((n, d) => n + d.storedBytes, 0) / month.length : 0;
  const used = {
    workerRequests: sum('workerRequests'),
    workerCpuMs: sum('workerCpuMs'),
    doRequests: sum('doRequestsBilled'),
    doDuration: sum('doDuration'),
    rowsRead: sum('rowsRead'),
    rowsWritten: sum('rowsWritten'),
    storage: (avgStored / 1e9) * (elapsed / daysInMonth),
  };
  const pace = daysInMonth / Math.max(elapsed, 1 / 24); // how much the month-to-date grows by the end
  const lines = Object.entries(used).map(([id, n]) => {
    const p = PRICING[id];
    const cost = (x) => Math.max(0, x - p.included) * p.per;
    return { id, label: p.label, unit: p.unit ?? null, used: n, included: p.included, cost: cost(n), projected: n * pace, projectedCost: cost(n * pace) };
  });
  const over = (key) => lines.reduce((n, l) => n + l[key], 0);
  return {
    month: monthStart.slice(0, 7),
    elapsedDays: elapsed,
    daysInMonth,
    base: PRICING.base,
    lines,
    cost: PRICING.base + over('cost'),
    projectedCost: PRICING.base + over('projectedCost'),
  };
}

export function createCloudflareUsage(fetcher = (...args) => fetch(...args)) {
  let cached = null; // { at, value }

  /** Usage and an estimated bill, or null when the API isn't configured. */
  async function usage(now = Date.now()) {
    const { CF_ACCOUNT_ID: account, CF_API_TOKEN: token } = process.env;
    if (!account || !token) return null;
    if (cached && now - cached.at < CACHE_MS) return cached.value;
    let value;
    try {
      const date = new Date(now);
      const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      const since = isoDay(Math.min(monthStart, now - (HISTORY_DAYS - 1) * 86_400_000));
      const res = await fetcher(API, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { account, since, until: isoDay(now) } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
      const acct = body.data?.viewer?.accounts?.[0];
      if (!acct) throw new Error('no such account, or the token cannot read it');
      const { days, types } = dailyUsage(acct);
      value = { ok: true, ...monthBill(days, now), days: days.slice(-HISTORY_DAYS), requestTypes: types };
    } catch (err) {
      console.error('[cloudflare]', err.name, err.message);
      value = { ok: false, error: err.message };
    }
    cached = { at: now, value };
    return value;
  }

  return { usage };
}
