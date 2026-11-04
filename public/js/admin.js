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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
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

function renderPeriods(report) {
  const { days, total } = report;
  const periods = [days.slice(-1), days.slice(-7), days].map(sum);
  periods.push(total);
  const line = (label, format) => row('td', [label, ...periods.map(format)]);
  $('periods').replaceChildren(
    line('Voice joins', (p) => String(p.voiceJoins || 0)),
    line('Game socket data', (p) => bytes((p.socketIn || 0) + (p.socketOut || 0))),
  );
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

function renderServices({ store, turn }) {
  let storage = 'Unavailable';
  if (store.ok && store.type === 'memory') storage = 'In memory on this server (not shared)';
  else if (store.ok) {
    const memory = store.usedMemory
      ? `${bytes(store.usedMemory)}${store.maxMemory ? ` of ${bytes(store.maxMemory)}` : ''} used, `
      : '';
    storage = `OK, ${memory}${plural(store.keys, 'key')}, ${store.latencyMs} ms`;
  }
  $('services').replaceChildren(
    row('td', ['Redis', storage]),
    row('td', ['TURN relay', turn.hosts.length ? turn.hosts.join(', ') : 'Not configured (STUN only)']),
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
  renderMetered(report.metered);
  renderPeriods(report);
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

// Don't spend Redis commands on a tab nobody is looking at.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (!$('dash').hidden) refresh();
});

refresh();
