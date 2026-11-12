// The game page: connection, lobby, seats, voice, photos, reactions and the frame of
// the result. What's on the table belongs to the game's view (domino.js, truco.js, caida.js,
// parchis.js, cochina.js, rummy.js).
import { createView as createDominoView } from './domino.js';
import { createView as createTrucoView } from './truco.js';
import { createView as createCaidaView } from './caida.js';
import { createView as createParchisView } from './parchis.js';
import { createView as createCochinaView } from './cochina.js';
import { createView as createRummyView } from './rummy.js';
import { RULES } from './rules.js';
import { GAMES, gameIcon } from './games.js';
import { REACTION_TABS, REACTIONS, IMAGES, FIRST_RECENT } from './reactions.js';
import { reduceMotion, whenLanded } from './flight.js';
import * as fx from './fx.js';
import * as sound from './sound.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';
import { createVoice } from './voice.js';
import * as avatar from './avatar.js';
import * as theme from './theme.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const matchId = decodeURIComponent(location.pathname.split('/')[2] || '').toLowerCase();

const params = new URLSearchParams(location.search);
// A link can ask for a game (old Trucazo links). A match that exists already ignores it.
const gameHint = params.get('game');
// For testing: `?as=<token>` plays as that token in this tab (`?as=p0` takes the seat a
// dev scenario set up), and leaves this device's own identity, name and photo alone.
const playAs = params.get('as')?.slice(0, 64) || null;
if (gameHint) {
  params.delete('game');
  history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''));
}

// ---- identity (no login: a random token kept on this device) ----------------

