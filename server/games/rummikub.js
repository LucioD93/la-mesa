// Pure round logic for Rummikub in pairs: 106 tiles (1 to 13 in four colors, twice, plus
// two jokers), 14 each. On your turn you either put tiles from your rack on the table,
// rearranging everything already there as you like as long as every set is a group or a
// run when you're done, or you draw a tile. Your first play has to add up to 30 or more
// with your own tiles, without touching the table. The team that goes out scores what is
// left on the other team's racks.
//
// A tile is a number from 0 to 105: 0-103 are the numbered tiles, color by color, twice
// over (13 and 65 are both the black 1), and 104 and 105 are the jokers. The two copies of
// a tile are interchangeable, so the ids give nothing away.

import { BOT_DELAY_MS, DEAL_MS, MoveError, PLAY_PHRASE_CHANCE, SEATS, isManguangua, nextSeat, shuffle, teamOf } from './common.js';

export const COLORS = 4; // black, blue, orange, red
export const NUMBERS = 13;
export const TILES = 106;
export const RACK_SIZE = 14;
export const MIN_SET = 3;
export const FIRST_PLAY = 30; // what your first play has to add up to
export const JOKER_POINTS = 30; // a joker still on your rack when the round ends

export const isJoker = (id) => id >= COLORS * NUMBERS * 2;
export const numberOf = (id) => (id % NUMBERS) + 1;
export const colorOf = (id) => Math.floor(id / NUMBERS) % COLORS;
const kindOf = (id) => id % (COLORS * NUMBERS); // both copies of a tile share it
const kindId = (color, n) => color * NUMBERS + n - 1;

/** Black first, then by number; jokers at the end. */
export const byColor = (a, b) => isJoker(a) - isJoker(b) || colorOf(a) - colorOf(b) || numberOf(a) - numberOf(b) || a - b;
export const byNumber = (a, b) => isJoker(a) - isJoker(b) || numberOf(a) - numberOf(b) || colorOf(a) - colorOf(b) || a - b;

/**
 * The set these tiles make, laid out, or null. A group is 3 or 4 of a number in different
 * colors; a run is 3 or more in a row of one color, from 1 up to 13 at most. A joker takes
 * the place of any tile: in a run it fills the gaps first, then goes on the high end, and
 * on the low end once the run reaches 13. `values` says what each tile counts as.
 */
export function arrange(ids) {
  if (ids.length < MIN_SET) return null;
  const real = ids.filter((id) => !isJoker(id));
  const jokers = ids.filter(isJoker);
  if (!real.length) return null;
  const n = numberOf(real[0]);
  if (ids.length <= COLORS && real.every((id) => numberOf(id) === n) && new Set(real.map(colorOf)).size === real.length) {
    const tiles = [...real.sort(byColor), ...jokers];
    return { kind: 'group', tiles, values: tiles.map(() => n) };
  }
  if (ids.length > NUMBERS || !real.every((id) => colorOf(id) === colorOf(real[0]))) return null;
  const sorted = real.slice().sort(byNumber);
  if (new Set(sorted.map(numberOf)).size !== sorted.length) return null;
  const lo = numberOf(sorted[0]);
  const hi = numberOf(sorted.at(-1));
  const spare = jokers.length - (hi - lo + 1 - sorted.length);
  if (spare < 0) return null;
  const top = Math.min(NUMBERS, hi + spare);
  const start = lo - (spare - (top - hi));
  const tiles = [];
  const values = [];
  for (let v = start, k = 0, j = 0; v <= top; v++) {
    tiles.push(k < sorted.length && numberOf(sorted[k]) === v ? sorted[k++] : jokers[j++]);
    values.push(v);
  }
  return { kind: 'run', tiles, values };
}

/** What a set adds up to, a joker counting as the tile it stands for. */
export const setPoints = (ids) => arrange(ids)?.values.reduce((a, b) => a + b, 0) ?? 0;

/** What a rack costs at the end of a round: the numbers, and 30 for a joker. */
export const rackPoints = (rack) => rack.reduce((sum, id) => sum + (isJoker(id) ? JOKER_POINTS : numberOf(id)), 0);

const setKey = (ids) => ids.slice().sort((a, b) => a - b).join(',');

// ---- dealing ------------------------------------------------------------------

