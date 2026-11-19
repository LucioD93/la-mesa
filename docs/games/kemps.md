# Kemps (kimi)

Kemps is behind the PostHog feature flag `kemps`: a lobby only offers it where the flag is on (see [Feature flags](../../README.md#feature-flags)). Kemps (*kimi* in Spanish) is a party game for partners with secret signals. Rules vary from table to table; this follows [Pagat](https://www.pagat.com/commerce/kemps.html) and [Wikipedia](https://en.wikipedia.org/wiki/Kemps_(card_game)), adapted to a screen. The timings and the bots' habits are constants at the top of `server/games/kemps.js`.

- One 52-card French deck, 4 cards each, 4 face up in the middle, 2 vs 2. The aim is four of a kind.
- **No turns.** Anyone, at any moment, swaps one card from their hand for one in the middle, by dragging it there or tapping one of each. Whoever gets there first takes the card. The cards each player took and still holds show by their seat.
- **A new middle.** *Nothing for me* says you're done with it. Once all four are (bots count as done when no swap helps them), or nobody has swapped for 12 seconds, the middle is discarded and four new cards are laid. An empty deck takes the discards back, twice; after that the hand is dead and nobody scores.
- **Signals.** Each team has a secret signal, one of six gestures (wink, nose, ear, tongue, eyebrow, shrug), shown only to its two players with a ★. Any gesture a player taps shows over their seat for everyone, so the others are for bluffing. Either partner can change the team's signal mid-hand. It carries over to the next hand, starting at random.
- **Kemps!** (*¡Kimi!*): your partner holds four of a kind. Right, your team wins the hand; wrong, the other team does.
- **Stop Kemps!** (*¡Corta!*): name a rival who holds four of a kind. Right, your team wins the hand; wrong, theirs does.
- **Winning.** A hand is worth 1, and the first team to the target (3, 5 or 7) wins.
- **Bots** go for the number they hold most of, make their signal once they have four (and again every few seconds while a human partner misses it), throw in a meaningless gesture now and then, and call Kemps on their partner's signal. They remember the gesture a team gave itself away with (the result shows it to everyone) and cut a rival who makes it again, most of the time. A team of two bots changes a caught signal; a person sees a warning instead.

**Not implemented:** scoring by letters (K-E-M-P-S), real winks, and a dealer deciding when the middle is replaced. The table doesn't mock a slow player, since the middle moves on by itself.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `swap` | `take: [rank, suit]`, `give: [rank, suit]` | Kemps, any time: a card from the middle for one from your hand. Someone else may have taken it first (`That card is gone`). |
| `pass` | | Kemps: nothing in the middle for you. A second one changes nothing. |
| `gesture` | `sign: "wink" \| "nose" \| "ear" \| "tongue" \| "brow" \| "shrug"` | Kemps: shows over your seat for everyone (700 ms apart) |
| `signal` | `sign` | Kemps: your team's new secret signal. Only your partner sees it. |
| `kemps` | | Kemps: your partner holds four of a kind |
| `corta` | `seat` | Kemps: that rival holds four of a kind (Stop Kemps) |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `kemps-three` (the fourth is in the middle), `kemps-four`, `kemps-signal` (the partner just made the signal: call it), `kemps-corta` (a rival just made its signal: cut it before its partner calls, which takes a bot about a second), `kemps-exposed` (the bots know seat 0's signal)

## Files

- `server/games/kemps.js`: Pure Kemps rules, and the bots' and the middle's clock planned from the round, plus the `game` object
- `public/js/kemps.js`: Kemps table: the middle, swapping into it, gestures and your signal, the calls, how a hand reads
- `server/games/kemps.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/kemps.js`: its name, icon, strings and the rules sheet
- `public/css/games/kemps.css`: its colors and table
- `scripts/sim/kemps.js`: the simulator's headless player
- `test/kemps.test.js`: its rules and bots
