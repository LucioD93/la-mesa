// What Cloudflare knows about this account, for the admin page: its GraphQL Analytics API
// and, if the token also has Workers Scripts: Read, what is deployed. Needs CF_ACCOUNT_ID
// and CF_API_TOKEN (a token with Account Analytics: Read); CF_PLAN says which plan's limits
// to watch. The numbers are the whole account's, in UTC days, like the limits and the bill.
const API_ROOT = 'https://api.cloudflare.com/client/v4';
const GRAPHQL = `${API_ROOT}/graphql`;
const SCRIPT = 'jugar'; // the name in wrangler.jsonc
const CACHE_MS = 5 * 60_000; // the API itself serves an identical query from a cache for minutes
const TIMEOUT_MS = 8_000;
const PARALLEL = 5; // a Worker keeps at most 6 connections open, and a queued call's timeout would be running
const HISTORY_DAYS = 30;
const RECENT_DAYS = 7;
const HOURS = 48;
const TOP = 25;
const DAY_MS = 86_400_000;
const NEAR_LIMIT = 0.8;

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

// The free plan, November 2026: what each UTC day allows. Past one, that kind of operation
// fails with an error until 00:00 UTC. Stored data is a total, not a daily amount.
export const FREE_LIMITS = {
  workerRequests: { label: 'Worker requests', limit: 100e3 },
  doRequests: { label: 'Durable Object requests', limit: 100e3 },
  doDuration: { label: 'Durable Object duration', unit: 'GB-s', limit: 13e3 },
  rowsRead: { label: 'SQLite rows read', limit: 5e6 },
  rowsWritten: { label: 'SQLite rows written', limit: 100e3 },
};
const FREE_STORAGE_GB = 5;
const FREE_WORKER_CPU_MS = 10; // per request

// Incoming WebSocket messages to hibernating objects are billed 20 to 1 as requests.
const WS_MESSAGE_RATIO = 20;

const WORKERS = 'workersInvocationsAdaptive';
const OBJECTS = 'durableObjectsInvocationsAdaptiveGroups';
const PERIODIC = 'durableObjectsPeriodicGroups';
const ASSETS = 'workersAssetsRequestsAdaptiveGroups';
const SUBREQUESTS = 'workersSubrequestsAdaptiveGroups';
const OBJECT_TOTALS = 'rowsWritten rowsRead duration activeTime cpuTime inboundWebsocketMsgCount outboundWebsocketMsgCount';

