# War

War (*guerra*) is usually two players taking the cards they win back into their decks until one holds them all, which can go on for hours. This is a version for two teams that plays through the deck once. The pacing is at the top of `server/games/war.js`.

- One 52-card French deck, 13 cards each, face down, 2 vs 2. Nobody sees their own cards. Aces are high, and suits don't count.
- **A battle.** All four turn up their top card at once: tap your deck, or drag it onto the table. There are no turns. The highest card takes all four for its team, and partners tied on top take it just the same. The cards stay up for a moment, then slide onto that team's pile.
- **¡Guerra!** If the highest card is tied between the teams, the tied players (only them) each lay one card face down and turn up the next, with one tap. The highest new card takes everything on the table; tied again, it's war again. With one card left it goes up without one face down. A player out of cards drops out of the war; if a whole side runs out the other takes it, and if nobody can go on, nobody gets those cards.
- **End of the round.** A player out of cards sits out the battles that are left, and the round ends when every card has been played. The team that took more cards wins the round and scores 1; equal piles score nothing.
- **Winning.** First team to win 1, 3 or 5 rounds, picked in the lobby.
- **At the table.** A battle waits on everyone, so the table mocks a slow player after 15 seconds instead of a minute. Your deck only beeps for a war, where the others wait on you.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `flip` | | War, while `options.flip` is set: turn your top card up (in a war, one face down first) |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `war-war` (seat 0's next card ties a rival's on top), `war-last` (seat 0's last card)

## Files

- `server/games/war.js`: Pure War rules and the bots' pace, plus the `game` object
- `public/js/war.js`: War table: each seat's cards, the piles taken, your deck to tap, how a round reads
- `server/games/war.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/war.js`: its name, icon, strings and the rules sheet
- `public/css/games/war.css`: its colors and table
- `scripts/sim/war.js`: the simulator's headless player
- `test/war.test.js`: its rules and bots
