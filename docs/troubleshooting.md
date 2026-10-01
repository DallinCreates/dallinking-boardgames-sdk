# Troubleshooting

Find your symptom, then follow the fix.

## Creating and installing

**`npm create` says the folder already exists and isn't empty.**
The scaffolder never overwrites files. Pick a new folder name, or empty the folder.

**`npm install` fails with 401 or 404 for `@dallincreates/...`.**
Your npm is probably configured to fetch the `@dallincreates` scope from GitHub Packages (a line like `@dallincreates:registry=https://npm.pkg.github.com` in `~/.npmrc` or the project's `.npmrc`). The packages are public on npmjs.com, so remove that line, or add this to the project's `.npmrc`:

```
@dallincreates:registry=https://registry.npmjs.org/
```

**`boardgame-devkit: command not found` / `'boardgame-devkit' is not recognized`.**
Dependencies aren't installed. Run `npm install` in the project folder.

## Sandbox

**The sandbox page is blank or says it can't connect.**
Something else is using port 3000 or 4173. Stop the other process (often an old sandbox) and run it again.

**My code changes don't show up.**
`npm run sandbox` plays your last *build*. Use `npm run sandbox:dev` while iterating, or rebuild.

**Warning: "N players is outside players min–max".**
You asked for a count your `game.config.json` doesn't allow. The sandbox runs anyway so you can test edge cases, but a real room won't start.

## Building and uploading

**`npm run build` fails at `build:engine` with "Could not resolve 'fs'" (or `path`, `crypto`...).**
Your engine, or something it imports, uses a Node API. Engines run in a browser worker or a sandbox, not Node. Remove the import or find a browser-compatible library. See [runtime rules](./engine.md#runtime-rules).

**`npm run validate` reports a missing hook, or "this.state isn't plain JSON".**
Every engine must implement `onInit`, `onPlayerJoin`, `onPlayerLeave`, `processAction`, `onReconnect` and `onDisconnect`, even if some just call `this.sync()`. For state errors, the message names the bad value (`state.seen: Map`). Replace it with a plain object or array, and store dates as `Date.now()` numbers.

**`npm run validate` says cover.png isn't a PNG.**
It has to be a real PNG file, not a JPEG renamed to `.png`. Re-export it as PNG from your image editor.

**`npm run build` or `npm run validate` reports a config error.**
The message names the field and the fix. Every error is listed in [game.config.json → What's not allowed](./game-config.md#whats-not-allowed).

**The Developer page says the version is already published and locked.**
Bump `version` in `public/game.config.json` and build again. Published versions can't change.

**The Developer page says my zip is for a different game ID.**
`id` in `public/game.config.json` must match the game you picked on the Developer page.

## In a room

**Start is disabled: "Needs 3–8 players (you have 2)".**
Your `players` limits are working. Get more players, or change `players` in `game.config.json` and release a new version.

**"This room is full (8 players max)".**
The room reached `players.max` for the selected game.

**The board shows "Loading the game…" forever.**
Your engine never broadcast state. Make sure `onGameStart` (or `onInit`/`onPlayerJoin`) ends with a broadcast of `game:sync_state`, and that your apps handle that type.

**Players see a stale screen after their phone wakes up.**
Your apps must handle `game:sync_state` by *replacing* state, because that's what the platform sends on reconnect. If you broadcast another type for updates, make sure your apps also handle `game:sync_state`. See [Messages](./messages.md#gamesync_state-the-convention).

**"The game stopped responding. End the game to pick it again."**
In Cloud hosting, your engine broke a [runtime limit](./engine.md#runtime-rules): a hook took over 1 second, used more than 3 seconds of CPU in 10 seconds, or exceeded 192 MB. Look for loops over large data, big setup done on every action, or timers that pile up.

**An action does nothing.**
Check, in order:
1. The type starts with `game:` (or is a bare name). `room:`, `system:`, `connection:` and `webrtc:` types are refused.
2. Your `processAction` has a `case` for it. Unhandled types fall through to `default`.
3. Your engine's checks pass: phase, whose turn, `meta.isVip` and so on. Add a `console.warn` to see which one fails. In the sandbox, engine logs appear in your terminal.

**The results screen never appears.**
Check the console where your engine runs (the terminal for the sandbox) for `gameOver() ignored: …`. The message names the problem:
- it was called before `onGameStart`;
- it was already called this game;
- the results were invalid, such as a value that isn't a score or `'WON'`/`'LOST'`/`'TIE'`, or a mix of outcomes and bare scores;
- the platform is older than SDK 1.2.

Also check that the results name seated players; IDs that aren't seated are ignored.

**Play again starts the game over from scratch (the apps reload).**
Your engine has no `onPlayAgain()`, so the platform starts a fresh engine. Add `onPlayAgain()` to restart in place and keep what you want across rounds. See [Play again](./engine.md#play-again).

**A returning player shows up twice, or with a score of 0.**
Players who leave and rejoin keep their ID. If your `onPlayerLeave` deletes them and `onPlayerJoin` creates them fresh, they lose their data; if `onPlayerJoin` always appends, they appear twice. Look the ID up first. The starter engine shows how.

**The game resets when the host's tab reloads.**
In Local hosting, recovery uses the last broadcast `game:sync_state` as a checkpoint. If you broadcast state under another type, nothing is saved. See [Checkpoints](./engine.md#checkpoints-local-hosting).

**A player can see other players' secrets.**
Anything you broadcast reaches every phone, and anyone can open their browser's dev tools. Send secrets with `sendMessageToPlayer`, and filter them out in `getPlayerState`. See [State](./engine.md#state).

**`localStorage` throws "SecurityError" or "Access denied".**
Game iframes are sandboxed without storage. Keep anything that needs remembering in the engine's state. See [What the iframe allows](./apps.md#what-the-iframe-allows).

## Still stuck?

Open an issue at https://github.com/DallinCreates/dallinking-boardgames-sdk/issues with what you did, what you expected, and what happened, including any terminal or browser console output.
