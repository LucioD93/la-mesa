# Dominoes

- Double-six set with 7 tiles per player and no boneyard. Seats 0 and 2 play against seats 1 and 3, and turns go 0 → 1 → 2 → 3.
- In the first round, whoever holds the double six must open with it. After that, the opener rotates: the player to the right of the last round's opener opens with any tile, whoever won.
- If you have no legal move, the game passes for you automatically after 3 seconds.
- On your turn you can try any tile, even when none of them fit. Dropping one anywhere on the table where it can't go is not played, and the table mocks you for it: everyone else hears a laugh and sees a 🤡 over your seat.
- **Domino:** the player who empties their hand wins for their team. The team scores the pips left in the losing team's hands.
- **Blocked game:** the team with fewer pips wins and scores the losing team's pips. A tie scores nothing.
- The match ends when a team reaches the target score, which you set in the lobby to 50, 75 or 100.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `play` | `tile: [a, b]`, `end: "L" \| "R"` | On your turn |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `domino-opening`, `domino-last-tile`, `domino-stuck`, `domino-block`

## Files

- `server/games/domino.js`: Pure domino rules and bot AI, plus the `game` object
- `public/js/domino.js`: Domino table: board, hand, drop targets, how a round reads
- `server/games/domino.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/domino.js`: its name, icon, strings and the rules sheet
- `public/css/games/domino.css`: its colors and table
- `scripts/sim/domino.js`: the simulator's headless player
- `test/domino.test.js`: its rules and bots
