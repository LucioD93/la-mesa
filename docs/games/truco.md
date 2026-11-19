# Truco

Truco has many house rules, and written sources disagree on some details. This is what the game implements.

**Deal.** A 40-card Spanish deck (no 8s or 9s). Everyone gets 3 cards and one more is turned up as the **vira**. Seats 0 and 2 play against seats 1 and 3, and turns go 0 → 1 → 2 → 3 (counter-clockwise). The **mano** leads the first trick, wins ties, and moves one seat each hand.

**Cards, best to worst:**

1. **Perico:** the 11 of the vira's suit
2. **Perica:** the 10 of the vira's suit
3. 1 of espadas, 1 of bastos, 7 of espadas, 7 of oros
4. The 3s, the 2s, then the 1s of copas and oros
5. The 12s, 11s and 10s, then the 7s of copas and bastos
6. The 6s, 5s and 4s

If the vira is itself the 11 or the 10, the **12 of that suit** takes its place as perico or perica.

**Tricks.** The team that takes two of three tricks wins the hand. A tied trick (*parda*) is led again by whoever led it:

- First trick tied: the second trick decides.
- One team won the first trick and a later trick ties: that team wins.
- All three tied: the mano's team wins.

**Truco.** A hand is worth 1. On your turn you can raise it, and the other team answers *quiero*, *no quiero*, or raises straight back. After a raise is accepted, only the team that accepted it can raise next.

| Call | If accepted | If refused |
| --- | --- | --- |
| Truco | 3 | 1 |
| Retruco | 6 | 3 |
| Vale nueve | 9 | 6 |
| Vale juego | the match | 9 |

On your turn you can also go **al mazo**: your team folds and the other team scores the hand's current value.

**Envido.** Called before your first card, on your turn or in reply to a truco (the truco then waits for the envido to be settled). It's worth 2. The other team can accept, refuse, or raise with *y envido* (+2), *cinco más* (+5) or *falta envido* (what the leading team needs to reach the target). A first envido refused pays 1, and a refused raise pays what had been bet before it.

Hand values: perico 30 and perica 29, plus the best other card. Otherwise, two cards of a suit are 20 plus their numbers (10, 11 and 12 count 0), or the highest single card if no suit repeats. The highest value on either team wins, and ties go to the seat closest to the mano.

**Flor.** Three cards of a suit, or the perico or perica with two cards of a suit. You sing it before your first card, on your turn or when answering a bet, and it's worth 3. Singing a flor cancels the envido. If you play your first card without singing it, the flor is lost and the table laughs at you. If both teams sing, the higher flor scores (20 plus the numbers, or the piece plus the numbers).

**Flor reservada.** Perico and perica in the same hand is worth 5 and doesn't need to be sung.

**Scoring.** Points are added when the hand ends: flor, then envido, then truco. Nothing more is added once a team reaches the target, which you set in the lobby to 12, 24 or 32.

**Not implemented:** *con flor envido* and *contraflor* (the bets between two flores), *a ley*, *privar*, burning a card face-down, and partner signals (*señas*). A team scores one flor per hand even if both partners hold one.

Rules are based on [Wikipedia ES](https://es.wikipedia.org/wiki/Truco_venezolano), [Ludoteka](https://www.ludoteka.com/games/truco-venezolano/rules) and [Conecta Games](https://conectagamesblog.wordpress.com/2015/12/18/reglas-del-truco-venezolano/).

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `play` | `card: [number, suit]` | On your turn |
| `call` | `what: "flor" \| "envido" \| "cinco" \| "falta" \| "truco" \| "mazo"` | Truco, when the `options` in your state allow it |
| `answer` | `yes: boolean` | Truco, a bet is open against your team |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `truco-flor`, `truco-reservada`, `truco-envido`, `truco-answer`

## Files

- `server/games/truco.js`: Pure truco rules and bot AI, plus the `game` object
- `public/js/truco.js`: Truco table: vira, trick, call buttons, how a hand reads
- `server/games/truco.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/truco.js`: its name, icon, strings and the rules sheet
- `public/css/games/truco.css`: its colors and table
- `scripts/sim/truco.js`: the simulator's headless player
- `test/truco.test.js`: its rules and bots