function randomHex(bytes) {
  // crypto.randomUUID needs a secure context; plain LAN http:// does not have one.
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const token = playAs || localStorage.getItem('domino.token') || randomHex(16);
if (!playAs) localStorage.setItem('domino.token', token);
let myName = playAs ? params.get('name') || playAs : localStorage.getItem('domino.name') || t('player', { n: Math.floor(Math.random() * 90 + 10) });
if (!playAs) localStorage.setItem('domino.name', myName);
let myPhoto = playAs ? null : avatar.load();
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

const HEARD_MAX = 50;
const heard = []; // the last messages from the server, for window.__laMesa

let ws;
let voiceSession; // this connection's voice id comes from it (a new one each connect)
let retry = 0;
let retryTimer;
let deadline = 0; // drop the socket if nothing arrives before this time
let bannerTimer;

const dial = () => new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?match=${encodeURIComponent(matchId)}`);
// `games` tells the server what this page can draw, since a tab can stay open across deploys.
const hello = () => ({ t: 'hello', token, name: myName, session: voiceSession, inVoice: voice.joined, games: Object.keys(views), game: gameHint, theme: theme.saved() });

function connect() {
  clearTimeout(retryTimer);
  if (ws && ws.readyState <= 1) return;
  voiceSession = randomHex(8);
  const sock = dial();
  adopt(sock);
  deadline = Date.now() + CONNECT_MS;
  sock.onopen = () => {
    deadline = Date.now() + SILENCE_MS;
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
    if (msg.t !== 'pong') {
      heard.push(msg);
      if (heard.length > HEARD_MAX) heard.shift();
    }
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
let view = null; // the table of the game being played
let drag = null; // piece being dragged from the hand, to the table or to a new slot
let handOrder = []; // my hand's piece keys, left to right, as I arranged them
const SEAT_IDS = ['seat-me', 'seat-right', 'seat-top', 'seat-left'];

const me = () => state?.you ?? -1;
const myTeam = () => (me() === -1 ? 0 : me() % 2);
// Position around the table relative to me: 0 bottom, 1 right, 2 top, 3 left.
const posOf = (seat) => (seat - (me() === -1 ? 0 : me()) + 4) % 4;
const seatAt = (pos) => ((me() === -1 ? 0 : me()) + pos) % 4;
// A team's own name if it chose one; otherwise Us / Them, or Team 1 / 2 for spectators.
const teamLabel = (team) =>
  state.teamNames?.[team] ?? (me() === -1 ? t('team', { n: team + 1 }) : team === myTeam() ? t('us') : t('them'));
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

const seatEl = (seat) => $(SEAT_IDS[posOf(seat)]);
const signed = (n) => (n < 0 ? `−${-n}` : `+${n}`); // a rummy round can cost points

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
  const label = $('inviteLabel');
  label.dataset.i18n = 'copied';
  label.textContent = t('copied');
  $('inviteBtn').classList.add('done');
  buzz(15);
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    label.dataset.i18n = 'inviteFriends';
    label.textContent = t('inviteFriends');
    $('inviteBtn').classList.remove('done');
  }, 1800);
}

/** The lobby's invite button: the share sheet where there is one, else copy the link. */
const invite = () => (navigator.share ? share() : copyInvite());

// ---- render -----------------------------------------------------------------

function useGame(id) {
  const next = views[id] ?? views.domino;
  if (next === view) return;
  cancelDrag();
  view?.unmount();
  view = next;
  handOrder = [];
  document.body.dataset.game = id;
  document.title = `${t(`game.${id}`)} · La Mesa`;
  i18n.setGame(id);
  view.mount();
}

const hasManguangua = (st) => st.seats.some((s) => s?.bot && s.name === 'El Manguangua');

function render(next) {
  // The round of another game means nothing to this game's view.
  const prev = state && state.game !== next.game ? { ...state, round: null, roundNo: 0 } : state;
  state = next;
  useGame(state.game);
  theme.use(state.theme);
  const r = state.round;

  renderScores();
  renderLobby();
  renderSeats();
  voice.updateMeta({ seat: me(), name: myName });
  paintVoice();
  view.renderBoard(prev);
  renderHand();
  renderStatus();
  renderResult(prev);
  renderScoreSheet();
  if (!$('rulesSheet').hidden) paintRules();
  $('reactBtn').hidden = me() === -1 || state.phase === 'lobby';
  if ($('reactBtn').hidden) closeReactions();
  paintMenu();
  // Someone else ended the game first: nothing left to confirm.
  if (state.phase === 'lobby' || state.phase === 'matchEnd') $('confirmLobby').hidden = true;

  // Feedback for what just happened.
  view.feedback(prev);
  if (prev && prev.game !== state.game) toast(t('gameChanged', { game: t(`game.${state.game}`) }), 2400);
  else if (prev && prev.theme !== state.theme) toast(t('themeChanged', { theme: t(`theme.${state.theme}`) }), 2000);
  else if (prev) toastTeamNames(prev);
  if (prev && hasManguangua(state) && !hasManguangua(prev)) toast(t('manguangua'), 3200);
  if (prev && state.reaction && state.reaction.n !== prev.reaction?.n) showReaction(state.reaction);
  if (prev && state.blunder && state.blunder.n !== prev.blunder?.n && state.blunder.seat !== me()) {
    floatEmoji(state.blunder.seat, '🤡');
    sound.play('laugh');
  }
  if (view.canAct(state) && !view.canAct(prev) && view.turnAlert(r)) {
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
  // A chosen name is written as typed, so once either team has one, both labels drop the capitals.
  $('scoreBtn').classList.toggle('named', state.teamNames?.some(Boolean) ?? false);
  const scores = view.liveScores?.() ?? state.scores;
  $('score0').textContent = scores[left];
  $('score1').textContent = scores[right];
  $('scoreBtn').querySelector('.t0').dataset.team = left;
  $('scoreBtn').querySelector('.t1').dataset.team = right;
  $('target').textContent = state.target;
  $('roundNo').textContent = state.phase === 'lobby' ? t('lobby') : t('round', { n: state.roundNo });
}

function renderLobby() {
  const show = state.phase === 'lobby';
  $('lobby').hidden = !show;
  if (!show) return ($('gamesSheet').hidden = $('stylesSheet').hidden = $('teamSheet').hidden = true);
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
        else {
          const label = mine ? t('youSuffix', { name: s.name }) : s.name;
          body = `<span class="name${[...label].length > 12 ? ' long' : ''}">${photoOf(i) ? photoImg(photoOf(i), 'lobby-photo') : ''}${esc(label)}</span>${
            mine ? `<span class="act" data-stand>${t('standUp')}</span>` : `<span class="act">${s.online ? t('ready') : t('offline')}</span>`
          }`;
        }
        return `<button class="lobby-seat ${cells[i]}" data-team="${i % 2}" data-sit="${i}" ${
          mine ? 'aria-current="true"' : ''
        }>${teamTag(i % 2)}${body}</button>`;
      })
      .join('') + `<div class="lobby-felt"></div>`;

  const gameName = t(`game.${state.game}`);
  $('gameCard').innerHTML = `${gameIcon(state.game)}<span class="game-text"><small>${t('game')}</small><b class="${gameName.length > 10 ? 'long' : ''}">${gameName}</b></span><span class="game-change" aria-hidden="true">▾</span>`;
  $('gameCard').setAttribute('aria-label', t('aria.changeGame', { game: t(`game.${state.game}`) }));
  if (!$('gamesSheet').hidden) paintGames();
  paintTeamCard();
  if (!$('stylesSheet').hidden) paintStyles();
  $('targetPicker').innerHTML = state.targets
    .map((n) => `<button data-target="${n}" class="${n === state.target ? 'on' : ''}">${n}</button>`)
    .join('');
  $('variantField').hidden = !state.variants;
  $('variantPicker').innerHTML = (state.variants ?? [])
    .map((n) => `<button data-variant="${n}" class="${n === state.variant ? 'on' : ''}">${n}</button>`)
    .join('');
  const full = !state.seats.includes(null);
  $('botsBtn').disabled = full;
  $('startBtn').disabled = !full || me() === -1;
  $('startBtn').textContent = me() === -1 ? t('takeSeatToStart') : full ? t('start') : t('waitingFor4');
}

/** A lobby seat's team name. */
function teamTag(team) {
  const name = state.teamNames?.[team] ?? t('team', { n: team + 1 });
  return `<span class="team-tag${state.teamNames?.[team] ? ' named' : ''}"><span>${esc(name)}</span></span>`;
}

/** Your team's name, above the game. Tapping it opens the sheet to rename it. Spectators have no team to name. */
function paintTeamCard() {
  const card = $('teamCard');
  card.hidden = me() === -1;
  if (card.hidden) return;
  const team = myTeam();
  const named = state.teamNames?.[team];
  const name = named ?? t('team', { n: team + 1 });
  card.dataset.team = team;
  card.innerHTML = `<span class="team-badge" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="8.5" cy="8" r="3.2"/><circle cx="15.5" cy="8" r="3.2"/><path d="M2.5 19c0-3.5 2.7-6 6-6s6 2.5 6 6zM12.6 13.6c.9-.4 1.9-.6 2.9-.6 3.3 0 6 2.5 6 6h-5.2c0-2.2-1.4-4.2-3.7-5.4z"/></svg></span><span class="game-text"><small>${t('yourTeam')}</small><b class="${named ? '' : 'unnamed'}">${esc(name)}</b></span><span class="game-change" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg></span>`;
  card.setAttribute('aria-label', t('aria.teamName', { name }));
}

// Quick picks for a team name. Venezuelan table talk reads the same in both languages.
const TEAM_IDEAS = ['Los Panas', 'Los Chamos', 'La Pava', 'Mano Firme', 'Puro Tranque', 'Los Duros'];

function openTeamSheet() {
  const team = myTeam();
  $('teamForm').dataset.team = team;
  $('teamInput').value = state.teamNames?.[team] ?? '';
  $('teamInput').placeholder = t('team', { n: team + 1 });
  $('teamClear').hidden = !state.teamNames?.[team];
  paintTeamIdeas();
  $('teamSheet').hidden = false;
  $('teamInput').focus({ preventScroll: true });
}

function paintTeamIdeas() {
  const v = $('teamInput').value.trim();
  $('teamIdeas').innerHTML = TEAM_IDEAS.map((n) => `<button type="button" data-idea="${esc(n)}" aria-pressed="${n === v}">${esc(n)}</button>`).join('');
}

/** Tell the table when a team picks a name. Clearing it is quiet: the scoreboard says enough. */
function toastTeamNames(prev) {
  for (const team of [0, 1]) {
    const name = state.teamNames?.[team];
    if (!name || name === prev.teamNames?.[team]) continue;
    if (me() === -1) toast(t('teamRenamed.n', { n: team + 1, name }), 2400);
    else toast(t(team === myTeam() ? 'teamRenamed.mine' : 'teamRenamed.other', { name }), 2400);
  }
}

/** The menu of games, with the one being played marked. */
function paintGames() {
  $('gameList').innerHTML = GAMES.map(
    (id) => `<button class="game-opt" data-pick="${id}" data-g="${id}" aria-pressed="${id === state.game}">
      ${gameIcon(id)}<span class="game-text"><b>${t(`game.${id}`)}</b><small>${t(`gameDesc.${id}`)}</small></span>
      ${id === state.game ? '<span class="game-check" aria-hidden="true">✓</span>' : ''}</button>`,
  ).join('');
}

/** A style's two colors in a circle. */
const swatch = (id) => `<span class="swatch" data-sw="${id}" aria-hidden="true"></span>`;

/** The menu of styles, each name lettered like its style, with the table's marked. */
function paintStyles() {
  $('styleList').innerHTML = Object.keys(theme.THEMES)
    .map(
      (id) => `<button class="game-opt" data-theme-pick="${id}" aria-pressed="${id === state.theme}">
      ${swatch(id)}<span class="game-text"><b data-theme-name="${id}">${t(`theme.${id}`)}</b><small>${t(`themeDesc.${id}`)}</small></span>
      ${id === state.theme ? '<span class="game-check" aria-hidden="true">✓</span>' : ''}</button>`,
    )
    .join('');
}

const photoOf = (seat) => (seat === me() ? myPhoto : photos[state.seats[seat]?.pid]);
const photoImg = (photo, cls) => `<img class="${cls}" src="${esc(photo)}" alt="" />`;

/** A name's markup: long ones get a smaller font, and the whole name in its title. */
const nameHTML = (name, cls = 'name') =>
  `<span class="${cls}${[...name].length > 12 ? ' long' : ''}" title="${esc(name)}">${esc(name)}</span>`;

// Where the longest bot names may hyphenate to fit the narrow side seats.
const botName = (name) => esc(name).replace('Manguangua', 'Manguan&shy;gua').replace('Bachaquero', 'Bacha&shy;quero').replace('Exprópiese', 'Expró&shy;piese');

function seatHTML(seat, pos) {
  const s = state.seats[seat];
  if (!s) return '';
  const turn = state.phase === 'playing' && view.isTurn(seat);
  const parts = view.seatParts(seat, pos);
  const photo = photoOf(seat);
  const initial = s.bot ? s.emoji ?? '🤖' : photo ? photoImg(photo, 'avatar-photo') : esc([...s.name][0]?.toUpperCase() ?? '?');
  const canBotify = !s.bot && !s.online && me() !== -1 && state.phase !== 'lobby';
  const canTake = s.bot && me() === -1 && state.phase !== 'lobby';
  return `
    <div class="avatar ${turn ? 'turn' : ''}" data-team="${s.team}">${initial}${s.bot ? '<b class="bot-tag">🤖</b>' : ''}${s.online ? '' : '<b class="off"></b>'}${parts.badge}</div>
    <div class="seat-info">
      ${s.bot ? `<span class="name bot-name">${botName(s.name)}</span>` : nameHTML(seat === me() ? t('you') : s.name)}
      ${parts.info}
    </div>
    ${parts.bubble}
    ${canBotify ? `<button class="mini-btn" data-botify="${seat}">${t('useBot')}</button>` : ''}
    ${canTake ? `<button class="mini-btn" data-sit="${seat}">${t('takeSeat')}</button>` : ''}`;
}

function renderSeats() {
  for (let pos = 0; pos < 4; pos++) {
    const seat = seatAt(pos);
    const el = $(SEAT_IDS[pos]);
    el.innerHTML = state.phase === 'lobby' && pos !== 0 ? '' : seatHTML(seat, pos);
    el.dataset.team = seat % 2;
  }
}

/**
 * Keep my arrangement as pieces get played; one I haven't seen means a new deal, unless
 * the game draws cards mid-round (rummy), where new ones go at the end.
 */
function syncHandOrder(hand) {
  const keys = view.handKeys(hand);
  if (keys.every((k) => handOrder.includes(k))) handOrder = handOrder.filter((k) => keys.includes(k));
  else if (view.keepsOrder?.(state.round)) handOrder = [...handOrder.filter((k) => keys.includes(k)), ...keys.filter((k) => !handOrder.includes(k))];
  else handOrder = keys;
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
  if (drag && state.phase !== 'playing') cancelDrag();
  syncHandOrder(hand);

  handEl.innerHTML = handOrder.map((key) => view.handPieceHTML(key, drag?.key === key)).join('');
  view.afterHand?.(hand);
  // State can arrive mid-drag and the buttons were just rebuilt.
  if (drag) drag.btn = handEl.querySelector(`[data-key="${drag.key}"]`);
}

function renderStatus() {
  const r = state.round;
  let text = '';
  let cls = '';
  if (state.phase === 'lobby') text = t('waitingPlayers');
  else if (state.phase === 'playing' && r) {
    const special = view.status(r);
    if (special) ({ text, cls } = special);
    else if (r.turn === me()) {
      cls = 'mine';
      text = t('yourTurn');
    } else if (me() === -1) text = t('watchingTurn', { name: seatName(r.turn) });
    else text = t('turnOf', { name: seatName(r.turn) });
  } else if (state.phase === 'roundEnd') text = t('roundOver');
  else if (state.phase === 'matchEnd') text = t('matchOver');
  $('status').textContent = text;
  $('status').className = `status ${cls}`;
}

// ---- dragging from the hand -----------------------------------------------------

function shake(btn) {
  btn.classList.remove('shake');
  void btn.offsetWidth;
  btn.classList.add('shake');
}

const DRAG_START = 6; // px of movement before a press becomes a drag

// Pieces can be picked up any time to rearrange them; playing one waits for your turn.
function onHandDown(e) {
  const btn = e.target.closest(view?.handPiece);
  if (!btn || state?.phase !== 'playing' || drag || e.button > 0) return;
  e.preventDefault();
  drag = {
    key: btn.dataset.key,
    btn,
    id: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    ghost: null,
  };
}

function startGhost() {
  const rect = drag.btn.getBoundingClientRect();
  const ghost = drag.btn.cloneNode(true);
  view.dressGhost(ghost, rect);
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
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
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-4deg) scale(${view.ghostScale})`;
  view.dragOver(drag.key, e.clientX, e.clientY);
  if (within('hand', e.clientX, e.clientY)) moveInHand(e.clientX);
}

