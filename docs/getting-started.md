# Getting started

This walks you from nothing to a working game in the sandbox, then through your first change and your first upload. Plan on about 15 minutes.

## What you need

- **Node.js 18 or newer** (20 recommended). Check with `node --version`.
- **A developer account** on [boardgames.dallinking.com](https://boardgames.dallinking.com), to upload. You don't need it to build and test locally.
- Git (optional, but the project is set up for it).

## 1. Create the project

```bash
npm create @dallincreates/dallinking-boardgame my-game
```

This creates `my-game/`, installs everything, and makes a first git commit. The folder name becomes your game ID (`my-game`) and display name (`My Game`). Options:

```bash
npm create @dallincreates/dallinking-boardgame my-game -- --name "My Great Game"
npm create @dallincreates/dallinking-boardgame my-game -- --no-install --no-git
```

You get a complete, playable starter: everyone taps their phone, and the first to 10 wins.

## 2. Play it

```bash
cd my-game
npm run sandbox
```

Open http://localhost:3000. You'll see the board and four phones on one page. Press ▶ in the toolbar to start the game, then click **Tap!** on the phones. When someone reaches 10, the engine calls `this.gameOver()` and the results screen appears, with **Play again** and the night's scoreboard.

Want a different number of players? `npm run sandbox -- -6`. Iterating on the UI? `npm run sandbox:dev` skips the build.

## 3. Find your way around

| File | What it is |
|---|---|
| `src/engine/engine.js` | The rules. It owns all state and handles every action. |
| `src/shared/game.js` | Action names and constants, shared by the engine and both apps |
| `src/board/App.jsx` | The shared screen |
| `src/player/App.jsx` | Each phone |
| `src/shared/GameState.jsx` | Gives components `useGameState()`: `state`, `me`, `isVip`, `send` |
| `public/game.config.json` | Name, version, player limits and store page |

Every game works the same way: **a phone sends an action → the engine changes `this.state` → the engine broadcasts it → every screen redraws.**

## 4. Make a change: add a "double points" button

**Name the action** in `src/shared/game.js`:

```js
export const ACTION = {
  SCORE: 'game:score',
  DOUBLE: 'game:double',
  PLAY_AGAIN: 'game:play_again',
};
```

**Handle it** in `processAction` in `src/engine/engine.js`:

```js
case ACTION.DOUBLE: {
  const player = this.state.players[meta.playerId];
  if (this.state.phase !== PHASE.PLAYING || !player || player.usedDouble) break;
  player.score *= 2;
  player.usedDouble = true;
  if (player.score >= WINNING_SCORE) {
    this.state.phase = PHASE.GAME_OVER;
    this.state.winnerId = meta.playerId;
  }
  this.sync();
  break;
}
```

**Send it** from `src/player/App.jsx`:

```jsx
{!myself?.usedDouble && (
  <button type="button" onClick={() => send({ type: ACTION.DOUBLE })}>Double my points</button>
)}
```

Run `npm run sandbox` again and try it. Notice that the engine checks everything (phase, player, whether it was already used) instead of trusting the phone.

## 5. Describe your game

Fill in `public/game.config.json`. Your editor autocompletes every field and flags mistakes as you type.

```json
{
  "subtitle": "Tap faster than your friends.",
  "description": "Everyone gets a button. First to 10 taps wins.",
  "tags": ["Party", "Reflex"],
  "players": { "min": 2, "max": 8 }
}
```

Add a `public/cover.png` for catalog cards (ideally 1200×1800). Then check everything, including the config, the cover and your engine:

```bash
npm run validate
```

All the fields are in the [game.config.json reference](./game-config.md).

## 6. Build and upload

```bash
npm run build
```

This builds both apps and the engine, validates the config, stamps the SDK version, and creates `my-game-1.0.0.zip`.

On boardgames.dallinking.com, open the **Developer** page, create your game (use the same ID as `id` in your config), and drop in the zip. It goes to the testing channel first, so you can host a real room and join from real phones. Publish it when it's ready. See [Publishing a release](./publishing.md).

## Next

- [How your engine runs](./engine.md): the lifecycle, runtime rules, reconnects. **Read this before writing a real game.**
- [Building the board and player apps](./apps.md)
- [Messages](./messages.md)
- [Troubleshooting](./troubleshooting.md)