export function newRound({ starter = 0, rng = Math.random } = {}) {
  const pool = shuffle(
    Array.from({ length: TILES }, (_, i) => i),
    rng,
  );
  const hands = [0, 1, 2, 3].map(() => pool.splice(-RACK_SIZE).sort(byColor));
  return {
    starter,
    turn: starter,
    pool,
    hands,
    table: [], // sets of tile ids, each laid out as arrange() does
    melded: [false, false, false, false], // made their first play (30 or more)
    drew: [null, null, null, null], // the tile each seat drew last, for its owner to spot
    passes: 0, // turns in a row with the pool empty and nothing played
    seq: 0,
    lastAction: null,
    over: null, // { reason: 'out', seat } | { reason: 'blocked' }
  };
}

// ---- what a seat may do right now ---------------------------------------------

export function options(round, seat) {
  const mine = !round.over && round.turn === seat;
  return { play: mine, draw: mine && round.pool.length > 0, pass: mine && !round.pool.length };
}

function checkTurn(round, seat) {
  if (round.over) throw new MoveError('Round is over');
  if (round.turn !== seat) throw new MoveError('Not your turn');
}

function act(round, action) {
  round.seq += 1;
  round.lastAction = { n: round.seq, ...action };
}

function endTurn(round, seat) {
  round.turn = nextSeat(seat);
}

// ---- moves --------------------------------------------------------------------

/** Take a tile from the pool, which ends the turn. With the pool empty it's a pass. */
export function draw(round, seat) {
  checkTurn(round, seat);
  if (!round.pool.length) {
    round.passes += 1;
    act(round, { type: 'pass', seat });
    if (round.passes >= SEATS) round.over = { reason: 'blocked' };
    else endTurn(round, seat);
    return round;
  }
  const tile = round.pool.pop();
  round.hands[seat].push(tile);
  round.drew[seat] = tile;
  act(round, { type: 'draw', seat });
  endTurn(round, seat);
  return round;
}

/**
 * Lay down `sets`, the whole table as it should look after this turn: everything that was
 * on it, plus at least one tile from the rack, every set a group or a run.
 */
export function play(round, seat, sets) {
  checkTurn(round, seat);
  if (!Array.isArray(sets) || !sets.every(Array.isArray)) throw new MoveError('That is not a table');
  const ids = sets.flat();
  if (!ids.every((id) => Number.isInteger(id) && id >= 0 && id < TILES) || new Set(ids).size !== ids.length) {
    throw new MoveError('That is not a table');
  }
  const before = round.table.flat();
  const now = new Set(ids);
  if (!before.every((id) => now.has(id))) throw new MoveError('Every tile on the table has to stay there');
  const was = new Set(before);
  const placed = ids.filter((id) => !was.has(id));
  const rack = new Set(round.hands[seat]);
  if (!placed.every((id) => rack.has(id))) throw new MoveError('You do not have that tile');
  if (!placed.length) throw new MoveError('Play at least one tile from your rack');
  const laid = sets.map(arrange);
  if (laid.some((s) => !s)) throw new MoveError('Every set has to be a group or a run');

  const first = !round.melded[seat];
  if (first) {
    // The table as it was, untouched, plus new sets of your own worth 30 or more.
    const fresh = sets.map(setKey);
    for (const old of round.table) {
      const i = fresh.indexOf(setKey(old));
      if (i === -1) throw new MoveError('Your first play cannot touch the table');
      fresh.splice(i, 1);
    }
    const points = sets.filter((s) => s.every((id) => !was.has(id))).reduce((sum, s) => sum + setPoints(s), 0);
    if (points < FIRST_PLAY) throw new MoveError('Your first play has to add up to 30');
  }

  round.table = laid.map((s) => s.tiles);
  round.hands[seat] = round.hands[seat].filter((id) => !now.has(id));
  round.melded[seat] = true;
  round.drew[seat] = null;
  round.passes = 0;
  act(round, { type: 'play', seat, placed, first });
  if (!round.hands[seat].length) round.over = { reason: 'out', seat };
  else endTurn(round, seat);
  return round;
}

// ---- scoring ------------------------------------------------------------------

/**
 * Going out scores what is left on the other team's two racks. When nobody can go out,
 * the team with less left scores the other team's tiles, and a tie scores nothing.
 */
export function roundScore(round) {
  const held = [0, 1].map((team) => round.hands.reduce((sum, h, s) => sum + (teamOf(s) === team ? rackPoints(h) : 0), 0));
  let winner = null;
  if (round.over?.reason === 'out') winner = teamOf(round.over.seat);
  else if (held[0] !== held[1]) winner = held[0] < held[1] ? 0 : 1;
  const points = [0, 0];
  if (winner != null) points[winner] = held[1 - winner];
  return { held, winner, points };
}

// ---- bot ----------------------------------------------------------------------

