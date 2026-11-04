import { BoardView } from './board.js';
import { tileHTML, tileKey } from './tiles.js';
import * as fx from './fx.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';
import { createVoice } from './voice.js';
import * as avatar from './avatar.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const matchId = decodeURIComponent(location.pathname.split('/')[2] || '').toLowerCase();

// ---- identity (no login: a random token kept on this device) ----------------

function randomHex(bytes) {
  // crypto.randomUUID needs a secure context; plain LAN http:// does not have one.
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const token = localStorage.getItem('domino.token') || randomHex(16);
localStorage.setItem('domino.token', token);
let myName = localStorage.getItem('domino.name') || t('player', { n: Math.floor(Math.random() * 90 + 10) });
localStorage.setItem('domino.name', myName);
let myPhoto = avatar.load();
const photos = {}; // the other players' photos by seat `pid`, for this page only

// ---- connection -------------------------------------------------------------

// Spotty networks (mobile, wifi handoffs) often leave a socket half-open: it
// looks connected but nothing gets through and `onclose` fires much later. So
// we expect traffic: the server answers every `ping`, and if nothing arrives
// within a deadline we drop the socket ourselves and dial again.
const PING_MS = 10000; // idle ping interval
const SILENCE_MS = 25000; // no message for this long → assume the socket is dead
const ACK_MS = 6000; // after an action, expect a reply this fast
const CONNECT_MS = 8000; // give up on a handshake that hangs

// Vercel ends a function, and its sockets, at 300 s. Well before that we open a
// replacement socket and switch to it once the server has joined it to the
// match, so nobody sees a drop. Jitter keeps players from all switching at once.
const ROTATE_MS = 240000;
const ROTATE_JITTER_MS = 30000;
const ROTATE_RETRY_MS = 10000; // the replacement failed; there is still time to try again

let ws;
let standby = null; // replacement socket that isn't in use yet
let standbyTimer;
let rotateAt = 0;
let voiceSession; // same across a handover, so voice peers keep their connection
let retry = 0;
let retryTimer;
let deadline = 0; // drop the socket if nothing arrives before this time
let bannerTimer;

const dial = () => new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?match=${encodeURIComponent(matchId)}`);
const hello = () => ({ t: 'hello', token, name: myName, session: voiceSession, inVoice: voice.joined });
const scheduleRotation = () => (rotateAt = Date.now() + ROTATE_MS + Math.random() * ROTATE_JITTER_MS);

function connect() {
  clearTimeout(retryTimer);
  if (ws && ws.readyState <= 1) return;
  voiceSession = randomHex(8);
  const sock = dial();
  adopt(sock);
  deadline = Date.now() + CONNECT_MS;
  sock.onopen = () => {
    deadline = Date.now() + SILENCE_MS;
    scheduleRotation();
    send(hello());
  };
}

/** Make this the socket the game talks through. */
function adopt(sock) {
  ws = sock;
  sock.onmessage = (e) => {
    deadline = Date.now() + SILENCE_MS;
    retry = 0; // only count a connection as good once the server talks back
    setConnected(true);
    const msg = JSON.parse(e.data);
    if (msg.t === 'state') render(msg);
    else if (msg.t === 'error') toast(t(msg.message));
    else if (msg.t === 'voice') voice.receive(msg.from, msg.data);
    else if (msg.t === 'avatar') receivePhoto(msg);
    else if (msg.t === 'voiceConfig') {
      voice.setConfig(msg);
      // Joined: show the others our photo and collect theirs.
      sendBestEffort({ t: 'avatar', image: myPhoto, ask: true });
    }
  };
  sock.onclose = () => {
    if (ws === sock) reconnectLater();
  };
}

/** Open a replacement socket alongside the current one. */
function rotate() {
  const sock = dial();
  let latest = null;
  const fail = () => {
    if (standby !== sock) return;
    dropStandby();
    rotateAt = Date.now() + ROTATE_RETRY_MS;
  };
  standby = sock;
  standbyTimer = setTimeout(fail, CONNECT_MS);
  sock.onopen = () => sock.send(JSON.stringify(hello()));
  sock.onclose = fail;
  // Until it takes over, the current socket delivers everything. The server
  // sends voiceConfig after joining, so from then on this socket misses nothing.
  sock.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'state') latest = msg;
    else if (msg.t === 'voiceConfig') handOver(sock, msg, latest);
  };
}

function handOver(sock, config, latest) {
  clearTimeout(standbyTimer);
  standby = null;
  retire(ws);
  adopt(sock);
  deadline = Date.now() + SILENCE_MS;
  scheduleRotation();
  voice.setConfig(config);
  if (latest) render(latest);
}

/** Close a socket on purpose; `handoff` stops the server hanging up on our voice peers. */
function retire(sock) {
  if (!sock) return;
  sock.onopen = sock.onmessage = sock.onclose = null;
  try {
    if (sock.readyState === 1) sock.send(JSON.stringify({ t: 'handoff' }));
    sock.close();
  } catch {}
}

function dropStandby() {
  clearTimeout(standbyTimer);
  retire(standby);
  standby = null;
}

/** Abandon the current socket (even if the browser still thinks it is open). */
function drop() {
  const sock = ws;
  ws = null;
  if (sock) {
    sock.onopen = sock.onmessage = sock.onclose = null;
    try {
      sock.close();
    } catch {}
  }
  reconnectLater();
}

function reconnectLater() {
  ws = null;
  dropStandby(); // voice has to rejoin after a real drop, so start clean
  setConnected(false);
  clearTimeout(retryTimer);
  // Exponential backoff with jitter so a server blip doesn't get every client
  // reconnecting in lockstep.
  const base = Math.min(8000, 500 * 2 ** retry++);
  retryTimer = setTimeout(connect, base / 2 + Math.random() * (base / 2));
}

/** Try right away (network came back, tab became visible) instead of waiting. */
function reconnectNow() {
  if (ws?.readyState === 1 && Date.now() < deadline) return;
  if (ws?.readyState === 0) return; // already dialing; the connect deadline covers it
  retry = 0;
  if (ws) drop();
  connect();
}

function setConnected(ok) {
  clearTimeout(bannerTimer);
  if (ok) {
    $('conn').hidden = true;
    document.body.classList.remove('offline');
    return;
  }
  // Brief blips reconnect before anyone notices; don't flash the banner.
  bannerTimer = setTimeout(() => {
    $('conn').textContent = navigator.onLine === false ? t('noNetwork') : t('reconnecting');
    $('conn').hidden = false;
    document.body.classList.add('offline');
  }, 1200);
}

function send(msg) {
  if (ws?.readyState !== 1) {
    if (msg.t !== 'ping') {
      toast(t('notConnected'));
      reconnectNow();
    }
    return false;
  }
  ws.send(JSON.stringify(msg));
  if (msg.t !== 'ping') {
    // Probe right behind the action so a dead socket is noticed in seconds
    // rather than after the idle timeout.
    ws.send(JSON.stringify({ t: 'ping' }));
    deadline = Math.min(deadline, Date.now() + ACK_MS);
  }
  return true;
}

setInterval(() => {
  if (!ws) return;
  // Hidden tabs get their timers throttled, so silence there proves nothing;
  // coming back to the tab re-checks the socket (see visibilitychange).
  if (document.visibilityState === 'visible' && Date.now() > deadline) return drop();
  if (ws.readyState !== 1) return;
  send({ t: 'ping' });
  if (!standby && Date.now() > rotateAt) rotate();
}, PING_MS);

window.addEventListener('online', reconnectNow);
window.addEventListener('offline', () => ws && drop());
window.addEventListener('pageshow', (e) => e.persisted && reconnectNow());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    reconnectNow();
    requestWakeLock();
  }
});

// ---- helpers ----------------------------------------------------------------

let state = null;
let drag = null; // tile being dragged from the hand, to the board or to a new slot
let handOrder = []; // my hand's tile keys, left to right, as I arranged them
const board = new BoardView($('board'));

const me = () => state?.you ?? -1;
const myTeam = () => (me() === -1 ? 0 : me() % 2);
// Position around the table relative to me: 0 bottom, 1 right, 2 top, 3 left.
const posOf = (seat) => (seat - (me() === -1 ? 0 : me()) + 4) % 4;
const seatAt = (pos) => ((me() === -1 ? 0 : me()) + pos) % 4;
const teamLabel = (team) => (me() === -1 ? t('team', { n: team + 1 }) : team === myTeam() ? t('us') : t('them'));
const seatName = (seat) => (seat === me() ? t('you') : state.seats[seat]?.name ?? '—');

let toastTimer;
function toast(text, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const buzz = (pattern) => navigator.vibrate?.(pattern);

let wakeLock = null;
async function requestWakeLock() {
  if (state?.phase !== 'playing' || wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {}
}

const inviteUrl = () => `${location.origin}/play/${matchId}`;

async function share() {
  const url = inviteUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: t('shareTitle'), text: t('shareText'), url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  if (await copy(url)) toast(t('linkCopied'));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = $('inviteUrl');
    input.value = text;
    input.select();
    if (document.execCommand('copy')) return true;
    toast(t('copyFailed'), 3200);
    return false;
  }
}

let copiedTimer;
async function copyInvite() {
  if (!(await copy(inviteUrl()))) return;
  const btn = $('copyBtn');
  btn.dataset.i18n = 'copied';
  btn.textContent = t('copied');
  btn.classList.add('done');
  buzz(15);
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    btn.dataset.i18n = 'copy';
    btn.textContent = t('copy');
    btn.classList.remove('done');
  }, 1800);
}

// ---- render -----------------------------------------------------------------

const hasManguangua = (st) => st.seats.some((s) => s?.bot && s.name === 'El Manguangua');

function render(next) {
  const prev = state;
  state = next;
  const r = state.round;

  renderScores();
  renderLobby();
  renderSeats();
  voice.updateMeta({ seat: me(), name: myName });
  paintVoice();
  renderBoard();
  renderHand();
  renderStatus();
  renderResult(prev);
  renderScoreSheet();
  $('reactBtn').hidden = me() === -1 || state.phase === 'lobby';
  if ($('reactBtn').hidden) $('reactBar').hidden = true;

  // Feedback for what just happened.
  const la = r?.lastAction;
  const pla = prev?.round?.lastAction;
  if (la && JSON.stringify(la) !== JSON.stringify(pla) && prev?.roundNo === state.roundNo) {
    if (la.type === 'pass') {
      toast(la.seat === me() ? t('youPass') : t('passes', { name: seatName(la.seat) }));
      sound.play('pass');
    } else if (la.type === 'play') {
      if (la.seat === me()) sound.play('place');
      else flyTile(la);
    }
  }
  if (prev && hasManguangua(state) && !hasManguangua(prev)) toast(t('manguangua'), 3200);
  if (prev && state.reaction && state.reaction.n !== prev.reaction?.n) showReaction(state.reaction);
  if (prev && state.blunder && state.blunder.n !== prev.blunder?.n && state.blunder.seat !== me()) {
    floatEmoji(state.blunder.seat, '🤡');
    sound.play('laugh');
  }
  const myTurnNow = r && r.turn === me() && state.phase === 'playing';
  const myTurnBefore = prev?.round && prev.round.turn === prev.you && prev.phase === 'playing';
  if (myTurnNow && !myTurnBefore && r.legal.length) {
    whenLanded(() => {
      buzz(30);
      sound.play('turn');
    });
  }

  requestWakeLock();
}

function renderScores() {
  const left = myTeam();
  const right = 1 - left;
  $('label0').textContent = teamLabel(left);
  $('label1').textContent = teamLabel(right);
  $('score0').textContent = state.scores[left];
  $('score1').textContent = state.scores[right];
  $('scoreBtn').querySelector('.t0').dataset.team = left;
  $('scoreBtn').querySelector('.t1').dataset.team = right;
  $('target').textContent = state.target;
  $('roundNo').textContent = state.phase === 'lobby' ? t('lobby') : t('round', { n: state.roundNo });
}

function renderLobby() {
  const show = state.phase === 'lobby';
  $('lobby').hidden = !show;
  if (!show) return;
  $('matchCode').textContent = matchId;
  $('inviteUrl').value = inviteUrl();
  if (document.activeElement !== $('nameInput')) $('nameInput').value = myName;

  // Fixed layout: seat 0 bottom, 1 right, 2 top, 3 left. Partners sit across.
  const cells = ['bottom', 'right', 'top', 'left'];
  $('lobbySeats').innerHTML =
    state.seats
      .map((s, i) => {
        const mine = i === me();
        let body;
        if (!s) body = `<span class="name muted">${t('empty')}</span><span class="act">${t('tapToSit')}</span>`;
        else if (s.bot)
          body = `<span class="name bot-name">${s.emoji ?? '🤖'} ${botName(s.name)}</span><span class="act" data-remove="${i}">🤖 ${t('remove')}</span>`;
        else
          body = `<span class="name">${photoOf(i) ? photoImg(photoOf(i), 'lobby-photo') : ''}${esc(mine ? t('youSuffix', { name: s.name }) : s.name)}</span>${
            mine ? `<span class="act" data-stand>${t('standUp')}</span>` : `<span class="act">${s.online ? t('ready') : t('offline')}</span>`
          }`;
        return `<button class="lobby-seat ${cells[i]}" data-team="${i % 2}" data-sit="${i}" ${
          mine ? 'aria-current="true"' : ''
        }><span class="team-tag">${t('team', { n: (i % 2) + 1 })}</span>${body}</button>`;
      })
      .join('') + `<div class="lobby-felt"></div>`;

  for (const b of $('targetPicker').children) b.classList.toggle('on', Number(b.dataset.target) === state.target);
  const full = !state.seats.includes(null);
  $('botsBtn').disabled = full;
  $('startBtn').disabled = !full || me() === -1;
  $('startBtn').textContent = me() === -1 ? t('takeSeatToStart') : full ? t('start') : t('waitingFor4');
}

const photoOf = (seat) => (seat === me() ? myPhoto : photos[state.seats[seat]?.pid]);
const photoImg = (photo, cls) => `<img class="${cls}" src="${esc(photo)}" alt="" />`;

// Where the longest bot names may hyphenate to fit the narrow side seats.
const botName = (name) => esc(name).replace('Manguangua', 'Manguan&shy;gua').replace('Bachaquero', 'Bacha&shy;quero').replace('Exprópiese', 'Expró&shy;piese');

function seatHTML(seat, pos) {
  const s = state.seats[seat];
  if (!s) return '';
  const r = state.round;
  const turn = r && r.turn === seat && state.phase === 'playing';
  const passed = r?.lastAction?.type === 'pass' && r.lastAction.seat === seat;
  const photo = photoOf(seat);
  const initial = s.bot ? s.emoji ?? '🤖' : photo ? photoImg(photo, 'avatar-photo') : esc([...s.name][0]?.toUpperCase() ?? '?');
  const canBotify = !s.bot && !s.online && me() !== -1 && state.phase !== 'lobby';
  const canTake = s.bot && me() === -1 && state.phase !== 'lobby';
  const backs = pos === 2 ? `<span class="backs">${'<i></i>'.repeat(s.count)}</span>` : '';
  return `
    <div class="avatar ${turn ? 'turn' : ''}" data-team="${s.team}">${initial}${s.bot ? '<b class="bot-tag">🤖</b>' : ''}${s.online ? '' : '<b class="off"></b>'}</div>
    <div class="seat-info">
      ${s.bot ? `<span class="name bot-name">${botName(s.name)}</span>` : `<span class="name">${esc(seat === me() ? t('you') : s.name)}</span>`}
      ${pos === 0 ? '' : `<span class="count" title="${t('tilesLeft')}">${s.count}</span>`}
      ${backs}
    </div>
    ${passed ? `<span class="bubble">${t('pass')}</span>` : ''}
    ${canBotify ? `<button class="mini-btn" data-botify="${seat}">${t('useBot')}</button>` : ''}
    ${canTake ? `<button class="mini-btn" data-sit="${seat}">${t('takeSeat')}</button>` : ''}`;
}

function renderSeats() {
  const ids = ['seat-me', 'seat-right', 'seat-top', 'seat-left'];
  for (let pos = 0; pos < 4; pos++) {
    const seat = seatAt(pos);
    const el = $(ids[pos]);
    el.innerHTML = state.phase === 'lobby' && pos !== 0 ? '' : seatHTML(seat, pos);
    el.dataset.team = seat % 2;
  }
}

function renderBoard() {
  const r = state.round;
  board.set(r ? r.line : [], r ? r.center : 0);
  const last = r?.lastAction?.type === 'play' ? tileKey(r.lastAction.tile) : null;
  for (const [key, node] of board.nodes) {
    node.classList.toggle('last', key === last);
    if (key === last) node.dataset.team = r.lastAction.seat % 2;
  }

  let hint = '';
  if (r && !r.line.length && state.phase === 'playing') {
    if (r.turn === me()) hint = r.mustPlay ? t('openDoubleSix') : t('youOpen');
    else hint = t(r.mustPlay ? 'opensDoubleSix' : 'opens', { name: seatName(r.turn) });
  }
  $('boardEmpty').textContent = hint;
}

const sortHand = (hand) =>
  hand
    .map((t) => (t[0] <= t[1] ? t : [t[1], t[0]]))
    .sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);

/** Keep my arrangement as tiles get played; a tile I haven't seen means a new deal. */
function syncHandOrder(hand) {
  const keys = sortHand(hand).map(tileKey);
  handOrder = keys.every((k) => handOrder.includes(k)) ? handOrder.filter((k) => keys.includes(k)) : keys;
}

function renderHand() {
  const r = state.round;
  const handEl = $('hand');
  const hand = r?.hand;
  if (!hand) {
    handEl.innerHTML =
      me() === -1 && state.phase !== 'lobby' ? `<p class="muted center">${t('watchingHint')}</p>` : '';
    cancelDrag();
    return;
  }
  const myTurn = r.turn === me() && state.phase === 'playing';
  if (drag && state.phase !== 'playing') cancelDrag();
  syncHandOrder(hand);

  handEl.innerHTML = handOrder
    .map((key) => {
      const tile = key.split('-').map(Number);
      const cls = [
        'tile v hand-tile',
        myTurn ? 'playable' : '',
        drag?.key === key ? 'dragging' : '',
      ].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-label="${t('aria.tile', { a: tile[0], b: tile[1] })}">${tileHTML(tile[0], tile[1], false)}</button>`;
    })
    .join('');
  handEl.style.setProperty('--n', Math.max(hand.length, 5));
  // State can arrive mid-drag and the buttons were just rebuilt.
  if (drag) drag.btn = handEl.querySelector(`[data-key="${drag.key}"]`);
}

