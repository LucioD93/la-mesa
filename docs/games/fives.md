# All Fives

All Fives (also *Muggins*) is the domino game above, scored as you play. The deal, the opener, the forced pass and the laughing are the same.

- **Points on the ends.** After each tile, add up the open ends. If the sum is a multiple of 5, the player's team scores it. A double on an end counts both halves, and the opening tile counts its pips: the 5-5 or the 6-4 opens for 10.
- **The spinner.** The first double played, whether it opens or comes later, is the spinner. Once tiles are on both of its long sides, tiles can go on its other two sides as well, so the table can have four ends. While one of those sides is empty it doesn't count, and once both long sides are taken the spinner itself no longer counts.
- **Going out** scores the pips left in the other team's hands, rounded to the nearest 5 (7 is 5, 8 is 10), on top of what the ends scored.
- **Blocked game:** the team with fewer pips scores the other team's pips, rounded the same way. A tie adds nothing.
- **Winning.** Points land as they happen, and the first team to the target (100, 150 or 250) wins on the spot, even mid-round.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `play` | `tile: [a, b]`, `end: "L" \| "R" \| "U" \| "D"` (`"U"` and `"D"` are the spinner's other sides) | On your turn |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `fives-score` (a tile that makes the ends 15 or more), `fives-spinner` (a tile for the spinner's other sides), `fives-out`

## Files

- `server/games/fives.js`: All Fives: the domino rules with a spinner and points on the ends, and a bot that goes for them
- `public/js/fives.js`: All Fives table: the domino table, plus what the ends add up to and the points as they land
- `server/games/fives.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/fives.js`: its name, icon, strings and the rules sheet
- `public/css/games/fives.css`: its colors and table
- `scripts/sim/fives.js`: the simulator's headless player
- `test/fives.test.js`: its rules and bots