const SEARCH_BUDGET = 20000; // steps for picking which sets to lay down from a big rack

/**
 * Every set the rack could make, as tile kinds (color and number) plus how many jokers it
 * needs: groups of 3 or 4, and runs with at least two real tiles.
 */
function candidates(rack) {
  const have = new Set(rack.filter((id) => !isJoker(id)).map(kindOf));
  const jokers = rack.filter(isJoker).length;
  const out = [];
  for (let n = 1; n <= NUMBERS; n++) {
    const colors = [0, 1, 2, 3].filter((c) => have.has(kindId(c, n)));
    // Every choice of 2 to 4 of those colors, topped up with jokers to 3 or 4.
    for (let mask = 1; mask < 1 << colors.length; mask++) {
      const kinds = colors.filter((_, i) => mask & (1 << i)).map((c) => kindId(c, n));
      if (kinds.length < 2) continue;
      for (let size = Math.max(MIN_SET, kinds.length); size <= COLORS; size++) {
        const need = size - kinds.length;
        if (need <= jokers) out.push({ kinds, jokers: need, points: n * size });
      }
    }
  }
  for (let c = 0; c < COLORS; c++) {
    for (let lo = 1; lo <= NUMBERS; lo++) {
      for (let hi = lo + MIN_SET - 1; hi <= NUMBERS; hi++) {
        const kinds = [];
        for (let v = lo; v <= hi; v++) if (have.has(kindId(c, v))) kinds.push(kindId(c, v));
        const need = hi - lo + 1 - kinds.length;
        if (kinds.length >= 2 && need <= jokers) out.push({ kinds, jokers: need, points: ((lo + hi) * (hi - lo + 1)) / 2 });
      }
    }
  }
  return out.sort((a, b) => b.kinds.length + b.jokers - (a.kinds.length + a.jokers));
}

/**
 * The sets to lay down from this rack that use the most tiles (the most points among
 * those), only counting plays worth 30 when it's the `first`. As tile ids, laid out.
 */
export function bestSets(rack, { first = false } = {}) {
  const cands = candidates(rack);
  const count = new Map();
  for (const id of rack) if (!isJoker(id)) count.set(kindOf(id), (count.get(kindOf(id)) ?? 0) + 1);
  let jokers = rack.filter(isJoker).length;
  let best = null;
  let steps = 0;
  const better = (a, b) => !b || a.tiles > b.tiles || (a.tiles === b.tiles && a.points > b.points);
  const search = (from, chosen, tiles, points) => {
    const here = { sets: chosen.slice(), tiles, points };
    if ((!first || points >= FIRST_PLAY) && better(here, best)) best = here;
    for (let i = from; i < cands.length && steps < SEARCH_BUDGET; i++) {
      const c = cands[i];
      if (c.jokers > jokers || !c.kinds.every((k) => count.get(k) > 0)) continue;
      steps++;
      c.kinds.forEach((k) => count.set(k, count.get(k) - 1));
      jokers -= c.jokers;
      chosen.push(c);
      search(i, chosen, tiles + c.kinds.length + c.jokers, points + c.points);
      chosen.pop();
      jokers += c.jokers;
      c.kinds.forEach((k) => count.set(k, count.get(k) + 1));
    }
  };
  search(0, [], 0, 0);
  if (!best?.sets.length) return [];
  // Turn kinds back into the rack's own tiles.
  const left = rack.slice();
  const take = (test) => left.splice(left.findIndex(test), 1)[0];
  return best.sets.map((c) => {
    const ids = [...c.kinds.map((k) => take((id) => !isJoker(id) && kindOf(id) === k)), ...Array.from({ length: c.jokers }, () => take(isJoker))];
    return arrange(ids).tiles;
  });
}

/**
 * Where a tile can go on a set: added to it, or splitting a run in two around it (4-5-6-7-8
 * and another 6 make 4-5-6 and 6-7-8). The sets that replace it, or null.
 */
export function fitTile(set, id) {
  const joined = arrange([...set, id]);
  if (joined) return [joined.tiles];
  const run = arrange(set);
  if (isJoker(id) || run?.kind !== 'run') return null;
  const at = run.values.indexOf(numberOf(id));
  if (at === -1 || run.tiles.some((t) => !isJoker(t) && colorOf(t) !== colorOf(id))) return null;
  const left = arrange(run.tiles.slice(0, at + 1));
  const right = arrange([id, ...run.tiles.slice(at + 1)]);
  return left && right ? [left.tiles, right.tiles] : null;
}

