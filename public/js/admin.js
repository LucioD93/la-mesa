// Admin page: signs in with the shared password and shows usage from /api/admin.
const KEY = 'domino-admin-password'; // kept for this tab only
const REFRESH_MS = 30_000;

const $ = (id) => document.getElementById(id);
let timer = null;

const LOGIN_ERRORS = {
  password: 'Wrong password.',
  locked: 'Too many wrong passwords. Try again in 15 minutes.',
  unconfigured: 'Set ADMIN_PASSWORD on the server first.',
};

// ---- formatting -----------------------------------------------------------------

function bytes(n = 0) {
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    n /= 1000;
    i++;
  } while (n >= 1000 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 2 : 1)} ${units[i]}`;
}

const count = (n = 0) => Math.round(n).toLocaleString();
const dollars = (n = 0) => `$${n.toFixed(2)}`;
const shortDay = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function sum(rows) {
  const out = {};
  for (const row of rows) for (const [k, v] of Object.entries(row)) if (k !== 'day') out[k] = (out[k] || 0) + v;
  return out;
}

function cell(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function row(tag, values) {
  const tr = document.createElement('tr');
  values.forEach((v, i) => tr.append(cell(i === 0 ? 'th' : tag, v)));
  return tr;
}

// ---- rendering ------------------------------------------------------------------

// Every counter the rooms keep, in this order; one the page doesn't know yet shows under its own name.
const FIELDS = [
  ['sockets', 'Sockets opened', count],
  ['messages', 'Messages received', count],
  ['socketIn', 'Data received', bytes],
  ['socketOut', 'Data sent', bytes],
  ['saves', 'Match changes saved', count],
  ['wakes', 'Timer wake-ups', count],
  ['voiceJoins', 'Voice joins', count],
];

/** The known fields, then any others found in `rows`. */
function fieldsIn(rows) {
  const known = new Set(FIELDS.map(([k]) => k));
  const extra = new Set();
  for (const r of rows) for (const k of Object.keys(r)) if (k !== 'day' && !known.has(k)) extra.add(k);
  return [...FIELDS, ...[...extra].sort().map((k) => [k, k, count])];
}

function renderPeriods(report) {
  const { days, total } = report;
  const periods = [days.slice(-1), days.slice(-7), days].map(sum);
  periods.push(total);
  $('periods').replaceChildren(...fieldsIn(periods).map(([k, label, format]) => row('td', [label, ...periods.map((p) => format(p[k]))])));
}

function renderDays(report) {
  const used = report.days.filter((d) => Object.keys(d).length > 1).reverse();
  const fields = fieldsIn(used);
  $('daysHead').replaceChildren(row('th', ['', ...fields.map(([, label]) => label)]));
  $('days').replaceChildren(...used.map((d) => row('td', [shortDay(d.day), ...fields.map(([k, , format]) => format(d[k]))])));
  $('daysEmpty').hidden = used.length > 0;
}

// ---- Cloudflare -----------------------------------------------------------------

const ms = (n) => `${n < 10 ? n.toFixed(2) : count(n)} ms`;
const seconds = (n) => `${n < 10 ? n.toFixed(2) : count(n)} s`;
const gbs = (n) => (n < 10 ? n.toFixed(3) : count(n));
const shortHour = (iso) => `${shortDay(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
const clock = (at) => `${new Date(at).toISOString().slice(11, 16)} UTC`;
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const plainText = (value) => String(value ?? '');

// What an object's usage adds up to, for the tables that break it down.
const OBJECT_COLUMNS = [
  ['rowsWritten', 'Rows written', count],
  ['rowsRead', 'Rows read', count],
  ['duration', 'Duration GB-s', gbs],
  ['activeTime', 'Active', (n) => seconds(n / 1e6)],
  ['cpuTime', 'CPU', (n) => ms(n / 1000)],
  ['inboundWebsocketMsgCount', 'Messages in', count],
  ['outboundWebsocketMsgCount', 'Messages out', count],
  ['maxActiveWebsocketConnections', 'Most sockets', count],
  ['maxMemoryUsageBytes', 'Most memory', bytes],
];
const REQUESTS = [['requests', 'Requests', count]];

/** A table of `rows`, each given its own first cell, with one column per field that has data. */
const PANELS = [
  {
    title: 'Worker by day',
    rows: (cf) => cf.days,
    first: (d) => shortDay(d.date),
    columns: [
      ['workerRequests', 'Requests', count],
      ['assetRequests', 'Static files', count],
      ['workerErrors', 'Errors', count],
      ['clientDisconnects', 'Disconnects', count],
      ['workerSubrequests', 'Outgoing calls', count],
      ['workerCpuMs', 'CPU', ms],
      ['workerWallS', 'Wall time', seconds],
      ['workerBytes', 'Data sent', bytes],
    ],
  },
  {
    title: 'Durable Objects by day',
    rows: (cf) => cf.days,
    first: (d) => shortDay(d.date),
    columns: [
      ['doRequests', 'Requests', count],
      ['doRequestsBilled', 'Billed as', count],
      ['doErrors', 'Errors', count],
      ['socketMessagesIn', 'Messages in', count],
      ['socketMessagesOut', 'Messages out', count],
      ['maxSockets', 'Most sockets', count],
      ['doDuration', 'Duration GB-s', gbs],
      ['doActiveS', 'Active', seconds],
      ['doCpuMs', 'CPU', ms],
      ['doWallS', 'Wall time', seconds],
      ['doSubrequests', 'Outgoing calls', count],
      ['doBytes', 'Data sent', bytes],
      ['rowsWritten', 'Rows written', count],
      ['rowsRead', 'Rows read', count],
      ['storedBytes', 'Stored', bytes],
    ],
  },
  {
    title: 'Last 48 hours (UTC)',
    rows: (cf) => cf.hours,
    first: (h) => shortHour(h.hour),
    columns: [
      ['workerRequests', 'Worker requests', count],
      ['workerErrors', 'Worker errors', count],
      ['workerCpuMs', 'Worker CPU', ms],
      ['doRequests', 'Object requests', count],
      ['doErrors', 'Object errors', count],
      ['socketMessagesIn', 'Messages in', count],
      ['socketMessagesOut', 'Messages out', count],
      ['maxSockets', 'Most sockets', count],
      ['doDuration', 'Duration GB-s', gbs],
      ['rowsWritten', 'Rows written', count],
      ['rowsRead', 'Rows read', count],
    ],
  },
  {
    title: 'Speed and memory by day',
    rows: (cf) => cf.days,
    first: (d) => shortDay(d.date),
    columns: [
      ['workerCpuP50', 'Worker CPU p50', ms],
      ['workerCpuP99', 'p99', ms],
      ['workerCpuMax', 'Most', ms],
      ['workerWallP50', 'Worker wall p50', ms],
      ['workerWallP99', 'p99', ms],
      ['workerWallMax', 'Most', ms],
      ['workerMemoryMax', 'Worker memory', bytes],
      ['doCpuP50', 'Object CPU p50', ms],
      ['doCpuP99', 'p99', ms],
      ['doWallP50', 'Object wall p50', ms],
      ['doWallP99', 'p99', ms],
      ['doWallMax', 'Most', ms],
      ['doMemoryP50', 'Object memory p50', bytes],
      ['doMemoryP99', 'p99', bytes],
      ['doMemoryMax', 'Most', bytes],
    ],
  },
  {
    title: 'Failures by day',
    rows: (cf) => cf.days,
    first: (d) => shortDay(d.date),
    columns: [
      ['workerErrors', 'Worker errors', count],
      ['clientDisconnects', 'Disconnects', count],
      ['doErrors', 'Object errors', count],
      ['exceededCpu', 'CPU limit hit', count],
      ['exceededMemory', 'Memory limit hit', count],
      ['fatalErrors', 'Internal failures', count],
    ],
  },
  { title: 'Busiest objects', recent: true, rows: (cf) => cf.breakdowns.matches, first: (r) => r.name || '(unnamed)', columns: OBJECT_COLUMNS },
  { title: 'Objects by class', recent: true, rows: (cf) => cf.breakdowns.classes, first: (r) => r.class, columns: OBJECT_COLUMNS },
  { title: 'Object data centers', recent: true, rows: (cf) => cf.breakdowns.objectColos, first: (r) => r.coloCode, columns: OBJECT_COLUMNS },
  {
    title: 'Object requests by kind (30 days)',
    rows: (cf) => Object.entries(cf.requestTypes || {}).sort((a, b) => b[1] - a[1]).map(([type, requests]) => ({ type, requests })),
    first: (r) => r.type,
    columns: REQUESTS,
  },
  { title: 'How object requests ended', recent: true, rows: (cf) => cf.breakdowns.objectStatus, first: (r) => r.status, columns: REQUESTS },
  {
    title: 'Worker scripts',
    recent: true,
    rows: (cf) => cf.breakdowns.scripts,
    first: (r) => r.scriptName,
    columns: [
      ['requests', 'Requests', count],
      ['errors', 'Errors', count],
      ['subrequests', 'Outgoing calls', count],
      ['cpuTimeUs', 'CPU', (n) => ms(n / 1000)],
      ['responseBodySize', 'Data sent', bytes],
    ],
  },
  {
    title: 'Worker versions',
    recent: true,
    rows: (cf) => cf.breakdowns.versions,
    first: (r) => `${r.scriptName} ${(r.scriptVersion || '').slice(0, 8)}`,
    columns: [...REQUESTS, ['errors', 'Errors', count]],
  },
  { title: 'How Worker requests ended', recent: true, rows: (cf) => cf.breakdowns.workerStatus, first: (r) => r.status, columns: REQUESTS },
  { title: 'Worker data centers', recent: true, rows: (cf) => cf.breakdowns.workerColos, first: (r) => r.coloCode, columns: [...REQUESTS, ['errors', 'Errors', count]] },
  {
    title: 'Static files',
    recent: true,
    rows: ({ breakdowns: b }) => [
      ...(b.assetStatus ?? []).map((r) => ({ label: `Status ${r.statusCode}`, requests: r.requests })),
      ...(b.assetCache ?? []).map((r) => ({ label: `Cache: ${r.cacheStatus || 'none'}`, requests: r.requests })),
      ...(b.assetHosts ?? []).map((r) => ({ label: r.hostname, requests: r.requests })),
      ...(b.assetColos ?? []).map((r) => ({ label: `Data center ${r.coloCode}`, requests: r.requests })),
    ],
    first: (r) => r.label,
    columns: REQUESTS,
  },
  {
    title: 'Outgoing calls',
    recent: true,
    rows: (cf) => [...(cf.breakdowns.calls ?? []), ...(cf.breakdowns.callOutcomes ?? [])],
    first: (r) => r.hostname ?? `Outcome: ${r.requestOutcome}`,
    columns: [
      ['subrequests', 'Calls', count],
      ['requestBodySize', 'Sent', bytes],
      ['responseBodySize', 'Received', bytes],
      ['timeToResponseUs', 'Average answer', (n, r) => ms(n / 1000 / (r.subrequests || 1))],
    ],
  },
  {
    title: 'Deployments',
    rows: (cf) => cf.deployment.deployments,
    first: (d) => when(d.createdOn),
    columns: [
      ['source', 'How', plainText],
      ['versions', 'Versions', (versions) => versions.map((v) => `${v.id.slice(0, 8)} ${v.percentage}%`).join(', ')],
      ['message', 'Message', plainText],
    ],
  },
  {
    title: 'Scripts on the account',
    rows: (cf) => cf.deployment.scripts,
    first: (s) => s.name,
    columns: [
      ['modifiedOn', 'Changed', when],
      ['createdOn', 'Created', when],
      ['usageModel', 'Usage model', plainText],
    ],
  },
  {
    title: 'Durable Object classes',
    rows: (cf) => cf.deployment.namespaces,
    first: (n) => n.class,
    columns: [
      ['script', 'Script', plainText],
      ['sqlite', 'SQLite', (yes) => (yes ? 'Yes' : 'No')],
    ],
  },
];

/** The panels stay put between refreshes, so one left open stays open. */
const panelViews = new Map();

function panelView(panel) {
  if (panelViews.has(panel)) return panelViews.get(panel);
  const details = document.createElement('details');
  details.className = 'admin-more';
  const summary = document.createElement('summary');
  const wrap = document.createElement('div');
  wrap.className = 'admin-table-wrap';
  const table = document.createElement('table');
  table.className = 'admin-table';
  const head = document.createElement('thead');
  const body = document.createElement('tbody');
  table.append(head, body);
  wrap.append(table);
  details.append(summary, wrap);
  $('cloudflarePanels').append(details);
  const view = { details, summary, head, body };
  panelViews.set(panel, view);
  return view;
}

function renderPanels(cf) {
  for (const panel of PANELS) {
    const view = panelView(panel);
    const source = panel.rows(cf) ?? [];
    const rows = source === cf.days || source === cf.hours ? source.slice().reverse() : source; // newest first
    const columns = panel.columns.filter(([k]) => rows.some((r) => r[k] != null));
    view.details.hidden = !rows.length || !columns.length;
    view.summary.textContent = panel.recent ? `${panel.title} (${cf.recentDays} days)` : panel.title;
    view.head.replaceChildren(row('th', ['', ...columns.map(([, label]) => label)]));
    view.body.replaceChildren(
      ...rows.map((r) => row('td', [panel.first(r), ...columns.map(([k, , format]) => (r[k] == null ? '–' : format(r[k], r)))])),
    );
  }
}

function amount(n, unit) {
  if (n == null) return '–';
  if (unit === 'GB-month' || unit === 'GB') return `${n.toFixed(n < 1 ? 4 : 2)} ${unit}`;
  return unit ? `${count(n)} ${unit}` : count(n);
}

/** Share of a limit, with its bar. */
function shareCell(share) {
  const td = document.createElement('td');
  if (share == null) {
    td.textContent = '–';
    return td;
  }
  const meter = document.createElement('div');
  meter.className = 'admin-meter admin-meter-small';
  const bar = document.createElement('i');
  bar.style.width = `${Math.min(share, 1) * 100}%`;
  bar.classList.toggle('near', share >= 0.8);
  bar.classList.toggle('full', share >= 1);
  meter.append(bar);
  td.append(`${share < 0.01 && share > 0 ? '<1' : Math.floor(share * 100)}%`, meter);
  return td;
}

function limitRow(l) {
  const tr = row('td', [l.label, amount(l.used, l.unit), amount(l.limit, l.unit)]);
  tr.append(shareCell(l.share));
  const pace = l.runsOutAt ? `runs out ${clock(l.runsOutAt)}` : amount(l.projected, l.unit);
  tr.append(cell('td', pace));
  return tr;
}

function renderCloudflare(cf) {
  $('cloudflare').hidden = !cf;
  if (!cf) return;
  $('cloudflareError').hidden = cf.ok;
  $('cloudflareError').textContent = cf.ok ? '' : `Could not get usage from Cloudflare${cf.error ? `: ${cf.error}` : ''}.`;
  $('cloudflareUsage').hidden = !cf.ok;
  if (!cf.ok) return;
  const free = cf.plan === 'free';
  const pace = `about ${dollars(cf.projectedCost)} for ${cf.month} at this pace (day ${Math.ceil(cf.elapsedDays)} of ${cf.daysInMonth})`;
  if (free) {
    const top = cf.limits.filter((l) => l.share != null).sort((a, b) => b.share - a.share)[0];
    $('cloudflareHeadline').textContent = 'Free plan';
    $('cloudflareDetail').textContent = top ? `closest to a limit: ${top.label}, ${Math.floor(top.share * 100)}% used` : '';
    $('cloudflareNote').textContent = `Each limit resets at 00:00 UTC. On Workers Paid this month would be ${dollars(cf.cost)} so far, ${pace}.`;
  } else {
    $('cloudflareHeadline').textContent = `${dollars(cf.cost)} so far`;
    $('cloudflareDetail').textContent = pace;
    $('cloudflareNote').textContent = 'Workers Paid: $5 a month, plus what goes over each allowance.';
  }
  $('cloudflareAlerts').replaceChildren(
    ...cf.alerts.map(({ level, text }) => {
      const li = cell('li', text);
      li.className = level;
      return li;
    }),
  );
  $('cloudflareAlerts').hidden = !cf.alerts.length;
  $('cloudflareLimitsBlock').hidden = !free; // on Workers Paid, the bill below shows the same numbers
  $('cloudflareLimits').replaceChildren(...cf.limits.map(limitRow));
  $('cloudflareBillTitle').textContent = free ? `What ${cf.month} would cost on Workers Paid` : `${cf.month}, estimated`;
  $('cloudflareLines').replaceChildren(
    row('td', ['Plan', '', '', dollars(cf.base), dollars(cf.base)]),
    ...cf.lines.map((l) => row('td', [l.label, amount(l.used, l.unit), amount(l.included, l.unit), dollars(l.cost), dollars(l.projectedCost)])),
  );
  renderPanels(cf);
  const deployment = cf.deployment.error ? ' Add Workers Scripts: Read to the token to also see what is deployed.' : '';
  $('cloudflareFootnote').textContent =
    `The whole account counts, like the limits and the bill. Fetched ${new Date(cf.fetchedAt).toLocaleTimeString()}, at most every 5 minutes, and Cloudflare's own figures run a few minutes behind and are partly sampled. Incoming messages to sleeping objects bill 20 to 1.${deployment}`;
}

function renderMetered(metered) {
  $('metered').hidden = !metered;
  if (!metered) return;
  $('meteredError').hidden = metered.ok;
  $('meteredUsage').hidden = !metered.ok;
  if (!metered.ok) return;
  const gb = (n = 0) => bytes(Math.round(n * 1e9));
  const share = metered.quotaGB ? metered.usedGB / metered.quotaGB : 0;
  $('meteredUsed').textContent = gb(metered.usedGB);
  $('meteredQuota').textContent = `of ${gb(metered.quotaGB)} (${Math.round(share * 100)}%)`;
  $('meteredBar').style.width = `${Math.min(share, 1) * 100}%`;
  $('meteredWarning').hidden = !(metered.overageGB > 0 || share >= 0.8);
  $('meteredWarning').textContent = metered.overageGB > 0
    ? `Warning: ${gb(metered.overageGB)} over quota. Overage is billed.`
    : 'Warning: over 80% of the quota is used.';
  const used = metered.days.filter((d) => d.usedGB > 0).reverse();
  const table = document.createElement('table');
  table.className = 'admin-table';
  const body = document.createElement('tbody');
  body.append(...used.map((d) => row('td', [shortDay(d.date), gb(d.usedGB)])));
  table.append(body);
  $('meteredDays').replaceChildren(used.length ? table : cell('p', 'No daily usage recorded this cycle.'));
  if (!used.length) $('meteredDays').firstChild.className = 'muted admin-note';
}

function renderServices({ store, turn, metered, cloudflare }) {
  let storage = 'Unavailable';
  if (store.ok && store.type === 'memory') storage = 'In memory on this server (local)';
  else if (store.ok) storage = `Durable Objects, one per match; stats answered in ${store.latencyMs} ms`;
  $('services').replaceChildren(
    row('td', ['Matches', storage]),
    row('td', ['TURN relay', turn.hosts.length ? turn.hosts.join(', ') : 'Not configured (STUN only)']),
    row('td', ['Metered', metered ? 'Configured' : 'Not configured (METERED_APP, METERED_SECRET_KEY)']),
    row('td', ['Cloudflare usage', cloudflare ? 'Configured' : 'Not configured (CF_ACCOUNT_ID, CF_API_TOKEN)']),
  );
}

function render(report) {
  const inVoice = report.live.voice.reduce((n, room) => n + room.people, 0);
  $('liveVoice').textContent = inVoice;
  $('liveRooms').textContent = report.live.voice.length
    ? report.live.voice.map((room) => `${room.match} (${room.people})`).join(', ')
    : 'Nobody';
  $('liveOnline').textContent = report.live.online;
  $('liveMatches').textContent = `in ${report.live.matches} ${report.live.matches === 1 ? 'match' : 'matches'}`;
  renderCloudflare(report.cloudflare);
  renderMetered(report.metered);
  renderPeriods(report);
  renderDays(report);
  renderServices(report.services);
  $('updated').textContent = `Updated ${new Date(report.now).toLocaleTimeString()}`;
}

// ---- data -----------------------------------------------------------------------

function showLogin(message) {
  clearTimeout(timer);
  sessionStorage.removeItem(KEY);
  $('dash').hidden = true;
  $('login').hidden = false;
  $('loginError').hidden = !message;
  $('loginError').textContent = message || '';
  $('password').focus();
}

async function refresh() {
  clearTimeout(timer);
  const password = sessionStorage.getItem(KEY);
  if (!password) return showLogin();
  try {
    const res = await fetch('/api/admin', { headers: { authorization: `Bearer ${password}` }, cache: 'no-store' });
    const body = await res.json();
    if (LOGIN_ERRORS[body.error]) return showLogin(LOGIN_ERRORS[body.error]);
    if (!res.ok) throw new Error(body.error);
    render(body);
    $('login').hidden = true;
    $('dash').hidden = false;
    $('stale').hidden = true;
  } catch {
    if ($('dash').hidden) showLogin('Could not reach the server.');
    else {
      $('stale').textContent = 'Could not refresh. These numbers may be out of date.';
      $('stale').hidden = false;
    }
    if ($('dash').hidden) return;
  }
  if (!document.hidden) timer = setTimeout(refresh, REFRESH_MS);
}

$('login').addEventListener('submit', (e) => {
  e.preventDefault();
  sessionStorage.setItem(KEY, $('password').value);
  $('password').value = '';
  refresh();
});

$('signOut').addEventListener('click', () => showLogin());

// Don't spend requests on a tab nobody is looking at.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (!$('dash').hidden) refresh();
});

refresh();
