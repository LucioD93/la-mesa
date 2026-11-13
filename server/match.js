// A match as plain, serializable state plus the rules for changing it.
// Connections, timers and storage live elsewhere (see hub.js / store.js) so a
// match can be loaded and saved by any server instance.
import { createHash } from 'node:crypto';
import { MoveError, teamOf } from './games/common.js';
import { DEFAULT_GAME, GAME_IDS, gameRules, isGame } from './games/index.js';
import { matchRng } from './dev/config.js';

// Venezuelan memes.
const BOTS = [
  { name: 'El Manguangua', emoji: '☕' },
  { name: 'Súper Bigote', emoji: '🦸' },
  { name: 'El Pajarito', emoji: '🐦' },
  { name: 'Plan Conejo', emoji: '🐰' },
  { name: 'Chigüire Bipolar', emoji: '🦫' },
  { name: 'Cheverito', emoji: '😎' },
  { name: 'Exprópiese', emoji: '🏢' },
  { name: 'El Bachaquero', emoji: '🐜' },
];
const MAX_NAME = 24;
const MAX_TEAM_NAME = 16;
// Same ids as public/js/reactions.js, in its order. El Manguangua is a photo, not an emoji.
export const REACTIONS = [
  '😂', '🤣', '😭', '🥲', '😮', '😱', '😡', '🤬', '🤔', '😏', '🙄', '😴', '🤡', '🥵', '😎', '🤯',
  '👏', '👍', '👎', '🙏', '🤌', '💪', '🫡', '👀', '🤝', '✌️',
  '🔥', '💯', '🎉', '🍀', '💀', '🐢', '⏳', '🧠', '🎯', '🏆',
  'manguangua',
];
const REACTION_COOLDOWN_MS = 600; // per player, so a pile-on is not throttled
const REACTION_CROWD_MS = 3000; // same emoji from others within this joins the crowd
export const SLOW_TURN_MS = 60_000; // a player thinking longer than this gets mocked by the whole table
const HURRY_REACTIONS = ['manguangua', '🐢', '🐌', '🦥', '😴', '🥱', '💤', '⏳']; // one picked at random each time
const BLUNDER_COOLDOWN_MS = 2000;
// How the table looks. Everyone at the table sees the same one.
export const THEMES = ['felt', 'pencil', 'neon', 'minimal', 'dark', 'halloween', 'christmas'];
export const DEFAULT_THEME = 'felt';
const isTheme = (id) => THEMES.includes(id);

const cleanName = (name, max = MAX_NAME) =>
  [...String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim()]
    .slice(0, max)
    .join('')
    .trim();

/** A random bot who isn't at the table yet. */
const newBot = (seats) => {
  const free = BOTS.filter((b) => !seats.some((s) => s?.bot && s.name === b.name));
  return { token: null, ...free[Math.floor(Math.random() * free.length)], bot: true };
};

/** A stable id for a player that is safe to show others; the token stays secret. */
export const publicId = (token) => createHash('sha256').update(token).digest('hex').slice(0, 12);

export class Match {
  constructor(id, data = null) {
    this.id = id;
    this.game = isGame(data?.game) ? data.game : DEFAULT_GAME;
    this.hiddenGames = []; // games whose feature flag is off for this match: the lobby doesn't offer them
    /** @type {({token: string|null, name: string, bot: boolean, emoji?: string, replaced?: string} | null)[]} */
    this.seats = [null, null, null, null];
    this.names = {}; // token -> display name (spectators included)
    this.phase = 'lobby'; // lobby | playing | roundEnd | matchEnd
    this.target = this.rules.defaultTarget;
    this.variant = this.rules.defaultVariant ?? null; // a choice the game offers: parchís's dice
    this.theme = DEFAULT_THEME;
    this.teamNames = [null, null]; // what each team chose to be called; null shows Us / Them
    this.scores = [0, 0];
    this.history = [];
    this.round = null;
    this.roundNo = 0;
    this.startedAt = null; // when the first round was dealt, for the match's length in analytics
    this.nextStarter = null; // who starts the next round, null to let the game pick
    this.reaction = null; // latest emoji thrown at the table: { n, seat, emoji, at, sent, crowd, slow? }
    this.hurried = null; // the moment key of the last slow player the table hurried, so it happens once
    this.blunder = null; // latest illegal move or forgotten flor, for the table to mock: { n, seat, at }
    this.v = 0;
    if (data) Object.assign(this, data, { id, game: this.game });
    if (!isTheme(this.theme)) this.theme = DEFAULT_THEME; // saved before themes existed
    if (!Array.isArray(this.teamNames)) this.teamNames = [null, null]; // saved before team names existed
  }