/** Put rack tiles on the table's sets one at a time while any fits. Jokers only to go out. */
function layOff(table, rack) {
  let placed = false;
  for (let again = true; again; ) {
    again = false;
    for (const id of rack.slice()) {
      if (isJoker(id) && rack.length > 1) continue;
      const i = table.findIndex((set) => fitTile(set, id));
      if (i === -1) continue;
      table.splice(i, 1, ...fitTile(table[i], id));
      rack.splice(rack.indexOf(id), 1);
      placed = again = true;
    }
  }
  return placed;
}

/** A tile the table can spare: the end of a run of 4 or more, or any tile of a group of 4. */
function spares(table) {
  const out = [];
  table.forEach((set, i) => {
    if (set.length <= MIN_SET) return;
    const ends = arrange(set).kind === 'run' ? [set[0], set.at(-1)] : set;
    for (const id of ends) if (!isJoker(id) && arrange(set.filter((t) => t !== id))) out.push({ i, id });
  });
  return out;
}

/** Borrow a spare tile from the table to make a new set with two from the rack. */
function borrow(table, rack) {
  const real = rack.filter((id) => !isJoker(id));
  for (const { i, id } of spares(table)) {
    for (let a = 0; a < real.length; a++) {
      for (let b = a + 1; b < real.length; b++) {
        const set = arrange([real[a], real[b], id]);
        if (!set) continue;
        table[i] = arrange(table[i].filter((t) => t !== id)).tiles;
        table.push(set.tiles);
        rack.splice(rack.indexOf(real[a]), 1);
        rack.splice(rack.indexOf(real[b]), 1);
        return true;
      }
    }
  }
  return false;
}

/** The bot only looks at its own rack and the table. */
export function botMove(round, seat) {
  const rack = round.hands[seat].slice();
  if (!round.melded[seat]) {
    const sets = bestSets(rack, { first: true });
    return sets.length ? { type: 'play', table: [...round.table, ...sets] } : { type: 'draw' };
  }
  const table = round.table.map((s) => s.slice());
  for (const set of bestSets(rack)) {
    table.push(set);
    for (const id of set) rack.splice(rack.indexOf(id), 1);
  }
  while (rack.length && (layOff(table, rack) || borrow(table, rack)));
  return rack.length < round.hands[seat].length ? { type: 'play', table } : { type: 'draw' };
}

export function applyMove(round, seat, move) {
  return move.type === 'play' ? play(round, seat, move.table) : draw(round, seat);
}

export const game = {
  id: 'rummikub',
  flag: 'rummikub', // not offered until it's on in PostHog
  targets: [50, 100, 200],
  defaultTarget: 100,
  slowTurnMs: 120_000, // rearranging the table takes a while

  newRound(match, rng) {
    const starter = match.nextStarter ?? Math.floor(rng() * SEATS);
    match.nextStarter = nextSeat(starter);
    return newRound({ starter, rng });
  },

  handle(round, seat, msg) {
    if (msg.t === 'draw') draw(round, seat);
    else if (msg.t === 'play') play(round, seat, msg.table);
    else return false;
    return true;
  },

  settle(match) {
    const r = match.round;
    const score = roundScore(r);
    match.scores = match.scores.map((s, team) => s + score.points[team]);
    match.history.push({ round: match.roundNo, ...score, out: r.over.seat ?? null });
  },

  pendingAuto(match) {
    const r = match.round;
    if (!match.seats[r.turn]?.bot) return null;
    // The round's first move waits for the deal.
    return { delay: BOT_DELAY_MS + (r.seq ? 0 : DEAL_MS), key: `${match.roundNo}:${r.seq}` };
  },

  waitingOn: (match) => ({ seat: match.round.turn, key: `${match.roundNo}:${match.round.seq}` }),

  runAuto(match, rng) {
    const r = match.round;
    const seat = r.turn;
    const move = botMove(r, seat);
    applyMove(r, seat, move);
    if (move.type === 'play' && isManguangua(match.seats[seat]) && rng() < PLAY_PHRASE_CHANCE) r.lastAction.phrase = true;
  },

  roundView(r, seat, revealed) {
    return {
      starter: r.starter,
      turn: r.over ? null : r.turn,
      pool: r.pool.length,
      table: r.table,
      melded: r.melded,
      lastAction: r.lastAction,
      seq: r.seq,
      over: r.over,
      score: r.over ? roundScore(r) : null,
      hand: seat !== -1 ? r.hands[seat] : null,
      newTile: seat !== -1 ? r.drew[seat] : null,
      options: options(r, seat),
      hands: revealed ? r.hands : null,
    };
  },
};