/** Slide the dragged piece to the hand slot under the pointer. */
function moveInHand(x) {
  const handEl = $('hand');
  const pieces = [...handEl.children];
  const gap = parseFloat(getComputedStyle(handEl).columnGap) || 0;
  const pitch = drag.btn.offsetWidth + gap;
  const rect = handEl.getBoundingClientRect();
  const left = rect.left + (rect.width - pieces.length * pitch + gap) / 2; // the row is centered
  const to = Math.min(Math.max(Math.floor((x - left) / pitch), 0), pieces.length - 1);
  const from = pieces.indexOf(drag.btn);
  if (to === from) return;

  const before = pieces.map((el) => el.offsetLeft);
  handEl.insertBefore(drag.btn, pieces[to > from ? to + 1 : to] ?? null);
  handOrder.splice(to, 0, handOrder.splice(from, 1)[0]);
  if (reduceMotion) return;
  pieces.forEach((el, i) => {
    const shift = before[i] - el.offsetLeft;
    if (shift && el !== drag.btn) el.animate({ translate: [`${shift}px 0`, '0 0'] }, { duration: 120, easing: 'ease-out' });
  });
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { key, ghost, btn, dx, dy } = drag;
  const up = e.type === 'pointerup';
  const dropped = up && !!ghost;
  const after = view.drop({
    key,
    ghost,
    btn,
    dx,
    dy,
    x: e.clientX,
    y: e.clientY,
    tapped: up && !ghost,
    dropped,
    rearranged: dropped && within('hand', e.clientX, e.clientY),
    keepGhost: () => (drag.ghost = null),
  });
  cancelDrag();
  after();
}

function cancelDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag.btn?.classList.remove('dragging');
  drag = null;
  view.dragClear();
}

function within(id, x, y) {
  const r = $(id).getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// ---- mocking blunders -----------------------------------------------------------

const MOCK_EMOJI = ['🤡', '🤦', '🙈', '🤣', '🐔'];
const LAUGHS = ['😂', '🤣', '😆'];
let lastMockLine = -1;

/** An illegal move or a forgotten flor: the whole table laughs at me. */
function laughAtMe() {
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

for (const { src } of Object.values(IMAGES)) new Image().src = src; // so the first one doesn't pop in empty

function fillReaction(el, emoji) {
  if (!IMAGES[emoji]) return void (el.textContent = emoji);
  const img = document.createElement('img');
  img.src = IMAGES[emoji].src;
  img.alt = '';
  el.append(img);
}

// The picker: a popover over the table, opening on what this device sent last.
const RECENT_KEY = 'domino.reactions';
const MAX_RECENT = 12;
let reactTab = 'recent';
let reactTimer;

function recentReactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY));
    const known = Array.isArray(saved) ? saved.filter((id) => REACTIONS.includes(id)) : [];
    if (known.length) return known;
  } catch {}
  return FIRST_RECENT;
}

function rememberReaction(id) {
  const recent = [id, ...recentReactions().filter((r) => r !== id)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

function paintReactions() {
  const tabs = [{ id: 'recent', icon: '🕘', items: recentReactions() }, ...REACTION_TABS];
  $('reactTabs').innerHTML = tabs
    .map(
      (tab) => `<button role="tab" data-react-tab="${tab.id}" aria-selected="${tab.id === reactTab}">
        <span aria-hidden="true">${tab.icon}</span><small>${t(`react.${tab.id}`)}</small></button>`,
    )
    .join('');
  $('reactGrid').innerHTML = tabs
    .find((tab) => tab.id === reactTab)
    .items.map((id) =>
      IMAGES[id]
        ? `<button data-emoji="${id}" aria-label="${esc(IMAGES[id].label)}"><img src="${IMAGES[id].src}" alt="" /></button>`
        : `<button data-emoji="${id}">${id}</button>`,
    )
    .join('');
}

function openReactions() {
  reactTab = 'recent';
  paintReactions();
  $('reactBar').hidden = false;
  $('reactBtn').setAttribute('aria-expanded', 'true');
}

function closeReactions() {
  clearTimeout(reactTimer);
  $('reactBar').hidden = true;
  $('reactBtn').setAttribute('aria-expanded', 'false');
}

function floatEmoji(seat, emoji) {
  const anchor = seatEl(seat);
  const rect = anchor.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'reaction';
  fillReaction(el, emoji);
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
  fillReaction(el, emoji);
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.style.setProperty('--crowd', crowd);
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}

function showReaction({ seat, emoji, crowd, slow }) {
  if (slow != null) {
    // Someone is taking too long: the rest of the table sends it together.
    [0, 1, 2, 3].filter((s) => s !== slow).forEach((s, i) => setTimeout(() => floatEmoji(s, emoji), i * 150));
    if (slow === me()) buzz([80, 60, 80]);
    return crowdEmoji(emoji, crowd); // silent: it mocks, it doesn't need to shout
  }
  floatEmoji(seat, emoji);
  if (crowd <= 1) return sound.play('react');
  crowdEmoji(emoji, crowd);
  if (emoji === 'manguangua') sound.playClip('manguangua'); // his catchphrase, as when the bot says it
  else sound.play('crowd');
}

// ---- voice chat ---------------------------------------------------------------

// Signaling is best-effort: no "not connected" toast; a reconnect re-joins.
const sendBestEffort = (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));

const voice = createVoice({
  send: sendBestEffort,
  onChange: paintVoice,
  onJoin: (name) => toast(t('voiceJoined', { name: name || '?' })),
  onRoster: offerVoice,
});

// When others are in voice and we aren't, offer to join them. "Not now" (or hanging up)
// holds until voice has been empty a while, so someone reconnecting doesn't ask again.
const OFFER_RESET_MS = 15000;
const voiceOffer = { open: false, started: null, declined: false, timer: null };

function offerVoice(kind) {
  const others = voice.others;
  clearTimeout(voiceOffer.timer);
  if (!others.length) voiceOffer.timer = setTimeout(() => (voiceOffer.declined = false), OFFER_RESET_MS);
  else if (!voiceOffer.open && !voiceOffer.declined && !voice.joined) {
    voiceOffer.open = true;
    // Someone just turned it on, or we found it already on.
    voiceOffer.started = kind === 'join' && others.length === 1 ? others[0] : null;
  }
  paintVoice();
}

/** Someone in voice as the table knows them: a seated player's name, team and photo. */
function inVoiceAs(p) {
  const s = state?.seats[p.seat];
  if (s && !s.bot) return { name: s.name, team: s.team, photo: photoOf(p.seat), muted: p.muted };
  return { name: p.name || '?', team: null, photo: null, muted: p.muted };
}

function paintVoiceOffer() {
  const others = voice.others;
  if (voice.joined || !others.length) voiceOffer.open = false;
  $('voiceInvite').hidden = !voiceOffer.open;
  if (!voiceOffer.open) return;
  const people = others.map(inVoiceAs);
  const started = others.includes(voiceOffer.started) ? inVoiceAs(voiceOffer.started) : null;
  $('voiceInviteTitle').textContent = started ? t('voiceInvite.started', { name: started.name }) : t('voiceInvite.on');
  $('voiceInviteText').textContent =
    started && people.length === 1
      ? t('voiceInvite.startedText')
      : t('voiceInvite.onText', { names: new Intl.ListFormat(i18n.lang, { type: 'conjunction' }).format(people.map((p) => p.name)), n: people.length });
  $('voiceInvitePeople').innerHTML = people
    .map(
      (p) => `<div class="voice-invite-person">
      <div class="avatar"${p.team == null ? '' : ` data-team="${p.team}"`} data-voice="${p.muted ? 'muted' : 'on'}">${p.photo ? photoImg(p.photo, 'avatar-photo') : esc([...p.name][0]?.toUpperCase() ?? '?')}</div>
      ${nameHTML(p.name)}</div>`,
    )
    .join('');
}

function declineVoiceOffer() {
  voiceOffer.open = false;
  voiceOffer.declined = true;
  paintVoice();
}

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
  paintVoiceOffer();
  if (!state) return;
  // Mic badge on the avatars of seated players in voice; a ring while they talk.
  const inVoice = voice.bySeat();
  for (let pos = 0; pos < 4; pos++) {
    const seatAvatarEl = $(SEAT_IDS[pos]).querySelector('.avatar');
    if (!seatAvatarEl) continue;
    const v = inVoice.get(seatAt(pos));
    seatAvatarEl.classList.toggle('speaking', !!v?.speaking);
    if (v) seatAvatarEl.dataset.voice = v.muted ? 'muted' : 'on';
    else delete seatAvatarEl.dataset.voice;
  }
  for (const el of $('lobbySeats').querySelectorAll('.lobby-seat')) {
    const v = inVoice.get(Number(el.dataset.sit));
    el.classList.toggle('speaking', !!v?.speaking);
    if (v) el.dataset.voice = v.muted ? 'muted' : 'on';
    else delete el.dataset.voice;
  }
}