  toJSON() {
    const { id, game, hiddenGames, theme, teamNames, seats, names, phase, target, variant, scores, history, round, roundNo, startedAt, nextStarter, reaction, hurried, blunder, v } = this;
    return { id, game, hiddenGames, theme, teamNames, seats, names, phase, target, variant, scores, history, round, roundNo, startedAt, nextStarter, reaction, hurried, blunder, v };
  }

  /** The rules of the game this match is playing. */
  get rules() {
    return gameRules(this.game);
  }

  /** Switch game (lobby only). Each game has its own targets and variants, so they reset. */
  setGame(id) {
    if (this.phase !== 'lobby' || !isGame(id) || id === this.game || this.hiddenGames.includes(id)) return false;
    this.game = id;
    this.target = this.rules.defaultTarget;
    this.variant = this.rules.defaultVariant ?? null;
    return true;
  }

  /** Stop offering these games (their flags are off), and offer the rest. A game already picked stays. */
  hideGames(ids) {
    const hidden = GAME_IDS.filter((id) => ids.includes(id));
    if (hidden.join() === this.hiddenGames.join()) return false;
    this.hiddenGames = hidden;
    return true;
  }

  /** Change how the table looks. Everyone in the match sees the new style. */
  setTheme(id) {
    if (!isTheme(id) || id === this.theme) return false;
    this.theme = id;
    return true;
  }

  seatOf(token) {
    return this.seats.findIndex((s) => s && !s.bot && s.token === token);
  }

  // ---- changes (each returns true if the match changed) ---------------------

