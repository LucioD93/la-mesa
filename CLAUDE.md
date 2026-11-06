# La Mesa

README.md describes the project; read it before changing anything.

## Testing a change

Use the tools in README.md's "Testing tools" section rather than playing a match by hand to reach a moment:

- `npm run dev:tools` starts the server with `/api/dev` on. `GET /api/dev` lists the routes and scenarios.
- `curl -X POST localhost:3000/api/dev/match/demo/scenario/<name>` jumps match `demo` to a moment (a flor, a blocked domino, a parchís piece one roll from home…). `PATCH`, `send`, `auto`, `hurry` and `rig` change it from there.
- `/play/demo?as=p0` sits as player `p0` in a tab; scenarios seat `p0`, `p1`… from seat 0.
- `window.__laMesa` in the page's console has the tab's state, what it heard, and `send(msg)`.
- `npm run sim -- <game> --seed <n>` plays whole matches over WebSockets and fails on a refused move or a stall.
- `npm test` runs everything, including every scenario and a sim of each game.

A new game also needs a bot move in `STEP` (server/dev/scenarios.js) and a player in `STRATEGY` (scripts/sim.js).