async function joinVoice() {
  const result = await voice.join();
  toast(t({ ok: 'voiceOn', blocked: 'voiceBlocked', noMic: 'voiceNoMic' }[result]), result === 'ok' ? 1800 : 3200);
}

for (const btn of document.querySelectorAll('.voice-btn')) {
  btn.onclick = () => {
    if (!voice.joined) return joinVoice();
    if (!voice.canTalk) return toast(t('voiceListening'));
    voice.setMuted(!voice.muted);
  };
}
for (const btn of document.querySelectorAll('.voice-leave')) {
  btn.onclick = () => {
    voice.leave();
    voiceOffer.declined = true; // hung up on purpose: don't ask again right away
    toast(t('voiceOff'));
  };
}
$('voiceInviteJoin').onclick = () => {
  voiceOffer.open = false;
  paintVoice();
  joinVoice();
};
$('voiceInviteLater').onclick = declineVoiceOffer;
$('voiceInvite').addEventListener('click', (e) => e.target === $('voiceInvite') && declineVoiceOffer());
document.addEventListener('keydown', (e) => e.key === 'Escape' && voiceOffer.open && declineVoiceOffer());
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
    // Give everyone a moment to see the final move before the overlay.
    clearTimeout(resultTimer);
    resultTimer = setTimeout(build, view.resultDelay(prev));
  } else if (!fresh && overlay.hidden && resultTimer) {
    // still waiting for the delayed build
  } else build();
}