function renderStatus() {
  const r = state.round;
  let text = '';
  let cls = '';
  if (state.phase === 'lobby') text = t('waitingPlayers');
  else if (state.phase === 'playing' && r) {
    if (r.turn === me()) {
      cls = 'mine';
      text = r.legal.length ? t('yourTurn') : t('autoPass');
    } else if (me() === -1) text = t('watchingTurn', { name: seatName(r.turn) });
    else text = t('turnOf', { name: seatName(r.turn) });
  } else if (state.phase === 'roundEnd') text = t('roundOver');
  else if (state.phase === 'matchEnd') text = t('matchOver');
  $('status').textContent = text;
  $('status').className = `status ${cls}`;
}

// ---- playing a tile ---------------------------------------------------------

/** Board ends the selected tile can go to ('L' / 'R'). */
function pickEnds(key) {
  return [...new Set(state.round.legal.filter((m) => tileKey(m.tile) === key).map((m) => m.end))];
}

function playTile(key, end) {
  const [a, b] = key.split('-').map(Number);
  send({ t: 'play', tile: [a, b], end });
  buzz(15);
}

function shake(btn) {
  btn.classList.remove('shake');
  void btn.offsetWidth;
  btn.classList.add('shake');
}

const DRAG_START = 6; // px of movement before a press becomes a drag

