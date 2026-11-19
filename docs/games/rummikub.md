# Rummikub

Rummikub is behind the PostHog feature flag `rummikub`: a lobby only offers it where the flag is on (see [Feature flags](../../README.md#feature-flags)). Rummikub is played one against one or every player for themselves. This is a version for two teams, scored like the dominoes.

- 106 tiles: 1 to 13 in black, blue, orange and red, twice over, and two jokers. 14 each, 2 vs 2; the other 50 stay face down in the pool. The first player rotates every round.
- **Sets.** A group is 3 or 4 of a number, every one a different color. A run is 3 or more in a row of one color, from 1 up to 13 (no 13-1). A joker takes the place of any tile: in a run it fills a gap first, then goes on the high end, then the low end once the run reaches 13.
- **A turn.** Play tiles from your rack, or draw one from the pool; either ends your turn, and with the pool empty you pass. While you play you can rearrange the whole table: split runs, move tiles between sets, swap a joker out and use it elsewhere. When you're done every tile that was on the table must still be on it, at least one must come from your rack, and every set must be a group or a run.
- **The first play** is new sets of your own tiles adding up to 30 or more (a joker counts as the tile it stands for), without touching the table. A ✓ by a player's avatar means they've made it.
- **End of the round.** Emptying your rack goes out, and your team scores what's left on the other team's two racks: each tile its number, a joker 30. If the pool is empty and all four pass in a row, the team with less left scores what the other team has left, and a tie scores nothing.
- **Winning.** First team to the target (50, 100 or 200).
- **At the table.** Tap tiles, on your rack or the table, to pick them, then tap a set's + or *New set* to move them there, or drag a tile from your rack onto a set. A set that isn't good yet is outlined in red. *Back to rack* takes back tiles you put out this turn, *Undo* puts the table back, and *Done* sends it. Pressing *Done* with a red set or a first play under 30 plays nothing, and the table laughs at you. The others only see your table when you press *Done*.
- **Bots** make their first play as soon as they have 30, then put down every set they can, add tiles to the ends of sets, split runs, and borrow a spare tile from a run of four or more, or a group of four, to make a new set. They hold a joker back for a set of their own unless it's their last tile.

**Not implemented:** a turn timer (the table mocks a player after two minutes instead of one), seeing another player's moves before they press *Done*, and dragging tiles that are already on the table.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `play` | `table: [[tile, …], …]` | Rummikub, your turn: the whole table as it should be after it, every set a list of tile ids (0-103 numbered, color by color, twice over; 104 and 105 the jokers) in any order. The server lays each set out. |
| `draw` | | Rummikub, your turn: take a tile from the pool, or pass when it's empty |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `rummikub-first` (a first play worth 30 on the rack), `rummikub-layoff`, `rummikub-split` (a tile that splits a run), `rummikub-joker`, `rummikub-out`, `rummikub-empty-pool`

## Files

- `server/games/rummikub.js`: Pure Rummikub rules and bot AI, plus the `game` object
- `public/js/rummikub.js`: Rummikub table: the pool, the sets, building the next table on your turn, how a round reads
- `server/games/rummikub.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/rummikub.js`: its name, icon, strings and the rules sheet
- `public/css/games/rummikub.css`: its colors and table
- `scripts/sim/rummikub.js`: the simulator's headless player
- `test/rummikub.test.js`: its rules and bots