  join(token, name, gameHint, themeHint) {
    // A link can ask for a game (old Trucazo links), but only a match nobody has joined yet takes it.
    // The first player's last theme also carries over to the new match.
    if (this.v === 0) {
      this.setGame(gameHint);
      this.setTheme(themeHint);
    }
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

  /** Apply a player's message. Throws MoveError for illegal moves. */
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
      case 'teamName': {
        // Either partner names their own team, any time. It stays with the team through seat changes.
        if (seat === -1) return false;
        const team = teamOf(seat);
        const name = cleanName(msg.name, MAX_TEAM_NAME) || null;
        if (name === this.teamNames[team]) return false;
        this.teamNames[team] = name;
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
        for (let i = 0; i < 4; i++) this.seats[i] ??= newBot(this.seats);
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
        this.seats[i] = { ...newBot(this.seats), replaced: s.token };
        return true;
      }
      case 'react': {
        if (seat === -1 || !REACTIONS.includes(msg.emoji)) return false;
        const now = Date.now();
        const last = this.reaction;
        const sent = last?.sent ?? {}; // seat -> when they last reacted
        if (now - (sent[seat] ?? 0) < REACTION_COOLDOWN_MS) return false;
        const joins = last?.emoji === msg.emoji && now - last.at < REACTION_CROWD_MS;
        this.reaction = {
          n: (last?.n ?? 0) + 1,
          seat,
          emoji: msg.emoji,
          at: now,
          sent: { ...sent, [seat]: now },
          crowd: [...new Set([...(joins ? last.crowd ?? [] : []), seat])], // seats sending this emoji together
        };
        return true;
      }
      case 'blunder': {
        // The client caught its own illegal move or forgotten flor; what it holds is never revealed.
        if (this.phase !== 'playing' || seat === -1 || this.round.turn !== seat) return false;
        const now = Date.now();
        if (this.blunder && now - this.blunder.at < BLUNDER_COOLDOWN_MS) return false;
        this.blunder = { n: (this.blunder?.n ?? 0) + 1, seat, at: now };
        return true;
      }
      case 'game':
        return this.setGame(msg.game);
      case 'theme':
        return this.setTheme(msg.theme);
      case 'target':
        if (this.phase !== 'lobby' || !this.rules.targets.includes(Number(msg.target))) return false;
        this.target = Number(msg.target);
        return true;
      case 'variant':
        if (this.phase !== 'lobby' || !this.rules.variants?.includes(Number(msg.variant))) return false;
        this.variant = Number(msg.variant);
        return true;
      case 'start':
        if (this.phase !== 'lobby' || seat === -1 || this.seats.includes(null)) return false;
        this.startRound();
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
        // Return to the lobby at any point to change seats, teams, or game settings.
        if (this.phase === 'lobby' || seat === -1) return false;
        this.resetScores();
        this.phase = 'lobby';
        this.round = null;
        return true;
      default:
        if (this.phase !== 'playing' || seat === -1 || !this.rules.handle(this.round, seat, msg, matchRng(this, 'move'))) return false;
        this.afterMove();
        return true;
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

  startRound(rng = matchRng(this, 'deal')) {
    this.round = this.rules.newRound(this, rng);
    this.roundNo += 1;
    if (this.roundNo === 1) this.startedAt = Date.now();
    this.phase = 'playing';
  }

  afterMove() {
    if (!this.round.over) return;
    this.rules.settle(this);
    this.phase = this.scores.some((s) => s >= this.target) ? 'matchEnd' : 'roundEnd';
  }

  // ---- automatic moves (bots, forced passes) -------------------------------

  /** If the table should play itself, how long to wait and a key identifying the moment. */
  pendingAuto() {
    return this.phase === 'playing' ? this.rules.pendingAuto(this) : null;
  }

  /** Run the pending automatic move, but only if it is still the same moment. */
  runAuto(key, rng = matchRng(this, 'auto')) {
    const p = this.pendingAuto();
    if (!p || p.key !== key) return false;
    this.rules.runAuto(this, rng);
    this.afterMove();
    return true;
  }

  // ---- slow players ----------------------------------------------------------

  /** The human the table is waiting on, if any: { seat, key }. */
  waitingOn() {
    return this.phase === 'playing' && !this.pendingAuto() ? this.rules.waitingOn(this) : null;
  }

  /** Still the same slow moment: everyone else at the table sends the same mocking reaction at once. */
  hurry(key, rng = matchRng(this, 'hurry')) {
    const w = this.waitingOn();
    if (!w || w.key !== key || this.hurried === key) return false;
    this.hurried = key;
    const crowd = [0, 1, 2, 3].filter((s) => s !== w.seat);
    this.reaction = {
      n: (this.reaction?.n ?? 0) + 1,
      seat: crowd[0],
      emoji: HURRY_REACTIONS[Math.floor(rng() * HURRY_REACTIONS.length)],
      at: Date.now(),
      sent: this.reaction?.sent ?? {}, // nobody's own cooldown is spent
      crowd,
      slow: w.seat,
    };
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
      game: this.game,
      theme: this.theme,
      teamNames: this.teamNames,
      offered: GAME_IDS.filter((id) => !this.hiddenGames.includes(id)), // what the lobby's menu lists
      targets: this.rules.targets,
      variants: this.rules.variants ?? null,
      variant: this.variant,
      you: seat,
      phase: this.phase,
      target: this.target,
      scores: this.scores,
      history: this.history,
      roundNo: this.roundNo,
      spectators,
      reaction: this.reaction && {
        n: this.reaction.n,
        seat: this.reaction.seat,
        emoji: this.reaction.emoji,
        crowd: this.reaction.crowd?.length ?? 1,
        ...(this.reaction.slow != null && { slow: this.reaction.slow }), // the seat the whole table is hurrying
      },
      blunder: this.blunder && { n: this.blunder.n, seat: this.blunder.seat },
      seats: this.seats.map((s, i) =>
        s
          ? {
              name: s.name,
              pid: s.token ? publicId(s.token) : null,
              bot: s.bot,
              emoji: s.emoji,
              online: s.bot || online.has(s.token),
              team: teamOf(i),
              count: r?.hands ? r.hands[i].length : 0, // parchís has no hands
            }
          : null,
      ),
      round: r && this.rules.roundView(r, seat, revealed),
    };
  }
}
