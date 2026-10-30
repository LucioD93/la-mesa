import * as G from './game.js';

const BOT_NAMES = ['Bot Ana', 'Bot Beto', 'Bot Coco', 'Bot Dani'];
const BOT_DELAY_MS = 900;
const AUTO_PASS_DELAY_MS = 1300;
const TARGETS = [100, 150, 200];
const MAX_NAME = 16;

const cleanName = (name) =>
  String(name ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, MAX_NAME);

export class Match {
  constructor(id, { onIdle, rng = Math.random, delays = {} } = {}) {
    this.id = id;
    this.rng = rng;
    this.onIdle = onIdle;
    this.botDelay = delays.bot ?? BOT_DELAY_MS;
    this.passDelay = delays.pass ?? AUTO_PASS_DELAY_MS;
    this.lobbyGrace = delays.lobby ?? 15000;
    /** @type {({token: string|null, name: string, bot: boolean} | null)[]} */
    this.seats = [null, null, null, null];
    /** @type {Map<any, {token: string, name: string}>} ws -> client info */
    this.clients = new Map();
    this.phase = 'lobby'; // lobby | playing | roundEnd | matchEnd
    this.target = 100;
    this.scores = [0, 0];
    this.history = [];
    this.round = null;
    this.roundNo = 0;
    this.nextStarter = null;
    this.timer = null;
    this.idleTimer = null;
  }

  // ---- connections ---------------------------------------------------------

  join(ws, token, name) {
    token = String(token || '').slice(0, 64);
    name = cleanName(name) || 'Player';
    this.clients.set(ws, { token, name });
    clearTimeout(this.idleTimer);

    const seat = this.seatOf(token);
    if (seat !== -1) {
      this.seats[seat].name = name;
    } else if (this.phase === 'lobby') {
      const empty = this.seats.indexOf(null);
      if (empty !== -1) this.seats[empty] = { token, name, bot: false };
    }
    this.broadcast();
  }

  leave(ws) {
    this.clients.delete(ws);
    if (this.phase === 'lobby') {
      // Free lobby seats of players who left, after a grace period so a page
      // refresh keeps the seat.
      setTimeout(() => {
        if (this.phase !== 'lobby') return;
        const before = this.seats.filter(Boolean).length;
        this.seats = this.seats.map((s) => (s && !s.bot && !this.isOnline(s.token) ? null : s));
        if (this.seats.filter(Boolean).length !== before) this.broadcast();
      }, this.lobbyGrace).unref?.();
    }
    if (!this.clients.size) {
      this.idleTimer = setTimeout(() => this.onIdle?.(this), 60 * 60 * 1000);
    }
    this.broadcast();
  }

  seatOf(token) {
    return this.seats.findIndex((s) => s && !s.bot && s.token === token);
  }

  isOnline(token) {
    for (const c of this.clients.values()) if (c.token === token) return true;
    return false;
  }

  // ---- messages ------------------------------------------------------------

  handle(ws, msg) {
    const client = this.clients.get(ws);
    if (!client || !msg || typeof msg !== 'object') return;
    const seat = this.seatOf(client.token);
    try {
      switch (msg.t) {
        case 'rename': {
          const name = cleanName(msg.name);
          if (!name) return;
          client.name = name;
          if (seat !== -1) this.seats[seat].name = name;
          break;
        }
        case 'sit':
          this.sit(client, seat, Number(msg.seat));
          break;
        case 'stand':
          if (this.phase === 'lobby' && seat !== -1) this.seats[seat] = null;
          break;
        case 'addBots':
          if (this.phase !== 'lobby') return;
          this.seats = this.seats.map((s, i) => s ?? { token: null, name: BOT_NAMES[i], bot: true });
          break;
        case 'removeBot': {
          const i = Number(msg.seat);
          if (this.phase === 'lobby' && this.seats[i]?.bot) this.seats[i] = null;
          break;
        }
        case 'botify': {
          // Replace a disconnected human with a bot so the game can continue.
          const i = Number(msg.seat);
          const s = this.seats[i];
          if (seat === -1 || !s || s.bot || this.isOnline(s.token)) return;
          this.seats[i] = { token: null, name: BOT_NAMES[i], bot: true };
          break;
        }
        case 'target':
          if (this.phase === 'lobby' && TARGETS.includes(Number(msg.target))) this.target = Number(msg.target);
          break;
        case 'start':
          if (this.phase !== 'lobby' || seat === -1 || this.seats.includes(null)) return;
          this.startRound();
          break;
        case 'play':
          if (this.phase !== 'playing' || seat === -1) return;
          G.play(this.round, seat, msg.tile, msg.end === 'L' ? 'L' : 'R');
          this.afterMove();
          break;
        case 'next':
          if (this.phase !== 'roundEnd' || seat === -1) return;
          this.startRound();
          break;
        case 'rematch':
          if (this.phase !== 'matchEnd' || seat === -1) return;
          this.scores = [0, 0];
          this.history = [];
          this.roundNo = 0;
          this.nextStarter = null;
          this.startRound();
          break;
        case 'lobby':
          // Back to the lobby to change seats/teams after a match.
          if (this.phase !== 'matchEnd' || seat === -1) return;
          this.phase = 'lobby';
          this.round = null;
          this.scores = [0, 0];
          this.history = [];
          this.roundNo = 0;
          this.nextStarter = null;
          break;
        default:
          return;
      }
    } catch (err) {
      if (err instanceof G.MoveError) return this.send(ws, { t: 'error', message: err.message });
      throw err;
    }
    this.broadcast();
  }

