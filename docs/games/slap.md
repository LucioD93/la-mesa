# Irish Snap (manotazo)

The slap game: Irish Snap in English, manotazo in Spanish. Every table plays it a little differently, so this is how it's played here. The choices are constants at the top of `server/games/slap.js`.

- **Every player for themselves.** The four seats play alone, with no teams, so a match keeps a score per seat (the game sets `solo`). The round winner scores 1, and the first to win 1, 3 or 5 rounds, picked in the lobby, wins the match. The lobby hides team names and the seats' team tags, and the result and score sheet list all four players.
- **The deal.** The 40-card Spanish deck, dealt face down one at a time from the starter, 10 each. Nobody ever sees a face-down card, their own included. The starter rotates every round.
- **The count.** Turns go round the table. On your turn you tap your pile and its top card goes face up onto the stack in the middle, blind, as the next number is called: 1 to 7, then sota (10), caballo (11) and rey (12), then 1 again (`COUNT`). The table shows the number called for the top card.
- **Slap.** When the card is the number just called, everyone slaps the stack: tap it, tap the Slap button, or press space. The last hand down takes the whole stack, turns it over and puts it under their pile, and the count starts again from 1 with whoever was next after the player who flipped, as if nobody had slapped. Snap's rule, where a card matching the one under it also calls for a slap, is off (`SNAP`).
- **False slaps.** Slapping a card that isn't the number called takes the stack the same way, the table laughs at you, and the count starts again from the player after whoever flipped. A slap names the card it was meant for, so one that reaches the server after the next card was flipped, or after the stack was taken, is dropped ("too late") and never counts as a false slap.
- **Who's last.** The server keeps the slaps in the order they reach it. The window is 3 seconds (`SLAP_MS`), shown as a bar. Once three hands are down the fourth is last whatever it does, so the stack goes to it at once. When time runs out, whoever never slapped is last. If two or three never slapped, it goes to the first of them in turn order, starting from whoever flipped.
- **Fair to bots and phones.** A bot slaps on its own clock: after the card has shown on everyone's screen (`FLIP_MS`, the client's 380 ms flip plus the state's trip to the phone), plus a round trip on an ordinary connection (`NET_MS`, 250 ms), plus a reaction drawn between 350 and 1,100 ms (`BOT_REACT_MS`). One time in ten it looks away for 1.2 s more. So a player on a normal connection races the bots on reflexes, not on distance to the server. Between phones it's arrival order: a slower connection is a slower hand. The client sends the slap as the finger touches down, not on release. A bot slaps a card that doesn't match one time in a hundred (`BOT_FOOLED_CHANCE`). A bot flips 1.1 s after the previous card, and waits for the deal, or for a taken stack to slide away, first.
- **Running out.** With no cards left you're out and your turns are skipped, but you still have to slap the next match (`SLAP_TO_WIN`). Get a hand on it, without being last, and you win the round. Be last, or slap a wrong card, and you pick up the stack and you're back in. If two players are out at that slap and both get a hand down, the first hand down wins. Turning `SLAP_TO_WIN` off makes running out win on the spot.
- **No match left.** If every card goes onto the stack without a match since it was last taken, nobody can flip, and whoever ran out first wins the round. That ends about 7% of rounds when bots play every seat.
- **Pace.** A round is about 45 flips, which is under a minute with bots in every seat. A player who takes 20 seconds to flip gets mocked.

**Not implemented:** burning a card as the penalty for a false slap instead of taking the stack, a voice calling the count aloud, and a team version.

## Messages

What a player sends for this game, besides the messages every game shares (see [WebSocket protocol](../../README.md#websocket-protocol)).

| Client → server | Payload | When |
| --- | --- | --- |
| `flip` | `n` (the round's `seq` you saw) | Irish Snap, while `options.flip` is set: your top card onto the stack. A flip sent from an older moment is refused as too late, so a double tap flips one card. |
| `slap` | `n` (the `flip.n` of the card on top) | Irish Snap, any time there's a card on the stack: a hand on a match joins `window.slaps` in arrival order; on any other card it's a false slap and takes the stack. A slap for a card that's gone is refused as too late. |

## Scenarios

For the [testing tools](../../README.md#testing-tools): `slap-match` (seat 0's next card is the number about to be called), `slap-last-card` (the same, with its last card), `slap-out` (seat 0 is out and a bot is about to flip a match), `slap-big-stack` (12 or more on the stack, to try a false slap). A slap window only lasts 3 seconds, so slap from the page, or with `send`, right after the flip.

## Files

- `server/games/slap.js`: Pure Irish Snap (manotazo) rules and the bots' timing, plus the `game` object
- `public/js/slap.js`: Irish Snap table: the stack, the number called, your face-down pile, the hands landing on a match
- `server/games/slap.dev.js`: how a bot plays any seat, the scenarios above and what each one promises
- `public/js/games/slap.js`: its name, icon, strings and the rules sheet
- `public/css/games/slap.css`: its colors and table
- `scripts/sim/slap.js`: the simulator's headless player
- `test/slap.test.js`: its rules and bots
