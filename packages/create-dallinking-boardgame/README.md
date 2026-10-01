# @dallincreates/create-dallinking-boardgame

Creates a new game for [boardgames.dallinking.com](https://boardgames.dallinking.com): a playable starter with the engine, the board and player apps, the build, and editor support already set up.

## Usage

```bash
npm create @dallincreates/dallinking-boardgame my-game
cd my-game
npm run sandbox
```

Requires Node.js 18 or newer.

The folder name becomes your game ID (`my-game`, lowercased, letters, numbers, `-` and `_`) and display name (`My Game`). The folder must not exist yet, or must be empty.

### Options

| Option | Default | Does |
|---|---|---|
| `--name "<name>"` | Folder name in Title Case | Sets the display name |
| `--no-install` | Install | Skips `npm install` |
| `--no-git` | Create a repository | Skips `git init` and the first commit |
| `-h`, `--help` | | Shows help |
| `-v`, `--version` | | Shows the version |

With `npm create`, put options after `--`:

```bash
npm create @dallincreates/dallinking-boardgame word-duel -- --name "Word Duel!" --no-git
```

## What it does

1. Writes the project files (below).
2. Runs `npm install`, then pins the SDK packages to the versions it installed (`^x.y.z` instead of `latest`), so the project keeps building the same way until you upgrade on purpose.
3. Creates a git repository with a first commit, unless the folder is already inside one.
4. Prints the next steps.

## What you get

```
my-game/
  public/game.config.json       name, version, player limits, store page (with editor autocomplete)
  src/engine/engine.js          the rules: a complete "first to 10 taps" game
  src/shared/game.js            action names and constants shared by the engine and both apps
  src/shared/GameState.jsx      useGameState(): state, me, isVip, room, error, send
  src/shared/styles.css         base styles for both apps
  src/board/                    the shared screen (React)
  src/player/                   the phones (React)
  board.html, player.html       entry points
  vite.config.js                builds both apps with relative paths for the CDN
  scripts/build-zip.js          zips dist/ as <id>-<version>.zip
  jsconfig.json                 editor support for JSX and the @shared alias
  README.md                     commands, file map, how to add an action, release steps
  AGENTS.md, CLAUDE.md          the platform's rules, for AI coding assistants
  .gitignore, .nvmrc
```

### Scripts

| Script | Does |
|---|---|
| `npm run sandbox` | Builds, then runs the board and several players on one page at http://localhost:3000 |
| `npm run sandbox:dev` | The same without building first |
| `npm run validate` | The pre-upload check: config, player counts, cover image and engine hooks |
| `npm run build` | Builds both apps and the engine, validates and stamps the config, and zips `dist/` |

## Programmatic use

```js
import { scaffoldProject } from '@dallincreates/create-dallinking-boardgame';

const { targetDir, gameId, installed } = scaffoldProject('my-game', {
  name: 'My Game',
  install: false,
  git: false,
});
```

## Docs

[Getting started](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/getting-started.md) walks through the generated project, a first change and a first upload. All docs: https://github.com/DallinCreates/dallinking-boardgames-sdk/tree/main/docs

## License

MIT
