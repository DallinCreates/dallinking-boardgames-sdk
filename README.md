# Dallin King Boardgames SDK

The official Software Development Kit for building Jackbox-style multiplayer browser games on [boardgames.dallinking.com](https://boardgames.dallinking.com).

This monorepo contains the core engine, React frontend bridge, and local developer environment needed to create, test, and deploy interactive party games.

## Packages

This repository is managed as an npm workspace and is divided into the following packages:

| Package | Description |
|---|---|
| [`@dallinking/boardgame-server`](./packages/server) | The core abstract classes and state managers for building authoritative backend game logic. |
| [`@dallinking/boardgame-client`](./packages/client) | React hooks and UI components to seamlessly connect Host Boards and Mobile Player controllers to the game engine. |
| [`@dallinking/boardgame-devkit`](./packages/devkit) | The local testing server that simulates the live production environment. |
| [`create-dallinking-boardgame`](./packages/create-dallinking-boardgame) | The CLI tool to instantly scaffold a new game project. |

## Getting Started

To create a new game using this SDK, run the following command in your terminal:

```bash
npm create dallinking-boardgame my-new-game
```

## Contributing

Contributions, issues, and feature requests are welcome! If you are submitting a Pull Request, please ensure you run the local build pipeline first:

```bash
npm install
npm run build
```

## License

This project is MIT licensed. Copyright (c) 2026 Dallin King.