// One query each, so a dataset this account can't read costs only that dataset. `over` is
// the time they cover: `days` for the history, `recent` for the last week, `hours` for the
// last two days. Field names: pages.johnspurlock.com/graphql-schema-docs/cloudflare.html
export const DATASETS = {
  workers: {
    label: 'Worker requests',
    node: WORKERS,
    over: 'days',
    by: 'date',
    sum: 'requests errors subrequests cpuTimeUs wallTime responseBodySize clientDisconnects',
    quantiles: 'cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99',
    max: 'cpuTime wallTime memoryUsageBytes',
  },
  invocations: { label: 'Object requests', node: OBJECTS, over: 'days', by: 'date type', sum: 'requests errors responseBodySize wallTime' },
  objectSpeed: { label: 'Object speed', node: OBJECTS, over: 'days', by: 'date', quantiles: 'cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99', max: 'wallTime' },
  periodic: {
    label: 'Object activity',
    node: PERIODIC,
    over: 'days',
    by: 'date',
    sum: `${OBJECT_TOTALS} subrequests exceededCpuErrors exceededMemoryErrors fatalInternalErrors`,
    quantiles: 'memoryUsageBytesP50 memoryUsageBytesP99',
    max: 'activeWebsocketConnections memoryUsageBytes',
  },
  storage: { label: 'Stored data', node: 'durableObjectsStorageGroups', over: 'days', by: 'date', max: 'storedBytes' },
  sqlStorage: { label: 'SQLite stored data', node: 'durableObjectsSqlStorageGroups', over: 'days', by: 'date namespaceId', max: 'storedBytes' },
  assets: { label: 'Static files', node: ASSETS, over: 'days', by: 'date', sum: 'requests' },

  hourWorkers: { label: 'Worker requests by hour', node: WORKERS, over: 'hours', by: 'datetimeHour', sum: 'requests errors cpuTimeUs' },
  hourObjects: { label: 'Object requests by hour', node: OBJECTS, over: 'hours', by: 'datetimeHour', sum: 'requests errors' },
  hourActivity: {
    label: 'Object activity by hour',
    node: PERIODIC,
    over: 'hours',
    by: 'datetimeHour',
    sum: 'rowsWritten rowsRead duration inboundWebsocketMsgCount outboundWebsocketMsgCount',
    max: 'activeWebsocketConnections',
  },

  scripts: { label: 'Worker scripts', node: WORKERS, over: 'recent', by: 'scriptName', sum: 'requests errors subrequests cpuTimeUs responseBodySize', top: 'sum_requests' },
  versions: { label: 'Worker versions', node: WORKERS, over: 'recent', by: 'scriptName scriptVersion', sum: 'requests errors', top: 'sum_requests' },
  workerStatus: { label: 'How Worker requests ended', node: WORKERS, over: 'recent', by: 'status', sum: 'requests', top: 'sum_requests' },
  workerColos: { label: 'Worker data centers', node: WORKERS, over: 'recent', by: 'coloCode', sum: 'requests errors', top: 'sum_requests' },
  objectStatus: { label: 'How object requests ended', node: OBJECTS, over: 'recent', by: 'status', sum: 'requests', top: 'sum_requests' },
  objectColos: { label: 'Object data centers', node: PERIODIC, over: 'recent', by: 'coloCode', sum: OBJECT_TOTALS, top: 'sum_duration' },
  matches: {
    label: 'Busiest objects',
    node: PERIODIC,
    over: 'recent',
    by: 'name',
    sum: OBJECT_TOTALS,
    max: 'activeWebsocketConnections memoryUsageBytes',
    top: 'sum_rowsWritten',
  },
  classes: { label: 'Objects by class', node: PERIODIC, over: 'recent', by: 'namespaceId', sum: OBJECT_TOTALS, top: 'sum_rowsWritten' },
  assetStatus: { label: 'Static files by status', node: ASSETS, over: 'recent', by: 'statusCode', sum: 'requests', top: 'sum_requests' },
  assetCache: { label: 'Static files by cache', node: ASSETS, over: 'recent', by: 'cacheStatus', sum: 'requests', top: 'sum_requests' },
  assetHosts: { label: 'Static files by host', node: ASSETS, over: 'recent', by: 'hostname', sum: 'requests', top: 'sum_requests' },
  assetColos: { label: 'Static files by data center', node: ASSETS, over: 'recent', by: 'coloCode', sum: 'requests', top: 'sum_requests' },
  calls: {
    label: 'Outgoing calls',
    node: SUBREQUESTS,
    over: 'recent',
    by: 'hostname',
    sum: 'subrequests requestBodySize responseBodySize timeToResponseUs',
    top: 'sum_subrequests',
  },
  callOutcomes: { label: 'Outgoing calls by outcome', node: SUBREQUESTS, over: 'recent', by: 'requestOutcome', sum: 'subrequests', top: 'sum_subrequests' },
};

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const startOfDay = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
const startOfMonth = (ms) => {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};
const shown = (n) => Math.round(n).toLocaleString('en');

/** The fields of a block this account may ask for; a list in another shape is ignored. */
function allowed(group, fields, available) {
  const list = fields.split(' ');
  if (!available?.some((f) => /^(sum|max|quantiles)_/.test(f))) return list;
  return list.filter((f) => available.includes(`${group}_${f}`));
}

/** The GraphQL query for one dataset, within what the account's settings for it allow. */
export function buildQuery(name, setting = {}) {
  const set = DATASETS[name];
  const field = set.over === 'hours' ? 'datetime' : 'date';
  const type = set.over === 'hours' ? 'Time' : 'Date';
  const limit = Math.min(set.top ? TOP : 1000, setting.maxPageSize || Infinity);
  const blocks = ['sum', 'quantiles', 'max']
    .filter((group) => set[group])
    .map((group) => [group, allowed(group, set[group], setting.availableFields)])
    .filter(([, fields]) => fields.length)
    .map(([group, fields]) => `${group} { ${fields.join(' ')} }`);
  const order = set.top ? `, orderBy: [${set.top}_DESC]` : '';
  return `query ${name}($account: string!, $since: ${type}!, $until: ${type}!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      rows: ${set.node}(limit: ${limit}, filter: { ${field}_geq: $since, ${field}_leq: $until }${order}) {
        dimensions { ${set.by} }
        ${blocks.join(' ')}
      }
    }
  }
}`;
}