function buildResult(fresh) {
  const r = state.round;
  const isMatch = state.phase === 'matchEnd';
  const mine = me() !== -1;
  const card = $('resultCard');
  const overlay = $('result');
  resultTimer = null;

  const res = view.result(isMatch);
  const winTeam = isMatch ? (state.scores[0] > state.scores[1] ? 0 : 1) : res.winTeam;
  const weWon = mine && winTeam === myTeam();

  let emoji, title, sub;
  if (isMatch) {
    emoji = !mine ? '🏆' : weWon ? '🏆' : '😭';
    title = !mine ? t('teamWinsMatch', { team: teamLabel(winTeam) }) : weWon ? t('youWinMatch') : t('youLoseMatch');
    sub = t('matchSub', { a: state.scores[winTeam], b: state.scores[1 - winTeam], n: state.roundNo });
    if (res.lastRound) sub = t('lastRound', { sub, how: res.lastRound });
  } else if (res.tie) {
    emoji = '🤝';
    ({ title, sub } = res.tie);
  } else {
    emoji = !mine ? res.emoji : weWon ? '🎉' : '😬';
    title = `${teamLabel(winTeam)} ${signed(res.gained[winTeam])}`;
    sub = res.sub;
  }

  card.className = `result-card ${isMatch ? 'match' : ''} ${isMatch && mine ? (weWon ? 'won' : 'lost') : ''}`;
  $('resultEmoji').textContent = emoji;
  $('resultTitle').textContent = title;
  $('resultSub').textContent = sub;

  const plus = (team) => (res.gained[team] ? `<em>${signed(res.gained[team])}</em>` : '');
  const order = [myTeam(), 1 - myTeam()];
  $('resultScores').innerHTML = order
    .map(
      (team) =>
        `<div class="rs" data-team="${team}"><span>${teamLabel(team)}</span><b>${state.scores[team]}</b>${plus(team)}</div>`,
    )
    .join(`<div class="rs-target">${t('to', { n: state.target })}</div>`);

  $('resultAwards').innerHTML = res.details;

  $('resultHands').innerHTML = r.hands
    ? [0, 1, 2, 3]
        .map((i) => seatAt(i))
        .map(
          (s) => `<div class="rh" data-team="${s % 2}">
            ${nameHTML(seatName(s), 'rh-name')}
            ${view.resultHand(r.hands[s])}</div>`,
        )
        .join('')
    : '';

  const actions = [];
  if (mine) {
    if (isMatch) actions.push(
        `<button class="btn primary" data-act="rematch">${t('rematch')}</button>`,
        `<button class="btn" data-act="lobby">${t('backToLobby')}</button>`,
      );
    else actions.push(
      `<button class="btn primary" data-act="next">${t('nextRound')}</button>`,
      `<button class="btn" data-act="lobby">${t('backToLobby')}</button>`,
    );
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
          const { cell, how } = view.historyRow(h);
          return `<tr><td>${h.round}</td><td class="c0">${cell(left)}</td><td class="c1">${cell(right)}</td><td class="how">${how}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="4" class="muted center">${t('noRounds')}</td></tr>`;
}

// ---- rules --------------------------------------------------------------------

function paintRules() {
  $('rulesTitle').textContent = t('rulesOf', { game: t(`game.${state.game}`) });
  $('rulesBody').innerHTML = RULES[state.game][i18n.lang]
    .map(({ h, items }) => `<h3>${esc(h)}</h3><ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`)
    .join('');
}

// ---- events -----------------------------------------------------------------

$('hand').addEventListener('pointerdown', onHandDown);
$('hand').addEventListener('click', (e) => view?.handClick?.(e));
$('mock').addEventListener('animationend', (e) => {
  if (e.animationName === 'mock-out') $('mock').hidden = true;
});
window.addEventListener('pointermove', onDragMove, { passive: false });
window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', onDragEnd);

document.body.addEventListener('click', (e) => {
  const el = e.target.closest('[data-botify],[data-sit],[data-remove],[data-stand],[data-act],[data-close],[data-target],[data-variant],[data-pick],[data-theme-pick],[data-rules]');
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
  if (el.dataset.variant) return send({ t: 'variant', variant: Number(el.dataset.variant) });
  if (el.dataset.pick) {
    $('gamesSheet').hidden = true;
    return el.dataset.pick !== state.game && send({ t: 'game', game: el.dataset.pick });
  }
  if (el.dataset.themePick) {
    $('stylesSheet').hidden = true;
    return el.dataset.themePick !== state.theme && send({ t: 'theme', theme: el.dataset.themePick });
  }
  if ('close' in el.dataset) return (el.closest('.sheet, .confirm').hidden = true);
  if ('rules' in el.dataset) return openRules();
  const act = el.dataset.act;
  if (act === 'peek') return $('result').classList.add('peek');
  if (act === 'unpeek') return $('result').classList.remove('peek');
  // Back to the lobby ends the game for all four and resets the score, so it asks first.
  // After the match there is nothing left to lose.
  if (act === 'lobby' && !el.closest('#confirmLobby') && state.phase !== 'matchEnd') return void ($('confirmLobby').hidden = false);
  if (act) {
    $('confirmLobby').hidden = true;
    fx.stop();
    document.body.classList.remove('sad');
    send({ t: act });
  }
});

// A name cut short at the table shows whole when tapped.
$('app').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  const name = e.target.closest('.seat')?.querySelector('.name[title]');
  if (name && (name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1)) toast(name.title, 2400);
});

