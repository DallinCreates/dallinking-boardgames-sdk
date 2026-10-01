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
npm run sandbox -- --no-hot   # turn off hot reload
```

What it does:

1. Unless you pass `-dev`, runs `npm run build:all` if your package has that script, otherwise `npm run build`.
2. Loads your engine: `dist/engine.cjs` normally, or `src/engine/engine.js` with `-dev`, so engine edits apply without rebuilding. Either falls back to the other.
3. Serves your board and player apps on port 4173, and the sandbox page on http://localhost:3000.

The sandbox page shows the board and one iframe per player. The toolbar starts the game (▶), resets everything, switches between **Split**, **Board** and **Player** views, and between fluid, 📱 portrait and 📟 landscape device frames. It also sets the phones' **Network** lag, which screens play **Sound**, and opens the **🔍 State** timeline. Engine `console` output appears in your terminal.

**Game over:** when your engine calls `this.gameOver()`, a results overlay appears after the game's delay. It shows the board's view and what each phone would show ("Ann: 🏆 You won!"), with **This game** and **Tonight** tabs. **Play again** runs your `onPlayAgain()` (or a fresh engine), and **Pick another game** returns to the lobby. Invalid results show a red banner with the reason.

**Leave / Rejoin:** buttons beside the player tabs make the selected player leave the room and come back. They keep their player ID, as on the platform, so you can test `onPlayerLeave` and a returning `onPlayerJoin`.

### Lag, disconnects and rejoins

- **Network** in the toolbar adds latency to every phone: Wi-Fi (40 ms), 4G (120 ms), Slow 3G (400 ms) or Terrible (1.2 s), each with jitter. The select beside the player tabs overrides it for one phone. Messages stay in order, as they do on the platform. The board gets no lag, because in Local hosting it runs the engine. A 🐢 on a tab marks a lagged phone.
- **Disconnect** drops the selected phone's connection, the way a phone locking or losing Wi-Fi does. Your engine gets `onDisconnect`, the other screens see the player's `connected: false`, and messages to the phone are lost. Taps on it still work: they queue, as the platform's bridge queues them. **Reconnect** sends `room:reconnected`, runs `onReconnect`, sends a fresh `game:sync_state`, then delivers the queued actions.
- **Leave** and **Rejoin** (above) cover a player who leaves for good and comes back.

Use them to check that a late or missing phone can't stall your game, that taps sent during a drop don't apply twice, and that every screen recovers from the snapshot.

### State inspector and time travel

**🔍 State** opens the timeline: one entry for everything that changed your engine's state, in order. That includes actions (with who sent them and the payload), joins, leaves, Start, disconnects, reconnects, hot reloads and timer updates. Click an entry, or use ◀ ▶ (or ↑ ↓ in the list), to see `this.state` at that point. The fields that changed are listed (`players.p1.score: 3 → 4`) and highlighted in the tree.

- **Whose view:** switch from `this.state` to what the board (`getBoardState()`) or a given player (`getPlayerState(id)`) would receive at that point. It's a quick way to catch a secret leaking to the wrong phone.
- **⏪ Rewind** puts the engine back to the selected entry: its state, its phase and whether the game had started or ended. Every screen gets a fresh snapshot, and later entries are dropped, so you can replay a tricky moment differently. Timers your engine started aren't rewound. Store deadlines in state, as [checkpoints](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/engine.md#checkpoints-local-hosting) need anyway.
- **Copy** copies the state you're looking at as JSON.
- An action that threw is marked ⚠, with the error. A state that isn't plain JSON says so, and can't be restored.

The timeline keeps the last 500 entries.

### Hot reload

- **With `-dev`:** save a file in `src/` (outside `src/board/` and `src/player/`, which Vite already hot-reloads) and the sandbox loads the new engine **without losing the game**. It builds a new instance, runs `onInit` and an `onPlayerJoin` for each player with their messages discarded, then puts the old `this.state` back and sends every screen a snapshot. That's the same way the platform restores a checkpoint. If the new code doesn't load, a toast shows the error and the previous engine keeps running.
- **Without `-dev`:** run `npm run build` in another terminal. When it finishes, the sandbox swaps in the new `dist/engine.cjs` the same way and reloads the screens.

Only `this.state` carries over. Fields you keep on `this` outside `state`, and running timers, start fresh.

### Sound and vibration

The sandbox plays the platform's part. Each screen gets its own `platform:settings`:

- **Sound** picks which screens are audible: the board plus the player tab you're looking at (the default), every screen, the board only, or none. That way four phones don't play over each other.
- **🔊 Levels** sets the master, music and effects volumes your game receives.
- A phone that vibrates (`haptics`, `notifyTurn`, ...) shakes on screen, and a 📳 toast shows the pattern.

### Player count

`-N` sets the number of players (for example `-3` or `-8`). Without it, the sandbox uses `players.min` from `public/game.config.json` (or `game.config.json` in your project root), or 4. The sandbox doesn't enforce `players` limits, so you can test any count, but it warns when a real room would refuse it.

### How close is it to the real platform?

It matches the platform's room behavior:
- the first player to join is VIP;
- only players (never the board) reach `onPlayerJoin`;
- a refresh runs `onReconnect` and then sends a `game:sync_state` snapshot built from `getBoardState`/`getPlayerState`;
- bare action names get the `game:` prefix, and reserved namespaces are refused;
- a reset calls `destroy()`;
- a disconnect runs `onDisconnect`, and a reconnect runs `onReconnect` and sends a snapshot;
- each screen gets `platform:settings`, and vibration requests are honored.

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
boardgame-devkit sandbox [-N] [-dev] [--no-hot]
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