/** The query that asks what this account may read of each dataset. */
export function settingsQuery() {
  const nodes = [...new Set(Object.values(DATASETS).map((set) => set.node))];
  return `query settings($account: string!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      settings { ${nodes.map((node) => `${node} { enabled maxDuration notOlderThan maxPageSize availableFields }`).join(' ')} }
    }
  }
}`;
}

/** The time a dataset should cover, cut to how far back its settings reach. */
export function windowOf(set, setting, now) {
  const wanted = {
    days: Math.min(startOfMonth(now), startOfDay(now) - (HISTORY_DAYS - 1) * DAY_MS),
    recent: startOfDay(now) - (RECENT_DAYS - 1) * DAY_MS,
    hours: now - HOURS * 3_600_000,
  }[set.over];
  const spans = [setting?.notOlderThan, setting?.maxDuration].filter((s) => s > 0); // in seconds
  const earliest = spans.length ? now - Math.min(...spans) * 1000 : -Infinity;
  if (set.over === 'hours') {
    return { since: new Date(Math.max(wanted, earliest)).toISOString(), until: new Date(now).toISOString(), limited: wanted < earliest };
  }
  // Whole days from here on: two days' margin keeps a range ending tonight inside the limit.
  const since = wanted < earliest ? Math.min(startOfDay(earliest + 2 * DAY_MS), startOfDay(now)) : wanted;
  return { since: isoDay(since), until: isoDay(now), limited: wanted < earliest };
}

/** A group from the API as one flat row; `max { cpuTime }` becomes `maxCpuTime`. */
function flat({ dimensions, sum, quantiles, max }) {
  const peaks = Object.entries(max ?? {}).map(([k, v]) => [`max${k[0].toUpperCase()}${k.slice(1)}`, v]);
  return { ...dimensions, ...sum, ...quantiles, ...Object.fromEntries(peaks) };
}

const toMs = 1 / 1000; // the API's times are in microseconds
const toS = 1 / 1e6;

// How each daily dataset's rows add up into a day: { its field: our field, or [our field, scale] }.
const DAILY = {
  workers: {
    add: {
      requests: 'workerRequests',
      errors: 'workerErrors',
      subrequests: 'workerSubrequests',
      clientDisconnects: 'clientDisconnects',
      responseBodySize: 'workerBytes',
      cpuTimeUs: ['workerCpuMs', toMs],
      wallTime: ['workerWallS', toS],
    },
    peak: {
      cpuTimeP50: ['workerCpuP50', toMs],
      cpuTimeP99: ['workerCpuP99', toMs],
      maxCpuTime: ['workerCpuMax', toMs],
      wallTimeP50: ['workerWallP50', toMs],
      wallTimeP99: ['workerWallP99', toMs],
      maxWallTime: ['workerWallMax', toMs],
      maxMemoryUsageBytes: 'workerMemoryMax',
    },
  },
  invocations: { add: { requests: 'doRequests', errors: 'doErrors', responseBodySize: 'doBytes', wallTime: ['doWallS', toS] } },
  objectSpeed: {
    peak: {
      cpuTimeP50: ['doCpuP50', toMs],
      cpuTimeP99: ['doCpuP99', toMs],
      wallTimeP50: ['doWallP50', toMs],
      wallTimeP99: ['doWallP99', toMs],
      maxWallTime: ['doWallMax', toMs],
    },
  },
  periodic: {
    add: {
      duration: 'doDuration',
      activeTime: ['doActiveS', toS],
      cpuTime: ['doCpuMs', toMs],
      subrequests: 'doSubrequests',
      inboundWebsocketMsgCount: 'socketMessagesIn',
      outboundWebsocketMsgCount: 'socketMessagesOut',
      rowsRead: 'rowsRead',
      rowsWritten: 'rowsWritten',
      exceededCpuErrors: 'exceededCpu',
      exceededMemoryErrors: 'exceededMemory',
      fatalInternalErrors: 'fatalErrors',
    },
    peak: {
      memoryUsageBytesP50: 'doMemoryP50',
      memoryUsageBytesP99: 'doMemoryP99',
      maxMemoryUsageBytes: 'doMemoryMax',
      maxActiveWebsocketConnections: 'maxSockets',
    },
  },
  storage: { peak: { maxStoredBytes: 'storedBytes' } },
  assets: { add: { requests: 'assetRequests' } },
};

