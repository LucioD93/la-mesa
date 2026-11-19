# Rummy

Rummy has many versions. This is a partnership game scored like Rummy 500, kept simple: no jokers, and you only ever take the top discard.

- One 52-card French deck, 7 cards each, 2 vs 2. One card starts the discard pile. The player after the dealer goes first, and the deal rotates each round.
- **A turn.** Draw the top card of the deck or of the discard pile. Then meld, lay off, both, or neither, and discard one card. A card just taken from the discard pile can't go straight back.
- **Melds.** A set is 3 or 4 of a rank. A run is 3 or more in a row of one suit. The ace goes low (A-2-3) or high (Q-K-A), but a run doesn't wrap (K-A-2). Melds belong to nobody: anyone can lay off on any of them.
- **End of the round.** Someone runs out of cards (melding, laying off or discarding the last one), or the deck is empty after a discard.
- **Scoring.** 2 to 9 are worth 5, tens and faces 10, aces 15 (1 at the bottom of A-2-3). Each team scores what it melded and laid off, less what is still in both partners' hands, so a round can cost points. First to the target (150 or 300) wins.
- **At the table.** Tap cards to pick them, then Meld, Discard, or tap a meld to lay off on it. Or drag one card onto the discard pile or a meld. Trying a meld or lay-off that isn't legal plays nothing, and the table laughs at you.

**Not implemented:** jokers and wild cards, picking up deeper into the discard pile, and a bonus for going out.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `draw` | `from: "stock" \| "discard"` | Rummy, your turn, before you have drawn |
| `meld` | `cards: [[rank, suit], …]` | Rummy, after drawing. Rank 1 to 13, suit `S`, `H`, `D` or `C`. |
| `layoff` | `card: [rank, suit]`, `meld` (index on the table) | Rummy, after drawing |
| `discard` | `card: [rank, suit]` | Rummy, after drawing. Ends your turn. |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `rummy-take`, `rummy-meld`, `rummy-layoff`, `rummy-out`, `rummy-last-card`

## Files

- `server/games/rummy.js`: Pure rummy rules and bot AI, plus the `game` object
- `public/js/rummy.js`: Rummy table: deck, discard pile, melds, picking cards, how a round reads
- `server/games/rummy.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/rummy.js`: its name, icon, strings and the rules sheet
- `public/css/games/rummy.css`: its colors and table
- `scripts/sim/rummy.js`: the simulator's headless player
- `test/rummy.test.js`: its rules and bots
