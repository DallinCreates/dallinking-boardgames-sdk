# Dallin King Boardgames SDK

The official Software Development Kit for building Jackbox-style multiplayer browser games on [boardgames.dallinking.com](https://boardgames.dallinking.com).

This monorepo contains the core engine, React frontend bridge, and local developer environment needed to create, test, and deploy interactive party games.

## Packages

This repository is managed as an npm workspace and is divided into the following packages:

| Package | Description |
|---|---|
| [`@dallincreates/boardgame-server`](./packages/server) | `BaseGameEngine`: the authoritative game logic that receives actions and pushes state. |
| [`@dallincreates/boardgame-client`](./packages/client) | `BoardgameProvider` / `useBoardgame`: connects your board and player apps to the engine. |
| [`@dallincreates/boardgame-devkit`](./packages/devkit) | Local tools: the sandbox (board + N players on one page), config validation, and release stamping. |
| [`@dallincreates/create-dallinking-boardgame`](./packages/create-dallinking-boardgame) | Scaffolds a new game project. |

## Getting Started

```bash
npm create @dallincreates/dallinking-boardgame my-new-game
cd my-new-game
npm run sandbox
```

That creates a playable starter game, installs everything, and opens the board plus several players on one page at http://localhost:3000. Requires Node.js 18+.

How a game fits together:

- **Board app** (`board.html`): the shared screen (TV or laptop).
- **Player app** (`player.html`): each phone.
- **Engine** (`src/engine/engine.js`): owns the state. The platform runs it on the host's device or on our servers, and the two apps talk to it through `@dallincreates/boardgame-client`.
- **`game.config.json`**: the release's ID, version, store page and player limits.

Rooms are parties: one room plays several games in a row. The party's VIP (the host's phone when they join signed in, otherwise the first player) picks the game and starts it. When a game ends, everyone returns to the lobby with a fresh engine.

## Documentation

**[Start with the docs →](./docs/README.md)** They're organized by what you're trying to do.

| | |
|---|---|
| [Getting started](./docs/getting-started.md) | From an empty folder to an uploaded game in about 15 minutes |
| [How your engine runs](./docs/engine.md) | Lifecycle, runtime rules, reconnects and checkpoints |
| [Building the board and player apps](./docs/apps.md) | Showing state, identity, designing for TV and phone, iframe limits |
| [Messages](./docs/messages.md) | Every message your apps and engine send and receive |
| [game.config.json](./docs/game-config.md) | Every field, player limits, gallery, validation |
| [Publishing a release](./docs/publishing.md) | Versioning, building, uploading |
| [Troubleshooting](./docs/troubleshooting.md) | Symptoms and fixes |

## Contributing

Contributions, issues, and feature requests are welcome! If you are submitting a Pull Request, please ensure you run the local build pipeline first:

```bash
npm install
npm run build
```

## Links

- [boardgames.dallinking.com](https://boardgames.dallinking.com) — play the games built with this SDK
- [dallinking.com](https://dallinking.com) — main site
- [bio.dallinking.com](https://bio.dallinking.com) — about Dallin King

## License

This project is MIT licensed. Copyright (c) 2026 Dallin King.