function merge(row, group, mapping = {}) {
  for (const [from, to] of Object.entries(mapping.add ?? {})) {
    if (group[from] == null) continue;
    const [field, scale] = Array.isArray(to) ? to : [to, 1];
    row[field] = (row[field] ?? 0) + group[from] * scale;
  }
  for (const [from, to] of Object.entries(mapping.peak ?? {})) {
    if (group[from] == null) continue;
    const [field, scale] = Array.isArray(to) ? to : [to, 1];
    row[field] = Math.max(row[field] ?? 0, group[from] * scale);
  }
}

/** A WebSocket message to a hibernating object, by the invocation's type (matched loosely). */
const isSocketMessage = (type) => /websocket/i.test(type) && /message/i.test(type);

/** Per-day rows from the flat rows of the daily datasets. A field nobody could read stays unset. */
export function dailyUsage(data) {
  const days = new Map();
  const row = (date) => {
    if (!days.has(date)) days.set(date, { date });
    return days.get(date);
  };
  for (const [name, mapping] of Object.entries(DAILY)) for (const g of data[name] ?? []) merge(row(g.date), g, mapping);
  const types = {};
  for (const g of data.invocations ?? []) {
    const r = row(g.date);
    const requests = g.requests ?? 0;
    r.doRequestsBilled = (r.doRequestsBilled ?? 0) + (isSocketMessage(g.type) ? requests / WS_MESSAGE_RATIO : requests);
    types[g.type] = (types[g.type] || 0) + requests;
  }
  // SQLite objects report per namespace; the account-wide dataset may or may not include them.
  const sql = new Map();
  for (const g of data.sqlStorage ?? []) sql.set(g.date, (sql.get(g.date) ?? 0) + (g.maxStoredBytes ?? 0));
  for (const [date, bytes] of sql) {
    const r = row(date);
    r.storedBytes = Math.max(r.storedBytes ?? 0, bytes);
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), types };
}

