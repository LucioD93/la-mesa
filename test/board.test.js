import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/domino.js';
import * as F from '../server/games/fives.js';
import { layoutBoard } from '../public/js/board.js';

const overlap = (a, b) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

// Play out random rounds with bots and check the snake layout never overlaps.
test('board layout never overlaps tiles', () => {
  for (let seed = 0; seed < 300; seed++) {
    let s = seed + 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const r = G.newRound({ starter: seed % 4, rng });
    while (!r.over) {
      const moves = G.legalMoves(r, r.turn);
      const m = moves[Math.floor(rng() * moves.length)];
      if (m) G.play(r, r.turn, m.tile, m.end);
      else G.pass(r, r.turn);
      for (const maxX of [3.5, 5, 6.5, 9, 14]) {
        const rects = layoutBoard(r, maxX);
        assert.equal(rects.length, r.line.length);
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++)
            assert.ok(!overlap(rects[i], rects[j]), `overlap seed ${seed} maxX ${maxX}: ${JSON.stringify([rects[i], rects[j]])}`);
      }
    }
  }
});

// The same for All Fives, where the first double spins: four arms around it, at every
// pair of widths and heights.
test('board layout around a spinner never overlaps tiles', () => {
  let spun = 0;
  for (let seed = 0; seed < 300; seed++) {
    let s = seed + 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const r = F.newRound({ starter: seed % 4, rng });
    while (!r.over) {
      const moves = F.legalMoves(r, r.turn);
      const m = moves[Math.floor(rng() * moves.length)];
      if (m) F.play(r, r.turn, m.tile, m.end);
      else F.pass(r, r.turn);
      for (const maxX of [3.5, 5, 6.5, 9, 14])
        for (const maxY of [3.5, 5, 8]) {
          const rects = layoutBoard(r, maxX, maxY);
          assert.equal(rects.length, r.line.length + r.up.length + r.down.length);
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++)
              assert.ok(!overlap(rects[i], rects[j]), `overlap seed ${seed} ${maxX}x${maxY}: ${JSON.stringify([rects[i], rects[j]])}`);
        }
    }
    if (r.up.length && r.down.length) spun++;
  }
  assert.ok(spun > 30, `only ${spun} rounds used both of the spinner's sides`);
});

test('a spinner lays out as a cross: its other sides above and below it', () => {
  const rects = layoutBoard({ line: [[2, 6], [6, 6], [6, 3]], center: 1, spinner: 1, up: [[6, 4]], down: [[6, 1]] }, 8, 8);
  const at = (a, b) => rects.find((r) => F.sameTile(r.tile, [a, b]));
  const spinner = at(6, 6);
  assert.deepEqual([spinner.x, spinner.y, spinner.w, spinner.h], [-0.5, -1, 1, 2]);
  assert.ok(at(2, 6).x + at(2, 6).w <= spinner.x, 'the left arm is to the left');
  assert.ok(at(6, 3).x >= spinner.x + spinner.w, 'the right arm is to the right');
  const up = at(6, 4);
  const down = at(6, 1);
  assert.deepEqual([up.x, up.y + up.h, up.a, up.b], [-0.5, -1, 4, 6], 'the 6 of the 6-4 touches the spinner from above');
  assert.deepEqual([down.x, down.y, down.a, down.b], [-0.5, 1, 6, 1], 'the 6 of the 6-1 touches it from below');
});
