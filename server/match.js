// A match as plain, serializable state plus the rules for changing it.
// Connections, timers and storage live elsewhere (see hub.js / store.js) so a
// match can be loaded and saved by any server instance.
import * as G from './game.js';

const BOT_NAMES = ['Bot Ana', 'Bot Beto', 'Bot Coco', 'Bot Dani'];
export const BOT_DELAY_MS = 900;
export const AUTO_PASS_DELAY_MS = 1300;
const TARGETS = [100, 150, 200];
const MAX_NAME = 16;
export const REACTIONS = ['👏', '😂', '😮', '😡', '🔥', '👋'];
const REACTION_COOLDOWN_MS = 600;
const BLUNDER_COOLDOWN_MS = 2000;

const cleanName = (name) =>
  String(name ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, MAX_NAME);

const bot = (i) => ({ token: null, name: BOT_NAMES[i], bot: true });

export class Match {
  constructor(id, data = null) {
    this.id = id;
    /** @type {({token: string|null, name: string, bot: boolean, replaced?: string} | null)[]} */
    this.seats = [null, null, null, null];
    this.names = {}; // token -> display name (spectators included)
    this.phase = 'lobby'; // lobby | playing | roundEnd | matchEnd
    this.target = 100;
    this.scores = [0, 0];
    this.history = [];
    this.round = null;
    this.roundNo = 0;
    this.nextStarter = null;
    this.reaction = null; // latest emoji thrown at the table: { n, seat, emoji, at }
    this.blunder = null; // latest illegal move attempt, for the table to mock: { n, seat, at }
    this.v = 0;
    if (data) Object.assign(this, data, { id });
  }

  toJSON() {
    const { id, seats, names, phase, target, scores, history, round, roundNo, nextStarter, reaction, blunder, v } = this;
    return { id, seats, names, phase, target, scores, history, round, roundNo, nextStarter, reaction, blunder, v };
  }

  seatOf(token) {
    return this.seats.findIndex((s) => s && !s.bot && s.token === token);
  }

  // ---- changes (each returns true if the match changed) ---------------------

  join(token, name) {
    name = cleanName(name) || 'Player';
    this.names[token] = name;
    const seat = this.seatOf(token);
    // A player who dropped and got swapped for a bot gets their seat back.
    const replaced = this.seats.findIndex((s) => s?.bot && s.replaced === token);
    if (seat !== -1) this.seats[seat].name = name;
    else if (replaced !== -1) this.seats[replaced] = { token, name, bot: false };
    else if (this.phase === 'lobby') {
      const empty = this.seats.indexOf(null);
      if (empty !== -1) this.seats[empty] = { token, name, bot: false };
    }
    return true;
  }

  /** Free lobby seats whose players are gone. */
  cleanupLobby(online) {
    if (this.phase !== 'lobby') return false;
    let changed = false;
    this.seats = this.seats.map((s) => {
      if (s && !s.bot && !online.has(s.token)) {
        changed = true;
        return null;
      }
      return s;
    });
    return changed;
  }

  /** Apply a player's message. Throws G.MoveError for illegal moves. */
  handle(token, msg, online) {
    const seat = this.seatOf(token);
    switch (msg?.t) {
      case 'rename': {
        const name = cleanName(msg.name);
        if (!name) return false;
        this.names[token] = name;
        if (seat !== -1) this.seats[seat].name = name;
        return true;
      }
      case 'sit':
        return this.sit(token, seat, Number(msg.seat));
      case 'stand':
        if (this.phase !== 'lobby' || seat === -1) return false;
        this.seats[seat] = null;
        return true;
      case 'addBots':
        if (this.phase !== 'lobby') return false;
        this.seats = this.seats.map((s, i) => s ?? bot(i));
        return true;
      case 'removeBot': {
        const i = Number(msg.seat);
        if (this.phase !== 'lobby' || !this.seats[i]?.bot) return false;
        this.seats[i] = null;
        return true;
      }
      case 'botify': {
        // Replace a disconnected human with a bot so the game can continue.
        const i = Number(msg.seat);
        const s = this.seats[i];
        if (seat === -1 || !s || s.bot || online.has(s.token)) return false;
        this.seats[i] = { ...bot(i), replaced: s.token };
        return true;
      }
      case 'react': {
        if (seat === -1 || !REACTIONS.includes(msg.emoji)) return false;
        const now = Date.now();
        if (this.reaction && now - this.reaction.at < REACTION_COOLDOWN_MS) return false;
        this.reaction = { n: (this.reaction?.n ?? 0) + 1, seat, emoji: msg.emoji, at: now };
        return true;
      }
      case 'blunder': {
        // The client caught an illegal move on its own turn; the tile is never revealed.
        if (this.phase !== 'playing' || seat === -1 || this.round.turn !== seat) return false;
        const now = Date.now();
        if (this.blunder && now - this.blunder.at < BLUNDER_COOLDOWN_MS) return false;
        this.blunder = { n: (this.blunder?.n ?? 0) + 1, seat, at: now };
        return true;
      }
      case 'target':
        if (this.phase !== 'lobby' || !TARGETS.includes(Number(msg.target))) return false;
        this.target = Number(msg.target);
        return true;
      case 'start':
        if (this.phase !== 'lobby' || seat === -1 || this.seats.includes(null)) return false;
        this.startRound();
        return true;
      case 'play':
        if (this.phase !== 'playing' || seat === -1) return false;
        G.play(this.round, seat, msg.tile, msg.end === 'L' ? 'L' : 'R');
        this.afterMove();
        return true;
      case 'next':
        if (this.phase !== 'roundEnd' || seat === -1) return false;
        this.startRound();
        return true;
      case 'rematch':
        if (this.phase !== 'matchEnd' || seat === -1) return false;
        this.resetScores();
        this.startRound();
        return true;
      case 'lobby':
        // Back to the lobby to change seats/teams after a match.
        if (this.phase !== 'matchEnd' || seat === -1) return false;
        this.resetScores();
        this.phase = 'lobby';
        this.round = null;
        return true;
      default:
        return false;
    }
  }