$('result').addEventListener('click', (e) => {
  if (e.target === $('result') && $('result').classList.contains('peek')) $('result').classList.remove('peek');
});

$('scoreBtn').onclick = () => state && state.phase !== 'lobby' && ($('scoreSheet').hidden = false);
$('scoreSheet').addEventListener('click', (e) => e.target === $('scoreSheet') && ($('scoreSheet').hidden = true));
$('rulesSheet').addEventListener('click', (e) => e.target === $('rulesSheet') && ($('rulesSheet').hidden = true));
$('gamesSheet').addEventListener('click', (e) => e.target === $('gamesSheet') && ($('gamesSheet').hidden = true));
$('gameCard').onclick = () => {
  paintGames();
  $('gamesSheet').hidden = false;
};
$('stylesSheet').addEventListener('click', (e) => e.target === $('stylesSheet') && ($('stylesSheet').hidden = true));
$('teamCard').onclick = openTeamSheet;
$('teamSheet').addEventListener('click', (e) => e.target === $('teamSheet') && ($('teamSheet').hidden = true));
$('teamInput').addEventListener('input', paintTeamIdeas);
$('teamIdeas').addEventListener('click', (e) => {
  const idea = e.target.closest('[data-idea]')?.dataset.idea;
  if (!idea) return;
  $('teamInput').value = idea;
  paintTeamIdeas();
});
$('teamForm').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ t: 'teamName', name: $('teamInput').value });
  $('teamSheet').hidden = true;
});
$('teamClear').onclick = () => {
  send({ t: 'teamName', name: '' });
  $('teamSheet').hidden = true;
};
$('inviteBtn').onclick = invite;
$('botsBtn').onclick = () => send({ t: 'addBots' });
$('startBtn').onclick = () => send({ t: 'start' });