/** Rows for the last hours, oldest first. */
export function hourlyUsage(data) {
  const hours = new Map();
  const row = (hour) => {
    if (!hours.has(hour)) hours.set(hour, { hour });
    return hours.get(hour);
  };
  const add = (rows, mapping) => {
    for (const g of rows ?? []) merge(row(g.datetimeHour), g, mapping);
  };
  add(data.hourWorkers, { add: { requests: 'workerRequests', errors: 'workerErrors', cpuTimeUs: ['workerCpuMs', toMs] } });
  add(data.hourObjects, { add: { requests: 'doRequests', errors: 'doErrors' } });
  add(data.hourActivity, {
    add: { rowsWritten: 'rowsWritten', rowsRead: 'rowsRead', duration: 'doDuration', inboundWebsocketMsgCount: 'socketMessagesIn', outboundWebsocketMsgCount: 'socketMessagesOut' },
    peak: { maxActiveWebsocketConnections: 'maxSockets' },
  });
  return [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

/** This month's totals, each line's estimated cost on Workers Paid, and the same at this month's pace. */
export function monthBill(days, now = Date.now()) {
  const date = new Date(now);
  const monthStart = isoDay(startOfMonth(now));
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = (now - Date.parse(`${monthStart}T00:00:00Z`)) / DAY_MS; // days, with a fraction
  const month = days.filter((d) => d.date >= monthStart);
  const sum = (field) => month.reduce((n, d) => n + (d[field] ?? 0), 0);
  // Storage is billed by the GB-month: the average stored over the month so far, for the part elapsed.
  const avgStored = month.length ? month.reduce((n, d) => n + (d.storedBytes ?? 0), 0) / month.length : 0;
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

/** Today against the free plan's limits; `used` is null for a number Cloudflare didn't give. */
export function dailyLimits(days, now = Date.now()) {
  const dayStart = startOfDay(now);
  const elapsed = (now - dayStart) / DAY_MS;
  const today = days.find((d) => d.date === isoDay(now)) ?? {};
  const billed = { doRequests: 'doRequestsBilled' };
  const lines = Object.entries(FREE_LIMITS).map(([id, { label, unit, limit }]) => {
    const field = billed[id] ?? id;
    const used = days.some((d) => d[field] != null) ? (today[field] ?? 0) : null;
    if (used == null) return { id, label, unit: unit ?? null, limit, used, share: null, projected: null, runsOutAt: null };
    const settled = elapsed >= 1 / 24; // the first hour says little about the rest of the day
    const projected = settled ? used / elapsed : null;
    const runsOutAt = settled && used < limit && projected > limit ? dayStart + (DAY_MS * limit) / projected : null;
    return { id, label, unit: unit ?? null, limit, used, share: used / limit, projected, runsOutAt };
  });
  // The last day with a figure: storage is sampled, and today's may not be in yet.
  const stored = days.findLast((d) => d.storedBytes != null)?.storedBytes;
  lines.push({
    id: 'storage',
    label: 'Stored data',
    unit: 'GB',
    limit: FREE_STORAGE_GB,
    used: stored == null ? null : stored / 1e9,
    share: stored == null ? null : stored / 1e9 / FREE_STORAGE_GB,
    projected: null,
    runsOutAt: null,
  });
  return lines;
}

/** The month against Workers Paid's allowances, in the same shape as dailyLimits. */
function monthlyLimits(bill) {
  return bill.lines.map((l) => ({ id: l.id, label: l.label, unit: l.unit, limit: l.included, used: l.used, share: l.used / l.included, projected: l.projected, runsOutAt: null }));
}

const clock = (ms) => `${new Date(ms).toISOString().slice(11, 16)} UTC`;

/** What the admin should look at, worst first: { level: 'bad' | 'warn', text }. */
export function alertsFor({ plan, limits, bill, today, failed, limited }) {
  const bad = [];
  const warn = [];
  const percent = (share) => `${Math.floor(share * 100)}%`;
  for (const l of limits) {
    if (l.share == null) continue;
    if (plan === 'free') {
      if (l.share >= 1) {
        const then = l.id === 'storage' ? 'Writes fail until data is deleted' : 'These operations fail until 00:00 UTC';
        bad.push(`${l.label}: the limit of ${shown(l.limit)}${l.unit ? ` ${l.unit}` : ''} is used up. ${then}, or until you upgrade to Workers Paid.`);
      } else if (l.share >= NEAR_LIMIT) warn.push(`${l.label}: ${percent(l.share)} of the limit is used.`);
      if (l.runsOutAt) warn.push(`${l.label}: at this pace the limit runs out around ${clock(l.runsOutAt)}.`);
    } else if (l.share >= 1) warn.push(`${l.label}: over this month's allowance, and the extra is billed.`);
    else if (l.share >= NEAR_LIMIT) warn.push(`${l.label}: ${percent(l.share)} of this month's allowance is used.`);
    else if (l.projected > l.limit) warn.push(`${l.label}: at this pace it goes over this month's allowance.`);
  }
  const crashes = [
    ['exceededCpu', 'hit the CPU limit'],
    ['exceededMemory', 'hit the memory limit'],
    ['fatalErrors', 'failed inside Cloudflare'],
  ];
  for (const [field, what] of crashes) if (today[field] > 0) bad.push(`Objects ${what} ${shown(today[field])} times today.`);
  if (today.workerErrors > 0 && today.workerErrors >= today.workerRequests * 0.01) warn.push(`${shown(today.workerErrors)} Worker requests failed today.`);
  if (today.doErrors > 0 && today.doErrors >= today.doRequests * 0.01) warn.push(`${shown(today.doErrors)} object requests failed today.`);
  if (plan === 'free' && today.workerCpuMax > FREE_WORKER_CPU_MS) {
    warn.push(`The slowest Worker request today used ${today.workerCpuMax.toFixed(1)} ms of CPU; the free plan allows ${FREE_WORKER_CPU_MS} ms.`);
  }
  if (plan === 'paid' && bill.projectedCost > bill.base) warn.push(`The bill is heading for about $${bill.projectedCost.toFixed(2)} this month.`);
  for (const { label, error } of failed) warn.push(`Could not read ${label}: ${error}.`);
  for (const { label, since } of limited) warn.push(`${label}: this account can only read back to ${since}, so totals before that are missing.`);
  return [...bad.map((text) => ({ level: 'bad', text })), ...warn.map((text) => ({ level: 'warn', text }))];
}

/** Run `task` on each item, at most `size` at a time, keeping the order. */
async function inTurns(items, size, task) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]);
    }
  };
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

