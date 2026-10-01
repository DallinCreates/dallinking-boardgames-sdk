// README.md, AGENTS.md and CLAUDE.md for the generated project.

const DOCS = 'https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs';

export function readme({ gameName }) {
  return `# ${gameName}

A party game for [boardgames.dallinking.com](https://boardgames.dallinking.com): one shared screen (the **board**), plus everyone's phone as a controller (the **player** app).

## Commands

| Command | What it does |
|---|---|
| \`npm run sandbox\` | Builds, then opens the board and several players on one page at http://localhost:3000. **Start here.** |
| \`npm run sandbox -- -6\` | The sandbox with 6 players |
| \`npm run sandbox:dev\` | The sandbox without building first (faster while iterating on the UI) |
| \`npm run validate\` | Checks everything before upload: config, player counts, cover image and engine hooks |
| \`npm run build\` | Builds everything into \`dist/\` and zips it as \`<id>-<version>.zip\` for upload |

## Where things are

| Path | What it is | Change it to… |
|---|---|---|
| \`src/engine/engine.js\` | The rules. Owns all game state and handles every action. | Change how the game plays |
| \`src/shared/game.js\` | Action names, phases and constants used by the engine and both apps | Add an action |
| \`src/board/App.jsx\` | The shared screen (TV or laptop) | Change what everyone sees |
| \`src/player/App.jsx\` | Each phone | Change the controls |
| \`src/shared/GameState.jsx\` | Turns platform messages into \`useGameState()\` | Handle a new message type |
| \`public/game.config.json\` | Name, version, player limits, store page details | Change listing details or player counts |
| \`public/cover.png\` | *(add this)* Your cover image for catalog cards | |
| \`public/gallery/\` | *(add this)* Screenshots, listed in \`gallery\` in the config | |

## How a turn flows

1. A phone calls \`send({ type: ACTION.SCORE })\`.
2. The engine's \`processAction\` gets it, with \`meta.playerId\` saying who sent it, and updates \`this.state\`.
3. The engine calls \`this.sync()\`, which broadcasts \`game:sync_state\`.
4. Every screen's \`useGameState().state\` updates, and React re-renders.

## Ending the game

When someone wins, the engine calls \`this.gameOver({ players: { [playerId]: score } })\`. The platform then shows the results on every screen, counts the win on the night's scoreboard, and offers **Play again** (which calls \`onPlayAgain()\`) or **Pick another game**. Teams work too: \`this.gameOver({ teams: [...] })\`. See [Ending a game](${DOCS}/engine.md#ending-a-game).

## Adding an action

1. Name it in \`src/shared/game.js\`: \`ACTION.GUESS = 'game:guess'\`.
2. Handle it in \`processAction\` in \`src/engine/engine.js\`. Check the sender and the payload, change \`this.state\`, then call \`this.sync()\`.
3. Send it from an app: \`send({ type: ACTION.GUESS, payload: { word } })\`.

## Releasing

1. Bump \`version\` in \`public/game.config.json\`. Published versions are locked.
2. Fill in \`subtitle\`, \`description\`, \`tags\` and \`players\`, and add \`public/cover.png\` (1200×1800 PNG).
3. \`npm run validate\` and fix anything it reports.
4. \`npm run build\`
5. Upload the zip on the **Developer** page at boardgames.dallinking.com, test it from the testing channel, then publish.

## Docs

- [Getting started](${DOCS}/getting-started.md)
- [How your engine runs](${DOCS}/engine.md): lifecycle, runtime rules, reconnects
- [Building the board and player apps](${DOCS}/apps.md)
- [Messages](${DOCS}/messages.md): everything your apps send and receive
- [game.config.json](${DOCS}/game-config.md)
- [Publishing a release](${DOCS}/publishing.md)
- [Troubleshooting](${DOCS}/troubleshooting.md)
`;
}

export const agents = `# Notes for AI coding assistants

This is a game for boardgames.dallinking.com, built on the @dallincreates boardgame SDK. Read this before changing code.

## Architecture

- \`src/engine/engine.js\` is the single source of truth. It extends \`BaseGameEngine\` from \`@dallincreates/boardgame-server\`. All game state lives in \`this.state\`.
- \`src/board/\` (shared screen) and \`src/player/\` (phones) are React apps that run in sandboxed iframes. They never hold authoritative state: they send actions with \`send()\` and render \`useGameState().state\`.
- \`src/shared/game.js\` holds the action names and constants used by both sides. Add new action types there.

## Rules the platform enforces

- Every action and engine message type starts with \`game:\`. Other namespaces are dropped.
- The engine runs in a browser worker or an isolated sandbox, not Node. No \`require\`, \`fs\`, \`process\`, \`window\` or \`document\`. \`fetch\` is limited to GET from cdn.dallinking.com and raw.githubusercontent.com.
- Everything crossing the engine boundary is JSON. Keep \`this.state\` to plain objects, arrays, strings, numbers, booleans and null: no Map, Set, Date or class instances.
- Each hook call must finish in well under 1 second; the engine also has 3 s of CPU per 10 s and 192 MB of memory.
- The apps' iframes have no same-origin access: no localStorage, sessionStorage, cookies or popups.
- \`onGameStart\` is called by the platform when the host presses Start. Don't add an in-game Start action.
- End every game with \`this.gameOver({ players })\` or \`this.gameOver({ teams })\`. The platform owns the results screen, Play again (which calls \`onPlayAgain\`) and the party scoreboard, so don't build those in the game.
- A player who leaves and rejoins keeps the same playerId. Keep their data in \`onPlayerLeave\` instead of deleting it.

## Conventions in this project

- Change state only in the engine, then call \`this.sync()\` to broadcast \`game:sync_state\` (which also checkpoints the game).
- In \`processAction\`, trust \`meta.playerId\`, \`meta.isBoard\` and \`meta.isVip\`. Validate everything in \`payload\`, and ignore bad input rather than throwing.
- Hidden information (hands, roles, answers) must not be broadcast. Send it with \`this.sendMessageToPlayer\`, and filter it in \`getPlayerState\`.
- Clear every timer in \`destroy()\`. Store deadlines in state as timestamps rather than relying on timers surviving.
- \`public/game.config.json\` follows ${DOCS}/game-config.md. Never add \`sdkVersion\`: the build stamps it.

## Commands

- \`npm run sandbox\`: run the game locally with several players.
- \`npm run validate\`: check the config, cover image and engine hooks before upload.
- \`npm run build\`: build, validate, stamp and zip.

## Reference

- Engine lifecycle and runtime: ${DOCS}/engine.md
- Messages: ${DOCS}/messages.md
- Apps: ${DOCS}/apps.md
- Engine API: https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/packages/server/README.md
`;

// Claude Code reads CLAUDE.md; the shared notes live in AGENTS.md.
export const claude = `@AGENTS.md
`;
