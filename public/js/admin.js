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

// Cloudflare's usage, as the bill counts it.
const CLOUDFLARE_DAYS = [
  ['workerRequests', 'Worker requests', count],
  ['doRequests', 'Object requests', count],
  ['doRequestsBilled', 'Billed as', count],
  ['socketMessagesIn', 'Messages in', count],
  ['socketMessagesOut', 'Messages out', count],
  ['doDuration', 'Duration GB-s', count],
  ['doCpuMs', 'Object CPU ms', count],
  ['workerCpuMs', 'Worker CPU ms', count],
  ['rowsWritten', 'Rows written', count],
  ['rowsRead', 'Rows read', count],
  ['storedBytes', 'Stored', bytes],
];

function amount(n, unit) {
  if (unit === 'GB-month') return `${n.toFixed(n < 1 ? 4 : 2)} GB-month`;
  return unit ? `${count(n)} ${unit}` : count(n);
}

function renderCloudflare(cf) {
  $('cloudflare').hidden = !cf;
  if (!cf) return;
  $('cloudflareError').hidden = cf.ok;
  $('cloudflareError').textContent = cf.ok ? '' : `Could not get usage from Cloudflare${cf.error ? `: ${cf.error}` : ''}.`;
  $('cloudflareUsage').hidden = !cf.ok;
  if (!cf.ok) {
    for (const id of ['cloudflareLines', 'cloudflareDaysHead', 'cloudflareDays']) $(id).replaceChildren();
    $('cloudflareTypes').textContent = '';
    return;
  }
  $('cloudflareCost').textContent = `${dollars(cf.cost)} so far`;
  $('cloudflarePace').textContent = `about ${dollars(cf.projectedCost)} for ${cf.month} at this pace (day ${Math.ceil(cf.elapsedDays)} of ${cf.daysInMonth})`;
  $('cloudflareLines').replaceChildren(
    row('td', ['Plan', '', '', dollars(cf.base), dollars(cf.base)]),
    ...cf.lines.map((l) => row('td', [l.label, amount(l.used, l.unit), amount(l.included, l.unit), dollars(l.cost), dollars(l.projectedCost)])),
  );
  const days = cf.days.slice().reverse();
  $('cloudflareDaysHead').replaceChildren(row('th', ['', ...CLOUDFLARE_DAYS.map(([, label]) => label)]));
  $('cloudflareDays').replaceChildren(...days.map((d) => row('td', [shortDay(d.date), ...CLOUDFLARE_DAYS.map(([k, , format]) => format(d[k]))])));
  const types = Object.entries(cf.requestTypes || {}).sort((a, b) => b[1] - a[1]);
  $('cloudflareTypes').textContent = types.length
    ? `Object requests by kind: ${types.map(([type, n]) => `${type} ${count(n)}`).join(', ')}. Incoming messages to sleeping objects bill 20 to 1.`
    : '';
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
