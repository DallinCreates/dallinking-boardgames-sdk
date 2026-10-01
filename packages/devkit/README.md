# @dallincreates/boardgame-devkit

Local tools for [boardgames.dallinking.com](https://boardgames.dallinking.com) games:

- **`sandbox`**: play your game with a board and several players on one page, without deploying or grabbing a stack of phones.
- **`validate`**: the pre-upload check: config, player counts, cover image and engine hooks.
- **`stamp`**: validate the built config and record the SDK version in it, as part of `npm run build`.
- **A JSON Schema** for `game.config.json`, for editor autocomplete.

## Installation

```bash
npm install --save-dev @dallincreates/boardgame-devkit
```

Projects made with `create-dallinking-boardgame` already include it, with these scripts:

```json
"sandbox": "boardgame-devkit sandbox",
"sandbox:dev": "boardgame-devkit sandbox -dev",
"validate": "boardgame-devkit validate",
"build:config": "boardgame-devkit stamp"
```

## Running the sandbox

Run it from your game's root folder:

```bash
npm run sandbox            # production build, then the sandbox
npm run sandbox -- -6      # with 6 players
npm run sandbox:dev        # skip the build (uses the Vite dev server and src/engine/engine.js)
```

What it does:

1. Unless you pass `-dev`, runs `npm run build:all` if your package has that script, otherwise `npm run build`.
2. Loads your engine: `dist/engine.cjs` normally, or `src/engine/engine.js` with `-dev`, so engine edits apply without rebuilding. Either falls back to the other.
3. Serves your board and player apps on port 4173, and the sandbox page on http://localhost:3000.

The sandbox page shows the board and one iframe per player. The toolbar starts the game (▶), resets everything, switches between **Split**, **Board** and **Player** views, and between fluid, 📱 portrait and 📟 landscape device frames. Engine `console` output appears in your terminal.

**Game over:** when your engine calls `this.gameOver()`, a results overlay appears after the game's delay. It shows the board's view and what each phone would show ("Ann: 🏆 You won!"), with **This game** and **Tonight** tabs. **Play again** runs your `onPlayAgain()` (or a fresh engine), and **Pick another game** returns to the lobby. Invalid results show a red banner with the reason.

**Leave / Rejoin:** buttons beside the player tabs make the selected player leave the room and come back. They keep their player ID, as on the platform, so you can test `onPlayerLeave` and a returning `onPlayerJoin`.

### Player count

`-N` sets the number of players (for example `-3` or `-8`). Without it, the sandbox uses `players.min` from `public/game.config.json` (or `game.config.json` in your project root), or 4. The sandbox doesn't enforce `players` limits, so you can test any count, but it warns when a real room would refuse it.

### How close is it to the real platform?

It matches the platform's room behavior:
- the first player to join is VIP;
- only players (never the board) reach `onPlayerJoin`;
- a refresh runs `onReconnect` and then sends a `game:sync_state` snapshot built from `getBoardState`/`getPlayerState`;
- bare action names get the `game:` prefix, and reserved namespaces are refused;
- a reset calls `destroy()`.

It doesn't reproduce:
- **The Cloud runtime:** your engine runs in plain Node, without the isolate's limits or `fetch` allowlist.
- **Player limits:** they aren't enforced.
- **Peer-to-peer hosting and its checkpoints.**
- **The full room:** the `room` object is smaller. See [Messages → The room object](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/messages.md#the-room-object).

## Validating before upload

```bash
npm run validate                        # your sources: public/ and src/engine/engine.js
npx boardgame-devkit validate --dist    # the built release: dist/ and dist/engine.cjs
```

It prints a checklist and exits with code 1 if anything must be fixed:

```
✅ Config   public/game.config.json: My Game 1.0.0
⚠️  Config   No "subtitle". Catalog cards and search results will have no description.
✅ Players  2–8 players
✅ Cover    cover.png 1200×1800, 412 KB
✅ Engine   src/engine/engine.js implements all 6 required hooks
✅ Engine   Starts a game with 2 players

Ready to upload, with 1 warning worth a look.
```

| Area | ❌ Error (blocks) | ⚠️ Warning |
|---|---|---|
| **Config** | Any rule the Developer page enforces on upload, with the same message. That includes gallery images missing from the release. | No `subtitle` |
| **Players** | Invalid `players` (part of the config rules) | No `players`, or no `min` / `max` |
| **Cover** | No `cover.png`, or it isn't really a PNG | Short side under 600px; not 2:3 portrait; over 2 MB |
| **Engine** | Doesn't load; no default-exported class; missing a required hook; `onPlayAgain` isn't a method; a hook throws while starting a game; `this.state` isn't plain JSON | Never calls `this.gameOver()` (searched in `src/engine/`); doesn't inherit `sdkVersion` (old SDK, or doesn't extend `BaseGameEngine`); `hasStarted` false after `onGameStart`; sends non-`game:` messages |

**The engine check** confirms these hooks exist: `onInit`, `onPlayerJoin`, `onPlayerLeave`, `processAction`, `onReconnect` and `onDisconnect`. JavaScript doesn't enforce `BaseGameEngine`'s abstract methods, so a missing one would otherwise only show up when a room calls it. It then plays the start of a game the way a room does: `onInit()`, one `onPlayerJoin` per `players.min` (at least 2), then `onGameStart()`. After each step it checks that `this.state` is plain JSON, and names the first bad value (`state.seen: Map`). Your engine's code really runs, so its `console` output appears too.

`npm run build` doesn't run the cover and engine checks; it only enforces the config rules (see `stamp` below). Run `validate` before you upload.

## Stamping the release config

```bash
boardgame-devkit stamp
```

Run it after the UI build and before zipping; scaffolded projects do this in `npm run build`. It:

1. Validates `dist/game.config.json`, including that gallery images are in `dist/`. Any error stops the build.
2. Writes `sdkVersion`: the version of `@dallincreates/boardgame-server` installed in your project.
3. Removes `$schema`, which only matters to editors.

It never changes `public/game.config.json`. See [sdkVersion](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/game-config.md#sdkversion).

## Editor autocomplete

The package ships `schema/game.config.schema.json`. Point your config at it:

```json
{
  "$schema": "../node_modules/@dallincreates/boardgame-devkit/schema/game.config.schema.json",
  "id": "my-game"
}
```

The path is relative to `public/game.config.json`. Scaffolded projects already have it.

## CLI

```
boardgame-devkit sandbox [-N] [-dev]
boardgame-devkit validate [--dist]     # exits 1 on errors
boardgame-devkit stamp
boardgame-devkit --help
boardgame-devkit --version
```

## Programmatic use

```js
import { runSandbox, stampReleaseConfig, checkRelease, validateProjectConfig, validateGameConfig } from '@dallincreates/boardgame-devkit';

await runSandbox({ cwd: process.cwd(), argv: ['-4', '-dev'] });

const { ok, results } = await checkRelease({ cwd: process.cwd() });         // the full validate checklist
const { config, warnings } = validateProjectConfig({ cwd: process.cwd() });   // config rules only; throws on the first error
const { sdkVersion } = stampReleaseConfig({ cwd: process.cwd() });

validateGameConfig({ id: 'my-game', version: '1.0' });
// -> '"version" is required and must be semver, like "1.0.0".'
```

## License

MIT