  sit(token, currentSeat, target) {
    if (!(target >= 0 && target < 4)) return false;
    const occupant = this.seats[target];
    if (occupant && !occupant.bot) return false;
    const me = { token, name: this.names[token] || 'Player', bot: false };
    if (this.phase === 'lobby') {
      if (occupant?.bot) return false; // remove the bot first
      if (currentSeat !== -1) this.seats[currentSeat] = null;
      this.seats[target] = me;
      return true;
    }
    // Mid-game a spectator can take over a bot (and its hand).
    if (currentSeat === -1 && occupant?.bot) {
      this.seats[target] = me;
      return true;
    }
    return false;
  }

  resetScores() {
    this.scores = [0, 0];
    this.history = [];
    this.roundNo = 0;
    this.nextStarter = null;
  }

  startRound(rng = Math.random) {
    this.round = G.newRound({ starter: this.nextStarter, rng });
    this.roundNo += 1;
    this.phase = 'playing';
  }

  afterMove() {
    const r = this.round;
    if (!r.over) return;
    const { winnerTeam, points, reason, winnerSeat, teamPips } = r.over;
    if (winnerTeam != null) this.scores[winnerTeam] += points;
    this.history.push({ round: this.roundNo, reason, winnerTeam, winnerSeat, points, teamPips });
    this.nextStarter = winnerSeat ?? G.nextSeat(r.starter);
    this.phase = this.scores.some((s) => s >= this.target) ? 'matchEnd' : 'roundEnd';
  }

  // ---- automatic moves (bots, forced passes) -------------------------------

  /** If the current turn should play itself, how long to wait and a key identifying the turn. */
  pendingAuto() {
    if (this.phase !== 'playing') return null;
    const r = this.round;
    const isBot = this.seats[r.turn]?.bot;
    const stuck = !G.legalMoves(r, r.turn).length;
    if (!isBot && !stuck) return null;
    return {
      delay: stuck ? AUTO_PASS_DELAY_MS : BOT_DELAY_MS,
      key: `${this.roundNo}:${r.line.length}:${r.turn}:${r.lastAction?.type ?? ''}`,
    };
  }

  /** Run the pending automatic move, but only if it is still the same turn. */
  runAuto(key) {
    const p = this.pendingAuto();
    if (!p || p.key !== key) return false;
    const r = this.round;
    const move = G.botMove(r, r.turn);
    if (move) G.play(r, r.turn, move.tile, move.end);
    else G.pass(r, r.turn);
    this.afterMove();
    return true;
  }

  // ---- view ----------------------------------------------------------------

  stateFor(token, online) {
    const seat = this.seatOf(token);
    const r = this.round;
    const revealed = this.phase === 'roundEnd' || this.phase === 'matchEnd';
    let spectators = 0;
    for (const t of online) if (this.seatOf(t) === -1) spectators++;
    return {
      t: 'state',
      matchId: this.id,
      you: seat,
      phase: this.phase,
      target: this.target,
      scores: this.scores,
      history: this.history,
      roundNo: this.roundNo,
      spectators,
      reaction: this.reaction && { n: this.reaction.n, seat: this.reaction.seat, emoji: this.reaction.emoji },
      blunder: this.blunder && { n: this.blunder.n, seat: this.blunder.seat },
      seats: this.seats.map((s, i) =>
        s
          ? {
              name: s.name,
              bot: s.bot,
              online: s.bot || online.has(s.token),
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
}