// Tiles can be picked up any time to rearrange them; playing one waits for your turn.
function onHandDown(e) {
  const btn = e.target.closest('.hand-tile');
  if (!btn || state?.phase !== 'playing' || drag || e.button > 0) return;
  e.preventDefault();
  drag = {
    key: btn.dataset.key,
    btn,
    id: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    ghost: null,
    target: null,
  };
}

function startGhost() {
  const rect = drag.btn.getBoundingClientRect();
  const ghost = drag.btn.cloneNode(true);
  ghost.className = 'tile v drag-ghost';
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.setProperty('--u', `${rect.width}px`);
  drag.dx = drag.x0 - rect.left;
  drag.dy = drag.y0 - rect.top;
  drag.ghost = ghost;
  document.body.append(ghost);
  drag.btn.classList.add('dragging');
  buzz(8);
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START) return;
    startGhost();
  }
  e.preventDefault();
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-4deg) scale(1.08)`;
  drag.target = dropTarget(e.clientX, e.clientY);
  for (const node of board.nodes.values()) node.classList.remove('drop-hover');
  $('board').classList.toggle('drop-hover', !!drag.target && !drag.target.node);
  drag.target?.node?.classList.add('drop-hover');
  board.preview(drag.target ? drag.key.split('-').map(Number) : null, drag.target?.end);
  if (within('hand', e.clientX, e.clientY)) moveInHand(e.clientX);
}

/** Slide the dragged tile to the hand slot under the pointer. */
function moveInHand(x) {
  const handEl = $('hand');
  const tiles = [...handEl.children];
  const gap = parseFloat(getComputedStyle(handEl).columnGap) || 0;
  const pitch = drag.btn.offsetWidth + gap;
  const rect = handEl.getBoundingClientRect();
  const left = rect.left + (rect.width - tiles.length * pitch + gap) / 2; // the row is centered
  const to = Math.min(Math.max(Math.floor((x - left) / pitch), 0), tiles.length - 1);
  const from = tiles.indexOf(drag.btn);
  if (to === from) return;

  const before = tiles.map((el) => el.offsetLeft);
  handEl.insertBefore(drag.btn, tiles[to > from ? to + 1 : to] ?? null);
  handOrder.splice(to, 0, handOrder.splice(from, 1)[0]);
  if (reduceMotion) return;
  tiles.forEach((el, i) => {
    const shift = before[i] - el.offsetLeft;
    if (shift && el !== drag.btn) el.animate({ translate: [`${shift}px 0`, '0 0'] }, { duration: 120, easing: 'ease-out' });
  });
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { key, ghost, btn, dx, dy } = drag;
  const myTurn = state.round.turn === me();
  const tapped = e.type === 'pointerup' && !ghost;
  const dropped = e.type === 'pointerup' && ghost;
  const target = dropped ? dropTarget(e.clientX, e.clientY) : null;
  const illegal = dropped && myTurn && !target && within('board', e.clientX, e.clientY);
  const rearranged = dropped && within('hand', e.clientX, e.clientY);
  if (illegal) drag.ghost = null; // the mock animation takes over the ghost
  cancelDrag();
  if (target) playTile(key, target.end);
  else if (illegal) mockMove(ghost, key, e.clientX - dx, e.clientY - dy);
  else if (tapped && myTurn) toast(t('dragHint'), 1400);
  else if (tapped || (ghost && !rearranged)) {
    shake(btn);
    if (!myTurn) toast(t('waitFor', { name: seatName(state.round.turn) }), 1200);
  }
}

function cancelDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.btn.classList.remove('dragging');
  drag = null;
  for (const node of board.nodes.values()) node.classList.remove('drop-hover');
  $('board').classList.remove('drop-hover');
  board.preview(null);
}

function within(id, x, y) {
  const r = $(id).getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Which legal end ('L' / 'R') is the pointer over? */
function dropTarget(x, y) {
  if (within('hand', x, y)) return null; // over the hand it's rearranging, not playing
  const ends = pickEnds(drag.key);
  if (!state.round.line.length) return within('board', x, y) && ends.length ? { end: ends[0], node: null } : null;

  const unit = parseFloat(getComputedStyle($('board')).getPropertyValue('--u')) || 24;
  const reach = Math.max(52, unit * 2.6);
  let best = null;
  for (const end of ends) {
    const node = [...board.nodes.values()].find((n) => n.classList.contains(end === 'L' ? 'end-l' : 'end-r'));
    if (!node) continue;
    const r = node.getBoundingClientRect();
    const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (dist > reach) continue;
    // A lone opening tile is both ends: pick the side the tile is dropped on.
    const side = x < r.left + r.width / 2 ? 'L' : 'R';
    const score = dist + (ends.length > 1 && end !== side ? 0.5 : 0);
    if (!best || score < best.score) best = { end, node, score };
  }
  return best;
}

// ---- tiles played by the others -----------------------------------------------

const FLIGHT_MS = 1200;
const IMPACT_AT = 0.88; // fraction of the flight where the tile hits the table
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let flights = 0;
let afterFlights = [];

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.min(Math.max(u, 0), 1);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** Run `fn` right away, or once every tile in the air has landed. */
function whenLanded(fn) {
  if (flights) afterFlights.push(fn);
  else fn();
}

/** Pulled from the hand, thrown spinning face down, flipped over, slammed down. */
function flightPose(t) {
  if (t < 0.2) {
    const u = t / 0.2;
    return { along: 0, scale: lerp(0.3, 0.85, 1 - (1 - u) ** 2), spin: Math.sin(u * Math.PI * 2) * 10, flip: 180 };
  }
  if (t < 0.8) {
    const u = (t - 0.2) / 0.6;
    const e = easeInOut(u);
    return {
      along: e,
      scale: lerp(0.85, 1.5, e) + 0.4 * Math.sin(Math.PI * u),
      spin: (1 - e) * 540,
      flip: 180 * (1 - clamp01((u - 0.25) / 0.5)),
    };
  }
  if (t < 0.9) {
    const u = (t - 0.8) / 0.1;
    return { along: 1, scale: lerp(1.5, 0.9, u * u), spin: 0, flip: 0 };
  }
  const u = (t - 0.9) / 0.1;
  return { along: 1, scale: 1 + 0.08 * Math.sin(Math.PI * u) - (1 - u) * 0.1, spin: 0, flip: 0 };
}

function impact(node, team) {
  sound.play('place');
  const ring = document.createElement('span');
  ring.className = 'impact';
  ring.dataset.team = team;
  ring.style.left = `${node.offsetLeft + node.offsetWidth / 2}px`;
  ring.style.top = `${node.offsetTop + node.offsetHeight / 2}px`;
  ring.addEventListener('animationend', () => ring.remove());
  $('board').append(ring);
  const el = $('board');
  el.classList.remove('thud');
  void el.offsetWidth; // restart the animation if one is still showing
  el.classList.add('thud');
}

/** Fly a tile from the seat that played it to its spot on the board. */
function flyTile({ seat, tile }) {
  const node = board.nodes.get(tileKey(tile));
  const avatar = $(['seat-me', 'seat-right', 'seat-top', 'seat-left'][posOf(seat)]).querySelector('.avatar');
  if (!node || !avatar || reduceMotion || document.hidden) return sound.play('place');

  const a = avatar.getBoundingClientRect();
  const x0 = a.left + a.width / 2;
  const y0 = a.top + a.height / 2;
  avatar.classList.add('throw');
  node.classList.remove('fresh');
  node.classList.add('incoming'); // the real tile stays hidden until this one lands

  const flier = document.createElement('div');
  flier.className = `tile flier ${node.classList.contains('h') ? 'h' : 'v'}`;
  flier.dataset.team = seat % 2;
  flier.innerHTML = `${node.innerHTML}<span class="flier-back"></span>`;
  const back = flier.lastChild;
  document.body.append(flier);

  flights++;
  const start = performance.now();
  let hit = false;

  const finish = () => {
    flier.remove();
    node.classList.remove('incoming');
    if (--flights) return;
    const queued = afterFlights;
    afterFlights = [];
    queued.forEach((fn) => fn());
  };

  const frame = (now) => {
    if (!node.isConnected) return finish(); // new round started mid-flight
    const t = clamp01((now - start) / FLIGHT_MS);
    // Aim at the tile's live position: the board can reflow during the flight.
    const r = node.getBoundingClientRect();
    const x1 = r.left + r.width / 2;
    const y1 = r.top + r.height / 2;
    const { along: p, scale, spin, flip } = flightPose(t);
    // A curve bowed upward, so the tile arcs over the table instead of sliding.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 - Math.hypot(x1 - x0, y1 - y0) * 0.35;
    const x = lerp(lerp(x0, cx, p), lerp(cx, x1, p), p);
    const y = lerp(lerp(y0, cy, p), lerp(cy, y1, p), p);
    flier.style.width = `${r.width}px`;
    flier.style.height = `${r.height}px`;
    flier.style.setProperty('--u', `${Math.min(r.width, r.height)}px`);
    flier.style.transform = `translate(${x - r.width / 2}px, ${y - r.height / 2}px) rotate(${spin}deg) perspective(500px) rotateY(${flip}deg) scale(${scale})`;
    back.hidden = flip < 90;
    if (!hit && t >= IMPACT_AT) {
      hit = true;
      impact(node, seat % 2);
    }
    if (t < 1) requestAnimationFrame(frame);
    else finish();
  };
  frame(start);
}

// ---- mocking illegal moves ----------------------------------------------------

const MOCK_EMOJI = ['🤡', '🤦', '🙈', '🤣', '🐔'];
const LAUGHS = ['😂', '🤣', '😆'];
let lastMockLine = -1;

/** Spit the ghost tile back into the hand while the whole table laughs. */
function mockMove(ghost, key, x, y) {
  const slot = $('hand').querySelector(`[data-key="${key}"]`);
  const home = slot.getBoundingClientRect();
  slot.classList.add('dragging');
  ghost.style.setProperty('--x0', `${x}px`);
  ghost.style.setProperty('--y0', `${y}px`);
  ghost.style.setProperty('--x1', `${home.left}px`);
  ghost.style.setProperty('--y1', `${home.top}px`);
  ghost.addEventListener('animationend', () => {
    ghost.remove();
    slot.classList.remove('dragging');
    shake(slot);
  });
  ghost.classList.add('rejected');

  // Never the same line twice in a row.
  const lines = t('mock.lines');
  lastMockLine = (lastMockLine + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length;
  $('mockEmoji').textContent = MOCK_EMOJI[Math.floor(Math.random() * MOCK_EMOJI.length)];
  $('mockLine').textContent = lines[lastMockLine];
  const banner = $('mock');
  banner.hidden = true;
  void banner.offsetWidth; // restart the animation if one is still showing
  banner.hidden = false;

  [1, 2, 3].forEach((pos, i) =>
    setTimeout(() => floatEmoji(seatAt(pos), LAUGHS[Math.floor(Math.random() * LAUGHS.length)]), 150 + i * 180),
  );
  sound.play('mock');
  buzz([60, 40, 60, 40, 180]);
  send({ t: 'blunder' }); // let the others laugh too
}

// ---- reactions ----------------------------------------------------------------

function floatEmoji(seat, emoji) {
  const anchor = $(['seat-me', 'seat-right', 'seat-top', 'seat-left'][posOf(seat)]);
  const rect = anchor.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'reaction';
  el.textContent = emoji;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}

/** Several players sending the same emoji: a big one over the table, bigger with each player. */
function crowdEmoji(emoji, crowd) {
  document.querySelector('.reaction-crowd')?.remove();
  const rect = $('board').getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'reaction-crowd';
  el.textContent = emoji;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.style.setProperty('--crowd', crowd);
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}

function showReaction({ seat, emoji, crowd }) {
  floatEmoji(seat, emoji);
  if (crowd > 1) crowdEmoji(emoji, crowd);
  sound.play('react');
}

// ---- voice chat ---------------------------------------------------------------

// Signaling is best-effort: no "not connected" toast; a reconnect re-joins.
const sendBestEffort = (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));

const voice = createVoice({
  send: sendBestEffort,
  onChange: paintVoice,
  onJoin: (name) => toast(t('voiceJoined', { name: name || '?' })),
});

// ---- player photos ------------------------------------------------------------

function repaintPhotos() {
  if (!state) return;
  renderLobby();
  renderSeats();
  paintVoice();
}

function receivePhoto({ from, peer, image, ask }) {
  if (image) photos[from] = image;
  else delete photos[from];
  if (ask) sendBestEffort({ t: 'avatar', to: peer, image: myPhoto });
  repaintPhotos();
}

avatar.bindPicker({
  onChange: (photo) => {
    myPhoto = photo;
    sendBestEffort({ t: 'avatar', image: photo });
    repaintPhotos();
  },
  onError: () => toast(t('photoFailed')),
});

function paintVoice() {
  // The same controls appear in the lobby and at the table.
  for (const btn of document.querySelectorAll('.voice-btn')) {
    btn.classList.toggle('on', voice.joined && !voice.muted);
    btn.classList.toggle('muted', voice.joined && voice.muted);
    btn.setAttribute('aria-pressed', String(voice.joined));
    btn.setAttribute(
      'aria-label',
      t(!voice.joined ? 'aria.voiceJoin' : voice.muted ? 'aria.voiceUnmute' : 'aria.voiceMute'),
    );
    btn.querySelector('.voice-count').textContent = voice.joined && voice.count ? voice.count : '';
  }
  for (const btn of document.querySelectorAll('.voice-leave')) btn.hidden = !voice.joined;
  if (!state) return;
  // Mic badge on the avatars of seated players in voice; a ring while they talk.
  const inVoice = voice.bySeat();
  const ids = ['seat-me', 'seat-right', 'seat-top', 'seat-left'];
  for (let pos = 0; pos < 4; pos++) {
    const avatar = $(ids[pos]).querySelector('.avatar');
    if (!avatar) continue;
    const v = inVoice.get(seatAt(pos));
    avatar.classList.toggle('speaking', !!v?.speaking);
    if (v) avatar.dataset.voice = v.muted ? 'muted' : 'on';
    else delete avatar.dataset.voice;
  }
  for (const el of $('lobbySeats').querySelectorAll('.lobby-seat')) {
    const v = inVoice.get(Number(el.dataset.sit));
    el.classList.toggle('speaking', !!v?.speaking);
    if (v) el.dataset.voice = v.muted ? 'muted' : 'on';
    else delete el.dataset.voice;
  }
}

for (const btn of document.querySelectorAll('.voice-btn')) {
  btn.onclick = async () => {
    if (!voice.joined) {
      const result = await voice.join();
      toast(t({ ok: 'voiceOn', blocked: 'voiceBlocked', noMic: 'voiceNoMic' }[result]), result === 'ok' ? 1800 : 3200);
      return;
    }
    if (!voice.canTalk) return toast(t('voiceListening'));
    voice.setMuted(!voice.muted);
  };
}
for (const btn of document.querySelectorAll('.voice-leave')) {
  btn.onclick = () => {
    voice.leave();
    toast(t('voiceOff'));
  };
}
window.addEventListener('pagehide', () => voice.leave());

// ---- results ----------------------------------------------------------------

let resultKey = null;
let resultTimer = null;

function renderResult(prev) {
  const over = state.phase === 'roundEnd' || state.phase === 'matchEnd';
  const overlay = $('result');
  if (!over) {
    resultKey = null;
    clearTimeout(resultTimer);
    overlay.hidden = true;
    overlay.classList.remove('peek');
    document.body.classList.remove('sad');
    fx.stop();
    return;
  }
  const key = `${state.roundNo}-${state.phase}`;
  const fresh = key !== resultKey;
  resultKey = key;
  const build = () => buildResult(fresh);
  if (fresh && prev && prev.phase === 'playing') {
    // Give everyone a moment to see the final tile before the overlay.
    clearTimeout(resultTimer);
    const la = state.round.lastAction;
    const flying = la?.type === 'play' && la.seat !== me();
    resultTimer = setTimeout(build, flying ? FLIGHT_MS + 800 : 1100);
  } else if (!fresh && overlay.hidden && resultTimer) {
    // still waiting for the delayed build
  } else build();
}

function buildResult(fresh) {
  const r = state.round;
  const o = r.over;
  const isMatch = state.phase === 'matchEnd';
  const mine = me() !== -1;
  const card = $('resultCard');
  const overlay = $('result');
  resultTimer = null;

  let emoji, title, sub;
  const winTeam = isMatch ? (state.scores[0] > state.scores[1] ? 0 : 1) : o.winnerTeam;
  const weWon = mine && winTeam === myTeam();
  const how =
    o.reason === 'domino'
      ? o.winnerSeat === me()
        ? t('youGoOut')
        : t('goesOut', { name: seatName(o.winnerSeat) })
      : t('blockedPips', { a: teamLabel(0), pa: o.teamPips[0], b: teamLabel(1), pb: o.teamPips[1] });

  if (isMatch) {
    emoji = !mine ? '🏆' : weWon ? '🏆' : '😭';
    title = !mine ? t('teamWinsMatch', { team: teamLabel(winTeam) }) : weWon ? t('youWinMatch') : t('youLoseMatch');
    sub = t('matchSub', { a: state.scores[winTeam], b: state.scores[1 - winTeam], n: state.roundNo });
  } else if (winTeam == null) {
    emoji = '🤝';
    title = t('tieTitle');
    sub = t('tieSub', { n: o.teamPips[0] });
  } else {
    emoji = !mine ? '🁢' : weWon ? '🎉' : '😬';
    title = `${teamLabel(winTeam)} +${o.points}`;
    sub = how;
  }

  card.className = `result-card ${isMatch ? 'match' : ''} ${isMatch && mine ? (weWon ? 'won' : 'lost') : ''}`;
  $('resultEmoji').textContent = emoji;
  $('resultTitle').textContent = title;
  $('resultSub').textContent = isMatch ? t('lastRound', { sub, how }) : sub;

  const gained = (team) => (!isMatch && o.winnerTeam === team && o.points ? `<em>+${o.points}</em>` : '');
  const order = [myTeam(), 1 - myTeam()];
  $('resultScores').innerHTML = order
    .map(
      (team) =>
        `<div class="rs" data-team="${team}"><span>${teamLabel(team)}</span><b>${state.scores[team]}</b>${gained(team)}</div>`,
    )
    .join(`<div class="rs-target">${t('to', { n: state.target })}</div>`);

  $('resultHands').innerHTML = r.hands
    ? [0, 1, 2, 3]
        .map((i) => seatAt(i))
        .map(
          (s) => `<div class="rh" data-team="${s % 2}">
            <span class="rh-name">${esc(seatName(s))}</span>
            <span class="rh-tiles">${
              r.hands[s].length
                ? r.hands[s].map((tile) => `<span class="tile h mini">${tileHTML(tile[0], tile[1], true)}</span>`).join('')
                : `<span class="muted">${t('outCheck')}</span>`
            }</span></div>`,
        )
        .join('')
    : '';

  const actions = [];
  if (mine) {
    if (isMatch) actions.push(
        `<button class="btn primary" data-act="rematch">${t('rematch')}</button>`,
        `<button class="btn" data-act="lobby">${t('changeSeats')}</button>`,
      );
    else actions.push(`<button class="btn primary" data-act="next">${t('nextRound')}</button>`);
  } else actions.push(`<p class="muted">${t('waitingPlayers')}…</p>`);
  actions.push(`<button class="btn ghost" data-act="peek">${t('seeBoard')}</button>`);
  $('resultActions').innerHTML = actions.join('');

  overlay.hidden = false;
  if (fresh) {
    overlay.classList.remove('peek');
    if (!isMatch) sound.play('roundEnd');
    if (isMatch) {
      sound.play(!mine || weWon ? 'win' : 'lose');
      if (!mine || weWon) {
        fx.confetti();
        buzz([40, 60, 40, 60, 120]);
      } else {
        fx.rain();
        document.body.classList.add('sad');
        buzz([300]);
      }
    }
  }
}

// ---- score history ----------------------------------------------------------

function renderScoreSheet() {
  const left = myTeam();
  const right = 1 - left;
  $('hLabel0').textContent = teamLabel(left);
  $('hLabel1').textContent = teamLabel(right);
  $('total0').textContent = state.scores[left];
  $('total1').textContent = state.scores[right];
  $('totalTarget').textContent = t('to', { n: state.target });
  $('historyBody').innerHTML = state.history.length
    ? state.history
        .map((h) => {
          const cell = (team) => (h.winnerTeam === team ? `+${h.points}` : '·');
          const how =
            h.reason === 'domino'
              ? esc(t('histOut', { name: seatName(h.winnerSeat) }))
              : h.winnerTeam == null
                ? t('histTie')
                : t('histBlocked');
          return `<tr><td>${h.round}</td><td class="c0">${cell(left)}</td><td class="c1">${cell(right)}</td><td class="how">${how}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="4" class="muted center">${t('noRounds')}</td></tr>`;
}

// ---- events -----------------------------------------------------------------

$('hand').addEventListener('pointerdown', onHandDown);
$('mock').addEventListener('animationend', (e) => {
  if (e.animationName === 'mock-out') $('mock').hidden = true;
});
window.addEventListener('pointermove', onDragMove, { passive: false });
window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', onDragEnd);

document.body.addEventListener('click', (e) => {
  const el = e.target.closest('[data-botify],[data-sit],[data-remove],[data-stand],[data-act],[data-close],[data-target]');
  if (!el) return;
  if (el.dataset.botify) return send({ t: 'botify', seat: Number(el.dataset.botify) });
  if (el.dataset.remove) {
    e.stopPropagation();
    return send({ t: 'removeBot', seat: Number(el.dataset.remove) });
  }
  if ('stand' in el.dataset) return send({ t: 'stand' });
  if (el.dataset.sit) {
    const s = state.seats[Number(el.dataset.sit)];
    if (state.phase === 'lobby' && s?.bot) return toast(t('removeBotFirst'));
    return send({ t: 'sit', seat: Number(el.dataset.sit) });
  }
  if (el.dataset.target) return send({ t: 'target', target: Number(el.dataset.target) });
  if ('close' in el.dataset) return (el.closest('.sheet').hidden = true);
  const act = el.dataset.act;
  if (act === 'peek') return $('result').classList.add('peek');
  if (act === 'unpeek') return $('result').classList.remove('peek');
  if (act) {
    fx.stop();
    document.body.classList.remove('sad');
    send({ t: act });
  }
});

$('result').addEventListener('click', (e) => {
  if (e.target === $('result') && $('result').classList.contains('peek')) $('result').classList.remove('peek');
});

$('scoreBtn').onclick = () => state && state.phase !== 'lobby' && ($('scoreSheet').hidden = false);
$('scoreSheet').addEventListener('click', (e) => e.target === $('scoreSheet') && ($('scoreSheet').hidden = true));
$('shareBtn').onclick = share;
$('copyBtn').onclick = copyInvite;
$('botsBtn').onclick = () => send({ t: 'addBots' });
$('startBtn').onclick = () => send({ t: 'start' });

$('reactBtn').onclick = () => ($('reactBar').hidden = !$('reactBar').hidden);
$('reactBar').addEventListener('click', (e) => {
  const emoji = e.target.closest('[data-emoji]')?.dataset.emoji;
  if (!emoji) return;
  send({ t: 'react', emoji });
  $('reactBar').hidden = true;
});

const paintSound = () => {
  $('soundBtn').textContent = sound.isMuted() ? '🔇' : '🔊';
  $('soundBtn').setAttribute('aria-pressed', String(sound.isMuted()));
};
$('soundBtn').onclick = () => {
  sound.setMuted(!sound.isMuted());
  paintSound();
};
paintSound();

i18n.apply();
$('langBtn').onclick = () => {
  i18n.cycle();
  if (state) render(state);
};

let nameTimer;
$('nameInput').addEventListener('input', (e) => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const v = e.target.value.trim().slice(0, 16);
    if (!v) return;
    myName = v;
    localStorage.setItem('domino.name', v);
    send({ t: 'rename', name: v });
  }, 300);
});
$('nameInput').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

connect();
