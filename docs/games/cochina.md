# Roba la cochina

Roba la cochina (also *roba montón*, *steal the pile*) is a children's capture game played all over Latin America, with a different rule at every table. This is a common version adapted to teams. The grab window, the bots' pace and the targets are at the top of `server/games/cochina.js`.

- 40-card Spanish deck, 2 vs 2. Partners share one pile, the **cochina**, kept face up so its top card shows.
- **The deal.** 4 cards face up on the table, then three deals of 3 cards each, which uses the whole deck. The player after the dealer starts, and the dealer rotates each round.
- **Playing.** Play one card; only its number counts. With no match it stays on the table and the turn moves on.
- **Grabbing.** A card that matches something opens a 3-second window, shown as a bar, and what you can grab glows. Tap each card of that number on the table to take it onto your cochina; your card goes on top with the first one. Nothing is taken for you: what you don't grab in time stays, and if you grabbed nothing your card stays on the table too. Tapping the wrong thing gets you laughed at.
- **Stealing.** If your card matches the top card of the other team's cochina, tap to steal that card. The next card is exposed; keep tapping while its number matches to steal more. The same card can take from the table too.
- **Runs (escalera).** Once every card of your number is taken, from the table and their cochina, the window moves on to the next number: play a 4, grab the 4s, then the 5s, then the 6s, until a number is missing. As in caída, the 7 is followed by the 10, and the 12 ends it. The window stays 3 seconds for the whole run.
- **Bots** grab one thing at a time, the cochina first, and fit four grabs in the window. One time in ten they look away and miss the rest.
- **End of the round.** The last capture takes what's left on the table, slipped under the cochina. The team with more cards wins the round and scores 1, and equal cochinas score nothing.
- **Winning.** First team to win 1, 3 or 5 rounds, picked in the lobby.

**Not implemented:** stacking a card onto your own cochina when it matches your top card, and individual piles for 2 or 3 players.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `play` | `card: [number, suit]` | On your turn |
| `grab` | `card: [number, suit]` or `pile: true` | Roba la cochina, while `options.grab` is set: a table card of the number the window is on (`round.grab.num`: the one you played, then the next ones of a run), or the rivals' cochina |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `cochina-steal`, `cochina-steal-run` (three of a number on the rivals' cochina), `cochina-run` (the same, then the next two numbers on the table), `cochina-grab`

## Files

- `server/games/cochina.js`: Pure roba la cochina rules and bot AI, plus the `game` object
- `public/js/cochina.js`: Roba la cochina table: loose cards, both cochinas, steals, how a round reads
- `server/games/cochina.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/cochina.js`: its name, icon, strings and the rules sheet
- `public/css/games/cochina.css`: its colors and table
- `scripts/sim/cochina.js`: the simulator's headless player
- `test/cochina.test.js`: its rules and bots