/** Why the API said no, in its own words when it gives them. */
async function refusal(res) {
  const body = await res.json().catch(() => null);
  return new Error(body?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`);
}

export function createCloudflareUsage(fetcher = (...args) => fetch(...args)) {
  let cached = null; // { at, value }

  async function graphql(token, query, variables) {
    const res = await fetcher(GRAPHQL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw await refusal(res);
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
    const account = body.data?.viewer?.accounts?.[0];
    if (!account) throw new Error('no such account, or the token cannot read it');
    return account;
  }

  async function rest(token, path) {
    const res = await fetcher(`${API_ROOT}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw await refusal(res);
    const body = await res.json();
    if (!body.success) throw new Error(body.errors?.map((e) => e.message).join('; ') || 'refused');
    return body.result;
  }

  /** What is deployed. The token may not have Workers Scripts: Read, which is fine. */
  async function deployed(token, account) {
    const root = `/accounts/${encodeURIComponent(account)}/workers`;
    const [scripts, namespaces, deployments] = await Promise.all(
      [
        `${root}/scripts`,
        `${root}/durable_objects/namespaces`,
        `${root}/scripts/${SCRIPT}/deployments`,
      ].map((path) => rest(token, path).then((value) => ({ value }), (err) => ({ error: err.message }))),
    );
    const error = scripts.error ?? namespaces.error ?? deployments.error ?? null;
    return {
      error,
      scripts: (scripts.value ?? []).map((s) => ({ name: s.id, createdOn: s.created_on, modifiedOn: s.modified_on, usageModel: s.usage_model })),
      namespaces: (namespaces.value ?? []).map((n) => ({ id: n.id, class: n.class, script: n.script, sqlite: n.use_sqlite })),
      deployments: (deployments.value?.deployments ?? []).slice(0, 10).map((d) => ({
        createdOn: d.created_on,
        source: d.source,
        message: d.annotations?.['workers/message'] ?? null,
        versions: (d.versions ?? []).map((v) => ({ id: v.version_id, percentage: v.percentage })),
      })),
    };
  }

  /** Everything Cloudflare gives us, or null when the API isn't configured. */
  async function usage(now = Date.now()) {
    const { CF_ACCOUNT_ID: account, CF_API_TOKEN: token, CF_PLAN } = process.env;
    if (!account || !token) return null;
    if (cached && now - cached.at < CACHE_MS) return cached.value;
    const plan = CF_PLAN === 'paid' ? 'paid' : 'free';

    // Asked first: free accounts may reach back less far than a month. Without it, every
    // dataset is still tried and each reports its own error.
    const settings = await graphql(token, settingsQuery(), { account })
      .then((a) => a.settings ?? {})
      .catch((err) => {
        console.error('[cloudflare] settings', err.message);
        return {};
      });

    const data = {};
    const failed = [];
    const limited = [];
    const read = async (name) => {
      const set = DATASETS[name];
      const setting = settings[set.node];
      if (setting?.enabled === false) return failed.push({ name, label: set.label, error: 'not enabled for this account' });
      const { since, until, limited: cut } = windowOf(set, setting, now);
      if (cut && set.over === 'days') limited.push({ label: set.label, since });
      try {
        const { rows } = await graphql(token, buildQuery(name, setting), { account, since, until });
        data[name] = (rows ?? []).map(flat);
      } catch (err) {
        console.error('[cloudflare]', name, err.message);
        failed.push({ name, label: set.label, error: err.message });
      }
    };
    const names = Object.keys(DATASETS);
    const [, deployment] = await Promise.all([inTurns(names, PARALLEL, read), deployed(token, account)]);

    if (failed.length === names.length) {
      // Nothing to show, and most likely one cause.
      const value = { ok: false, error: failed[0].error };
      cached = { at: now, value };
      return value;
    }

    const { days, types } = dailyUsage(data);
    const bill = monthBill(days, now);
    const today = days.find((d) => d.date === isoDay(now)) ?? {};
    const limits = plan === 'free' ? dailyLimits(days, now) : monthlyLimits(bill);
    const classNames = Object.fromEntries(deployment.namespaces.map((n) => [n.id, n.class]));
    const breakdowns = Object.fromEntries(
      names.filter((n) => DATASETS[n].over === 'recent').map((n) => [n, data[n]]),
    );
    if (breakdowns.classes) breakdowns.classes = breakdowns.classes.map((r) => ({ ...r, class: classNames[r.namespaceId] ?? r.namespaceId }));

    const value = {
      ok: true,
      plan,
      fetchedAt: now,
      recentDays: RECENT_DAYS,
      ...bill,
      limits,
      alerts: alertsFor({ plan, limits, bill, today, failed, limited }),
      days: days.slice(-HISTORY_DAYS),
      hours: hourlyUsage(data),
      requestTypes: types,
      breakdowns,
      deployment,
    };
    cached = { at: now, value };
    return value;
  }

  return { usage };
}