  sit(client, currentSeat, target) {
    if (!(target >= 0 && target < 4)) return;
    const occupant = this.seats[target];
    if (occupant && !occupant.bot) return;
    if (this.phase === 'lobby') {
      if (occupant?.bot) return; // remove the bot first
      if (currentSeat !== -1) this.seats[currentSeat] = null;
      this.seats[target] = { token: client.token, name: client.name, bot: false };
      return;
    }
    // Mid-game a spectator can take over a bot (and its hand).
    if (currentSeat === -1 && occupant?.bot) {
      this.seats[target] = { token: client.token, name: client.name, bot: false };
    }
  }

  // ---- game flow -----------------------------------------------------------

  startRound() {
    this.round = G.newRound({ starter: this.nextStarter, rng: this.rng });
    this.roundNo += 1;
    this.phase = 'playing';
    this.schedule();
  }

  afterMove() {
    const r = this.round;
    if (r.over) {
      const { winnerTeam, points, reason, winnerSeat, teamPips } = r.over;
      if (winnerTeam != null) this.scores[winnerTeam] += points;
      this.history.push({ round: this.roundNo, reason, winnerTeam, winnerSeat, points, teamPips });
      this.nextStarter = winnerSeat ?? G.nextSeat(r.starter);
      this.phase = this.scores.some((s) => s >= this.target) ? 'matchEnd' : 'roundEnd';
      clearTimeout(this.timer);
      return;
    }
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.phase !== 'playing') return;
    const r = this.round;
    const seat = r.turn;
    const isBot = this.seats[seat]?.bot;
    const stuck = !G.legalMoves(r, seat).length;
    if (!isBot && !stuck) return;
    this.timer = setTimeout(
      () => {
        if (this.round !== r || r.turn !== seat || r.over) return;
        const move = G.botMove(r, seat);
        if (move && this.seats[seat]?.bot) G.play(r, seat, move.tile, move.end);
        else if (!move) G.pass(r, seat);
        else return; // a human took over this seat meanwhile
        this.afterMove();
        this.broadcast();
      },
      stuck ? this.passDelay : this.botDelay,
    );
  }

  // ---- state ---------------------------------------------------------------

  stateFor(token) {
    const seat = this.seatOf(token);
    const r = this.round;
    const revealed = this.phase === 'roundEnd' || this.phase === 'matchEnd';
    return {
      t: 'state',
      matchId: this.id,
      you: seat,
      phase: this.phase,
      target: this.target,
      scores: this.scores,
      history: this.history,
      roundNo: this.roundNo,
      spectators: [...this.clients.values()].filter((c) => this.seatOf(c.token) === -1).length,
      seats: this.seats.map((s, i) =>
        s
          ? {
              name: s.name,
              bot: s.bot,
              online: s.bot || this.isOnline(s.token),
              team: G.teamOf(i),
              count: r ? r.hands[i].length : 0,
            }
          : null,
      ),
      round: r && {
        line: r.line,
        center: r.center,
        turn: r.over ? null : r.turn,
        mustPlay: r.mustPlay,
        lastAction: r.lastAction,
        over: r.over,
        hand: seat !== -1 ? r.hands[seat] : null,
        legal: seat !== -1 && !r.over && r.turn === seat ? G.legalMoves(r, seat) : [],
        hands: revealed ? r.hands : null,
      },
    };
  }

  send(ws, data) {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  }

  broadcast() {
    for (const [ws, c] of this.clients) this.send(ws, this.stateFor(c.token));
  }

  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.idleTimer);
  }
}
