# Caída

Caída changes from table to table, and we found no authoritative rulebook. This follows what most Venezuelan write-ups agree on: [Aprende a jugar Caída](http://aprendeajugarcaida.blogspot.com/2015/03/caida-un-juego-de-azar-y-habilidad.html), [Play Caída](https://playcaida.com/), [O Candil Sen Luz](https://ocandilsenluz.blogspot.com/2020/07/caida-juego-de-cartas-de-venezuela.html) and two guides on Steemit ([joriangel](https://steemit.com/spanish/@joriangel/juego-de-cartas-caida-explicado-venezuela), [ezefitmusic](https://steemit.com/cervantes/@ezefitmusic/caidas-el-juego-preferido-de-ingenieria-guia-para-aprender-a-jugar)). The values that vary most are constants at the top of `server/games/caida.js`.

- 40-card Spanish deck, 2 vs 2. A round is the table, then three deals of 3 cards each, which uses the whole deck.
- **The table.** The dealer calls the count, 1 → 4 or 4 → 1, and lays 4 cards. A card on its own number scores that number. With none, it's a *mala echada* and the other team gets +1. A repeated number goes back in the deck and another card is laid.
- **Cantos.** Sung on your turn, before your first card of each deal. Ronda (a pair and a card not next to it) pays 1 for 1 to 7, 2 for 10s, 3 for 11s, 4 for 12s. Trivilín (three of a kind) pays 5, patrulla (three in a row) 6, vigía (a pair and the number next to it) 7, and registro (1, 11, 12) 8. As in captures, the 7 is next to the 10, and the 12 isn't next to the 1. Once everyone has played from the deal, only the best canto at the table pays: more points, then higher cards (a ronda's pair, then its third card), then whoever sits closer to the dealer's right.
- **Captures.** A card takes the same number from the table and any cards that follow it in sequence, automatically. With no match it stays on the table.
- **Caída.** Taking the card the player before you just played pays 1 for 1 to 7, 2 for a 10, 3 for an 11, 4 for a 12.
- **Mesa limpia.** Taking every card on the table pays 4, on top of any caída, except in the last deal.
- **End of the round.** The last team to capture takes what's left, and the team with more cards scores 1 for each card above 20.
- **Winning.** Points land as they happen, and the first team to the target (12 or 24) wins on the spot.

**Not implemented:** the rarer cantos (registrico, casa chica, casa grande), a trivilín that wins the game, a caída that kills the rival's canto, bluffing a canto, and *soplo* (there is nothing to claim, because captures are automatic). It's 4 players in teams only.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `play` | `card: [number, suit]` | On your turn |
| `call` | `what: "canto"` | Caída, when `options.canto` is set |
| `order` | `dir: 1 \| -1` | Caída, you are dealing and the table is not laid yet |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `caida-ronda` (`kind`: `ronda`, `trivilin`, `patrulla`, `vigia` or `registro`), `caida-caida`, `caida-mesa-limpia`

## Files

- `server/games/caida.js`: Pure caída rules and bot AI, plus the `game` object
- `public/js/caida.js`: Caída table: loose cards, the dealer's count, captures, how a round reads
- `server/games/caida.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/caida.js`: its name, icon, strings and the rules sheet
- `public/css/games/caida.css`: its colors and table
- `scripts/sim/caida.js`: the simulator's headless player
- `test/caida.test.js`: its rules and bots
