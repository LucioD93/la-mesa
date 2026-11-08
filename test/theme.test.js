import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match, THEMES, DEFAULT_THEME } from '../server/match.js';
import { createRoom } from '../server/room.js';

test('a new match uses the default theme, and so does one saved before themes', () => {
  assert.equal(new Match('t').theme, DEFAULT_THEME);
  for (const theme of [undefined, 'disco', '__proto__', 7, null]) {
    assert.equal(new Match('t', { theme }).theme, DEFAULT_THEME);
  }
});

test('the theme is picked by anyone in the match, even mid-game, and everyone sees it', () => {
  const m = new Match('t');
  m.join('a', 'A');
  m.join('b', 'B');
  assert.equal(m.handle('a', { t: 'theme', theme: DEFAULT_THEME }, new Set()), false);
  for (const theme of ['disco', '__proto__', ['pencil'], null]) {
    assert.equal(m.handle('a', { t: 'theme', theme }, new Set()), false);
  }
  // A spectator can change it, like the game.
  assert.equal(m.handle('spectator', { t: 'theme', theme: 'pencil' }, new Set()), true);
  for (const who of ['a', 'b', 'spectator']) assert.equal(m.stateFor(who, new Set()).theme, 'pencil');

  // Mid-game too: the style is only how the table looks.
  m.handle('a', { t: 'addBots' }, new Set());
  m.handle('a', { t: 'start' }, new Set());
  assert.equal(m.handle('a', { t: 'theme', theme: 'neon' }, new Set()), true);
  assert.equal(m.stateFor('b', new Set()).theme, 'neon');
});

test('the theme survives a save', () => {
  let saved;
  const host = { load: () => saved, save: (r) => (saved = structuredClone(r)), forget() {}, connections: () => [], wakeAt() {}, report() {} };
  const room = createRoom('t', host);
  room.update((m) => m.join('a', 'A'));
  room.update((m) => m.handle('a', { t: 'theme', theme: 'neon' }, new Set()));
  assert.equal(createRoom('t', host).snapshot().match.theme, 'neon'); // loaded back, as after a sleep
});

test("the first player's theme carries into a new match, but not into one already going", () => {
  assert.ok(THEMES.includes('pencil'));
  const fresh = new Match('t');
  fresh.join('a', 'A', null, 'pencil');
  assert.equal(fresh.theme, 'pencil');

  const going = new Match('t', { v: 3 });
  going.join('b', 'B', null, 'pencil');
  assert.equal(going.theme, DEFAULT_THEME);

  const unknown = new Match('t');
  unknown.join('a', 'A', null, 'disco');
  assert.equal(unknown.theme, DEFAULT_THEME);
});
