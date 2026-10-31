import { BoardView } from './board.js';
import { tileHTML, tileKey } from './tiles.js';
import * as fx from './fx.js';
import * as sound from './sound.js';

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
let myName = localStorage.getItem('domino.name') || `Player ${Math.floor(Math.random() * 90 + 10)}`;
localStorage.setItem('domino.name', myName);

// ---- connection -------------------------------------------------------------

// Spotty networks (mobile, wifi handoffs) often leave a socket half-open: it
// looks connected but nothing gets through and `onclose` fires much later. So
// we expect traffic: the server answers every `ping`, and if nothing arrives
// within a deadline we drop the socket ourselves and dial again.
const PING_MS = 10000; // idle ping interval
const SILENCE_MS = 25000; // no message for this long → assume the socket is dead
const ACK_MS = 6000; // after an action, expect a reply this fast
const CONNECT_MS = 8000; // give up on a handshake that hangs

let ws;
let retry = 0;
let retryTimer;
let deadline = 0; // drop the socket if nothing arrives before this time
let bannerTimer;

function connect() {
  clearTimeout(retryTimer);
  if (ws && ws.readyState <= 1) return;
  const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?match=${encodeURIComponent(matchId)}`);
  ws = sock;
  deadline = Date.now() + CONNECT_MS;
  sock.onopen = () => {
    deadline = Date.now() + SILENCE_MS;
    send({ t: 'hello', token, name: myName });
  };
  sock.onmessage = (e) => {
    deadline = Date.now() + SILENCE_MS;
    retry = 0; // only count a connection as good once the server talks back
    setConnected(true);
    const msg = JSON.parse(e.data);
    if (msg.t === 'state') render(msg);
    else if (msg.t === 'error') toast(msg.message);
  };
  sock.onclose = () => {
    if (ws === sock) reconnectLater();
  };
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
    $('conn').textContent = navigator.onLine === false ? 'No connection — waiting for network…' : 'Reconnecting…';
    $('conn').hidden = false;
    document.body.classList.add('offline');
  }, 1200);
}

function send(msg) {
  if (ws?.readyState !== 1) {
    if (msg.t !== 'ping') {
      toast('Not connected — reconnecting…');
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
  if (ws.readyState === 1) send({ t: 'ping' });
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
let drag = null; // tile being dragged from the hand to the board
const board = new BoardView($('board'));

const me = () => state?.you ?? -1;
const myTeam = () => (me() === -1 ? 0 : me() % 2);
// Position around the table relative to me: 0 bottom, 1 right, 2 top, 3 left.
const posOf = (seat) => (seat - (me() === -1 ? 0 : me()) + 4) % 4;
const seatAt = (pos) => ((me() === -1 ? 0 : me()) + pos) % 4;
const teamLabel = (team) => (me() === -1 ? `Team ${team + 1}` : team === myTeam() ? 'Us' : 'Them');
const seatName = (seat) => (seat === me() ? 'You' : state.seats[seat]?.name ?? '—');

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
      await navigator.share({ title: 'Play dominoes with me', text: 'Join my domino match', url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  copy(url);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = $('inviteUrl');
    input.value = text;
    input.select();
    document.execCommand('copy');
  }
  toast('Link copied');
}

// ---- render -----------------------------------------------------------------

function render(next) {
  const prev = state;
  state = next;
  const r = state.round;

  renderScores();
  renderLobby();
  renderSeats();
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
      toast(la.seat === me() ? 'You pass' : `${seatName(la.seat)} passes`);
      sound.play('pass');
    } else if (la.type === 'play') sound.play('place');
  }
  if (prev && state.reaction && state.reaction.n !== prev.reaction?.n) showReaction(state.reaction);
  const myTurnNow = r && r.turn === me() && state.phase === 'playing';
  const myTurnBefore = prev?.round && prev.round.turn === prev.you && prev.phase === 'playing';
  if (myTurnNow && !myTurnBefore && r.legal.length) {
    buzz(30);
    sound.play('turn');
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
  $('roundNo').textContent = state.phase === 'lobby' ? 'Lobby' : `Round ${state.roundNo}`;
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
        if (!s) body = `<span class="name muted">Empty</span><span class="act">Tap to sit</span>`;
        else if (s.bot)
          body = `<span class="name">🤖 ${esc(s.name)}</span><span class="act" data-remove="${i}">Remove</span>`;
        else
          body = `<span class="name">${esc(mine ? `${s.name} (you)` : s.name)}</span>${
            mine ? `<span class="act" data-stand>Stand up</span>` : `<span class="act">${s.online ? 'Ready' : 'Offline'}</span>`
          }`;
        return `<button class="lobby-seat ${cells[i]}" data-team="${i % 2}" data-sit="${i}" ${
          mine ? 'aria-current="true"' : ''
        }><span class="team-tag">Team ${(i % 2) + 1}</span>${body}</button>`;
      })
      .join('') + `<div class="lobby-felt"></div>`;

  for (const b of $('targetPicker').children) b.classList.toggle('on', Number(b.dataset.target) === state.target);
  const full = !state.seats.includes(null);
  $('botsBtn').disabled = full;
  $('startBtn').disabled = !full || me() === -1;
  $('startBtn').textContent = me() === -1 ? 'Take a seat to start' : full ? 'Start game' : 'Waiting for 4 players…';
}

function seatHTML(seat, pos) {
  const s = state.seats[seat];
  if (!s) return '';
  const r = state.round;
  const turn = r && r.turn === seat && state.phase === 'playing';
  const passed = r?.lastAction?.type === 'pass' && r.lastAction.seat === seat;
  const initial = s.bot ? '🤖' : esc([...s.name][0]?.toUpperCase() ?? '?');
  const canBotify = !s.bot && !s.online && me() !== -1 && state.phase !== 'lobby';
  const canTake = s.bot && me() === -1 && state.phase !== 'lobby';
  const backs = pos === 2 ? `<span class="backs">${'<i></i>'.repeat(s.count)}</span>` : '';
  return `
    <div class="avatar ${turn ? 'turn' : ''}" data-team="${s.team}">${initial}${s.online ? '' : '<b class="off"></b>'}</div>
    <div class="seat-info">
      <span class="name">${esc(seat === me() ? 'You' : s.name)}</span>
      ${pos === 0 ? '' : `<span class="count" title="tiles left">${s.count}</span>`}
      ${backs}
    </div>
    ${passed ? '<span class="bubble">Pass</span>' : ''}
    ${canBotify ? `<button class="mini-btn" data-botify="${seat}">Use bot</button>` : ''}
    ${canTake ? `<button class="mini-btn" data-sit="${seat}">Take seat</button>` : ''}`;
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
  board.highlight(drag ? pickEnds(drag.key) : null);

  let hint = '';
  if (r && !r.line.length && state.phase === 'playing') {
    if (r.turn === me()) hint = r.mustPlay ? 'Open with the double six' : 'You open — play any tile';
    else hint = `${seatName(r.turn)} opens${r.mustPlay ? ' with the double six' : ''}…`;
  }
  $('boardEmpty').textContent = hint;
}

const sortHand = (hand) =>
  hand
    .map((t) => (t[0] <= t[1] ? t : [t[1], t[0]]))
    .sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);

function renderHand() {
  const r = state.round;
  const handEl = $('hand');
  const hand = r?.hand;
  if (!hand) {
    handEl.innerHTML =
      me() === -1 && state.phase !== 'lobby' ? '<p class="muted center">You are watching. Tap “Take seat” on a bot to play.</p>' : '';
    cancelDrag();
    return;
  }
  const playable = new Set(r.legal.map((m) => tileKey(m.tile)));
  const myTurn = r.turn === me() && state.phase === 'playing';
  if (drag && (!myTurn || !playable.has(drag.key))) cancelDrag();

  handEl.innerHTML = sortHand(hand)
    .map((t) => {
      const key = tileKey(t);
      const cls = [
        'tile v hand-tile',
        myTurn && playable.has(key) ? 'playable' : '',
        myTurn && !playable.has(key) ? 'dim' : '',
        drag?.key === key ? 'dragging' : '',
      ].join(' ');
      return `<button class="${cls}" data-key="${key}" aria-label="${t[0]} and ${t[1]}">${tileHTML(t[0], t[1], false)}</button>`;
    })
    .join('');
  handEl.style.setProperty('--n', Math.max(hand.length, 5));
}

function renderStatus() {
  const r = state.round;
  let text = '';
  let cls = '';
  if (state.phase === 'lobby') text = 'Waiting for players';
  else if (state.phase === 'playing' && r) {
    if (r.turn === me()) {
      cls = 'mine';
      text = r.legal.length ? 'Your turn' : 'No tile fits — passing…';
    } else if (me() === -1) text = `Watching · ${seatName(r.turn)}’s turn`;
    else text = `${seatName(r.turn)}’s turn`;
  } else if (state.phase === 'roundEnd') text = 'Round over';
  else if (state.phase === 'matchEnd') text = 'Match over';
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

/** Can this hand tile be picked up right now? Gives feedback when it can't. */
function canDrag(btn) {
  const r = state?.round;
  if (!r || state.phase !== 'playing') return false;
  if (r.turn !== me()) {
    shake(btn);
    toast(`Wait for ${seatName(r.turn)}`, 1200);
    return false;
  }
  if (!pickEnds(btn.dataset.key).length) {
    shake(btn);
    buzz([10, 40, 10]);
    return false;
  }
  return true;
}

const DRAG_START = 6; // px of movement before a press becomes a drag

function onHandDown(e) {
  const btn = e.target.closest('.hand-tile');
  if (!btn || !state || drag || e.button > 0) return;
  if (!canDrag(btn)) return;
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
  board.highlight(pickEnds(drag.key));
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
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { key, ghost, btn } = drag;
  const target = e.type === 'pointerup' && ghost ? dropTarget(e.clientX, e.clientY) : null;
  cancelDrag();
  if (target) playTile(key, target.end);
  else if (!ghost && e.type === 'pointerup') toast('Drag the tile onto the board', 1400);
  else if (ghost) shake(btn);
}

function cancelDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.btn.classList.remove('dragging');
  drag = null;
  for (const node of board.nodes.values()) node.classList.remove('drop-hover');
  $('board').classList.remove('drop-hover');
  board.highlight(null);
  board.preview(null);
}

/** Which legal end ('L' / 'R') is the pointer over? */
function dropTarget(x, y) {
  const ends = pickEnds(drag.key);
  const boardRect = $('board').getBoundingClientRect();
  const inBoard = x >= boardRect.left && x <= boardRect.right && y >= boardRect.top && y <= boardRect.bottom;
  if (!state.round.line.length) return inBoard ? { end: ends[0], node: null } : null;

  const unit = parseFloat(getComputedStyle($('board')).getPropertyValue('--u')) || 24;
  const reach = Math.max(44, unit * 2.2);
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

// ---- reactions ----------------------------------------------------------------

function showReaction({ seat, emoji }) {
  const anchor = $(['seat-me', 'seat-right', 'seat-top', 'seat-left'][posOf(seat)]);
  const rect = anchor.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'reaction';
  el.textContent = emoji;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
  sound.play('react');
}

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
    resultTimer = setTimeout(build, 1100);
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
      ? `${seatName(o.winnerSeat)} ${o.winnerSeat === me() ? 'go' : 'goes'} out!`
      : `Blocked! Pips — ${teamLabel(0)}: ${o.teamPips[0]}, ${teamLabel(1)}: ${o.teamPips[1]}`;

  if (isMatch) {
    emoji = !mine ? '🏆' : weWon ? '🏆' : '😭';
    title = !mine ? `${teamLabel(winTeam)} wins the match!` : weWon ? 'You win the match!' : 'You lose the match';
    sub = `${state.scores[winTeam]} to ${state.scores[1 - winTeam]} · ${state.roundNo} rounds`;
  } else if (winTeam == null) {
    emoji = '🤝';
    title = 'Blocked — it’s a tie';
    sub = `Both teams have ${o.teamPips[0]} pips. No points.`;
  } else {
    emoji = !mine ? '🁢' : weWon ? '🎉' : '😬';
    title = `${teamLabel(winTeam)} +${o.points}`;
    sub = how;
  }

  card.className = `result-card ${isMatch ? 'match' : ''} ${isMatch && mine ? (weWon ? 'won' : 'lost') : ''}`;
  $('resultEmoji').textContent = emoji;
  $('resultTitle').textContent = title;
  $('resultSub').textContent = isMatch ? `${sub} · last round: ${how}` : sub;

  const gained = (t) => (!isMatch && o.winnerTeam === t && o.points ? `<em>+${o.points}</em>` : '');
  const order = [myTeam(), 1 - myTeam()];
  $('resultScores').innerHTML = order
    .map(
      (t) => `<div class="rs" data-team="${t}"><span>${teamLabel(t)}</span><b>${state.scores[t]}</b>${gained(t)}</div>`,
    )
    .join(`<div class="rs-target">to ${state.target}</div>`);

  $('resultHands').innerHTML = r.hands
    ? [0, 1, 2, 3]
        .map((i) => seatAt(i))
        .map(
          (s) => `<div class="rh" data-team="${s % 2}">
            <span class="rh-name">${esc(seatName(s))}</span>
            <span class="rh-tiles">${
              r.hands[s].length
                ? r.hands[s].map((t) => `<span class="tile h mini">${tileHTML(t[0], t[1], true)}</span>`).join('')
                : '<span class="muted">out ✓</span>'
            }</span></div>`,
        )
        .join('')
    : '';

  const actions = [];
  if (mine) {
    if (isMatch) actions.push('<button class="btn primary" data-act="rematch">Rematch</button>', '<button class="btn" data-act="lobby">Change seats</button>');
    else actions.push('<button class="btn primary" data-act="next">Next round</button>');
  } else actions.push('<p class="muted">Waiting for players…</p>');
  actions.push('<button class="btn ghost" data-act="peek">See board</button>');
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
  $('totalTarget').textContent = `to ${state.target}`;
  $('historyBody').innerHTML = state.history.length
    ? state.history
        .map((h) => {
          const cell = (t) => (h.winnerTeam === t ? `+${h.points}` : '·');
          const how =
            h.reason === 'domino' ? `${esc(seatName(h.winnerSeat))} out` : h.winnerTeam == null ? 'Blocked, tie' : 'Blocked';
          return `<tr><td>${h.round}</td><td class="c0">${cell(left)}</td><td class="c1">${cell(right)}</td><td class="how">${how}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="4" class="muted center">No rounds yet</td></tr>';
}

// ---- events -----------------------------------------------------------------

$('hand').addEventListener('pointerdown', onHandDown);
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
    if (state.phase === 'lobby' && s?.bot) return toast('Remove the bot first');
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
$('copyBtn').onclick = () => copy(inviteUrl());
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
