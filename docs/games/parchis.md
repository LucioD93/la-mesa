# Parchís

Parchís in pairs on 68 squares, with one die or two, picked in the lobby. One die follows the classic Spanish rules in [Wikipedia ES](https://es.wikipedia.org/wiki/Parch%C3%ADs). Two dice follows the Superparchís rules at [Mundijuegos Venezuela](https://www.mundijuegos.com.ve/multijugador/parchis/reglas/) and is the default. We found no rulebook specific to Venezuela. Tables differ on several details, and the values that vary most are constants at the top of `server/games/parchis.js`.

- 2 vs 2, partners across: yellow with red, blue with green. Your nest is always drawn at the bottom left.
- **The route.** 63 squares from your start to your entry, then 7 of your own corridor, then the goal, which needs the exact count.
- **The die.** A 5 has to bring a piece out if one can come out. A 6 rolls again, and moves 7 with nothing in your nest. A third 6 in a row ends the turn and sends the last piece moved to its nest, unless it's in its corridor.
- **Two dice.** Each die is used separately, on one piece or two, in the order you pick. Dice adding up to 5 bring a piece out between them, and a double 5 brings out two. A double rolls again, a third double in a row is punished like a third 6, and a 6 is just a 6. A double has to open your barrier if it can, which we carried over from the 6.
- **Captures.** Landing on a lone rival sends it home and pays 20, counted with one piece. Safe squares and start squares protect, and partners never take each other. Coming out onto a full start square takes the rival that got there last.
- **Barriers.** Two pieces of one color stop everyone, their owner included, and a 6 has to open yours if it can. A square holds two pieces at most.
- **The goal.** Reaching it pays 10. A bonus no piece can use is lost. With your four pieces home, your rolls move your partner's.
- **Winning.** The first pair with all eight pieces home wins the game, and you pick 1, 2 or 3 games in the lobby.

**House rules that differ from that article:** barriers stop everyone on any square (it only applies that to start squares), a 5 always has to come out, and taking a piece as you come out also pays 20. It's 4 players in teams only.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `roll` | | Parchís, when `options.roll` is set |
| `move` | `color`, `piece`, `steps?` | Parchís, one of `options.moves`. `steps` picks which die or bonus to use. |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `parchis-home`, `parchis-capture`, `parchis-leave`. Each rigs seat 0's next roll.

## Files

- `server/games/parchis.js`: Pure parchís rules and bot AI, plus the `game` object
- `public/js/parchis.js`: Parchís table: the board, hopping pieces, the die, how a game reads
- `server/games/parchis.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/parchis.js`: its name, icon, strings and the rules sheet
- `public/css/games/parchis.css`: its colors and table
- `scripts/sim/parchis.js`: the simulator's headless player
- `test/parchis.test.js`: its rules and bots
