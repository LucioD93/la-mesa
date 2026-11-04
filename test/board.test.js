import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/games/domino.js';
import { layoutLine } from '../public/js/board.js';

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
        const rects = layoutLine(r.line, r.center, maxX);
        assert.equal(rects.length, r.line.length);
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++)
            assert.ok(!overlap(rects[i], rects[j]), `overlap seed ${seed} maxX ${maxX}: ${JSON.stringify([rects[i], rects[j]])}`);
      }
    }
  }
});
