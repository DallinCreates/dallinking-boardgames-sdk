# Documentation

Everything you need to build, test and publish a game on [boardgames.dallinking.com](https://boardgames.dallinking.com).

**New here?** Start with [Getting started](./getting-started.md). It takes about 15 minutes, from an empty folder to a game running in the sandbox.

## I want to…

| …do this | Read |
|---|---|
| Create a new game | [Getting started](./getting-started.md) |
| Understand how a game fits together | [Getting started → Find your way around](./getting-started.md#3-find-your-way-around) |
| Write game rules | [How your engine runs](./engine.md), then the [engine API](../packages/server/README.md) |
| Know when each engine hook fires | [Engine → Lifecycle](./engine.md#lifecycle) |
| Know what my engine is and isn't allowed to do | [Engine → Runtime rules](./engine.md#runtime-rules) |
| Keep hidden information secret | [Engine → State](./engine.md#state) |
| End a game and show who won (players or teams) | [Engine → Ending a game](./engine.md#ending-a-game) |
| Restart with Play again | [Engine → Play again](./engine.md#play-again) |
| Handle players dropping, leaving and coming back | [Engine → Disconnects and recovery](./engine.md#disconnects-and-recovery) |
| Build the shared screen or the phone controls | [Building the board and player apps](./apps.md) |
| Know which player a phone belongs to | [Messages → Who am I?](./messages.md#clientid-who-am-i) |
| See every message type | [Messages](./messages.md) |
| Test with several players on one computer | [Devkit → Sandbox](../packages/devkit/README.md#running-the-sandbox) |
| Set player limits, the store page, screenshots | [game.config.json](./game-config.md) |
| Check my game before uploading | [`npm run validate`](../packages/devkit/README.md#validating-before-upload) |
| Release a new version | [Publishing a release](./publishing.md) |
| Fix something that isn't working | [Troubleshooting](./troubleshooting.md) |

## Guides

| Guide | Covers |
|---|---|
| [Getting started](./getting-started.md) | Create a project, play it, make a first change, upload it |
| [How your engine runs](./engine.md) | Local vs Cloud hosting, the hook lifecycle, runtime limits, state rules, disconnects and checkpoints |
| [Building the board and player apps](./apps.md) | Wiring, showing state, identity and VIP, designing for TV and phone, iframe limits, assets, testing |
| [Publishing a release](./publishing.md) | Versioning, the zip layout, uploading, the testing channel |
| [Troubleshooting](./troubleshooting.md) | Symptoms and fixes, from install to live rooms |

## Reference

| Reference | Covers |
|---|---|
| [Messages](./messages.md) | Every message apps and engines send and receive, the `room` object, reserved namespaces |
| [game.config.json](./game-config.md) | Every field, player limits, gallery, validation errors, migrating old configs |
| [`@dallincreates/boardgame-server`](../packages/server/README.md) | `BaseGameEngine`: hooks, sending messages, `ActionMeta`, snapshots, utilities |
| [`@dallincreates/boardgame-client`](../packages/client/README.md) | `BoardgameProvider`, `useBoardgame`, and the non-React bridge |
| [`@dallincreates/boardgame-devkit`](../packages/devkit/README.md) | `sandbox`, `validate` and `stamp` commands, the config schema |
| [`create-dallinking-boardgame`](../packages/create-dallinking-boardgame/README.md) | The project generator: options and what it creates |

## Design records

How and why larger features were built.

| Design | Status |
|---|---|
| [Game over, results and party history](./design/game-over.md) | Built: phase 1 (SDK 1.2.0) and phase 2 (night summary, Game nights page). |

## The packages at a glance

| Package | You use it in | For |
|---|---|---|
| `@dallincreates/boardgame-server` | `src/engine/` | The `BaseGameEngine` class your rules extend |
| `@dallincreates/boardgame-client` | `src/board/`, `src/player/` | Connecting your apps to the platform |
| `@dallincreates/boardgame-devkit` | Your terminal and `npm run` scripts | Testing locally, validating and stamping releases |
| `@dallincreates/create-dallinking-boardgame` | `npm create` | Starting a new project |