$('reactBtn').onclick = () => ($('reactBar').hidden ? openReactions() : closeReactions());
$('reactBar').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-react-tab]')?.dataset.reactTab;
  if (tab) {
    reactTab = tab;
    return paintReactions();
  }
  const emoji = e.target.closest('[data-emoji]')?.dataset.emoji;
  if (!emoji) return;
  send({ t: 'react', emoji });
  rememberReaction(emoji); // Recent isn't repainted while open, so nothing moves under the finger
  // Open a moment longer for a burst of laughs, then out of the way.
  clearTimeout(reactTimer);
  reactTimer = setTimeout(closeReactions, 2500);
});
// A tap anywhere else puts it away.
document.addEventListener('pointerdown', (e) => {
  if (!$('reactBar').hidden && !e.target.closest('#reactBar, #reactBtn')) closeReactions();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeReactions());

// ---- the ⋯ menu ---------------------------------------------------------------

function openRules() {
  if (!state) return;
  paintRules();
  $('rulesBody').scrollTop = 0;
  $('rulesSheet').hidden = false;
}

/** What the menu offers right now, and the current value beside each setting. */
function paintMenu() {
  $('menuSound').textContent = t(sound.isMuted() ? 'off' : 'on');
  if (!state) return;
  $('menuStyleName').textContent = t(`theme.${state.theme}`);
  $('menuLobby').hidden = state.phase === 'lobby' || me() === -1;
}

let menuOpener = null;
/** Open the menu under the button that asked for it, right-aligned with it. */
function openMenu(btn) {
  paintMenu();
  const r = btn.getBoundingClientRect();
  // The panel is zoomed like the rest of the page on large screens, and so are its offsets.
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
  const panel = $('menuPanel');
  panel.style.top = `${(r.bottom + 6) / z}px`;
  panel.style.right = `${Math.max(8, innerWidth - r.right) / z}px`;
  $('menu').hidden = false;
  menuOpener = btn;
  btn.setAttribute('aria-expanded', 'true');
  panel.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
}

function closeMenu() {
  if ($('menu').hidden) return;
  $('menu').hidden = true;
  menuOpener?.setAttribute('aria-expanded', 'false');
  menuOpener = null;
}

document.querySelectorAll('[data-menu-open]').forEach((btn) => (btn.onclick = () => openMenu(btn)));
$('menu').addEventListener('click', (e) => {
  if (e.target === $('menu')) return closeMenu();
  const item = e.target.closest('[data-menu]')?.dataset.menu;
  if (!item) return;
  if (item === 'sound') {
    sound.setMuted(!sound.isMuted());
    return paintMenu(); // a setting: the menu stays open to show it changed
  }
  if (item === 'lang') {
    i18n.cycle();
    if (state) render(state);
    return paintMenu();
  }
  closeMenu();
  if (item === 'invite') share();
  else if (item === 'rules') openRules();
  else if (item === 'style' && state) {
    paintStyles();
    $('stylesSheet').hidden = false;
  } else if (item === 'lobby' && state) {
    if (state.phase !== 'matchEnd') return void ($('confirmLobby').hidden = false);
    fx.stop();
    document.body.classList.remove('sad');
    send({ t: 'lobby' });
  }
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

i18n.apply();
paintMenu();

let nameTimer;
$('nameInput').addEventListener('input', (e) => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const v = e.target.value.trim().slice(0, e.target.maxLength);
    if (!v) return;
    myName = v;
    if (!playAs) localStorage.setItem('domino.name', v);
    send({ t: 'rename', name: v });
  }, 300);
});
$('nameInput').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

const ctx = {
  get state() {
    return state;
  },
  $,
  esc,
  me,
  posOf,
  seatName,
  seatEl,
  seatAvatar: (seat) => seatEl(seat).querySelector('.avatar'),
  teamLabel,
  toast,
  buzz,
  shake,
  send,
  laughAtMe,
  within,
  /** Paint the table and hand again after a change only this page knows about. */
  redraw() {
    view.renderBoard(state);
    renderHand();
  },
  sortHand(compare) {
    handOrder.sort(compare);
    renderHand();
  },
};
const views = {
  domino: createDominoView(ctx),
  truco: createTrucoView(ctx),
  caida: createCaidaView(ctx),
  parchis: createParchisView(ctx),
  cochina: createCochinaView(ctx),
  rummy: createRummyView(ctx),
};

// For tests and the console: what this tab knows, and its way to talk to the server.
// It's what the page already holds, so it's there in production too.
window.__laMesa = {
  get state() {
    return state;
  },
  heard,
  send,
  matchId,
  token,
};

connect();
