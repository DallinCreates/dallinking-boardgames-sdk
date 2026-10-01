# @dallincreates/boardgame-server

The authoritative game engine for [boardgames.dallinking.com](https://boardgames.dallinking.com).

You write one class that extends `BaseGameEngine`. The platform runs it either on the host's device (in a web worker) or on our servers. It receives every action the board and phones send, owns the game state, and pushes updates back out.

This README is the API reference. For when each hook fires, what the runtime allows, and how games survive reconnects, read [How your engine runs](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/engine.md). To start a project with all of this set up, run `npm create @dallincreates/dallinking-boardgame my-game`.

## Installation

```bash
npm install @dallincreates/boardgame-server
```

## Writing an engine

Your engine is the default export of `src/engine/engine.js` (bundled to `dist/engine.cjs` for release). Every hook marked **required** below must be implemented.

```js
import { BaseGameEngine, GAME_STATUS, ensurePlayer } from '@dallincreates/boardgame-server';

export default class MyGame extends BaseGameEngine {
  // Required. Runs when the party picks this game, and again on a fresh
  // engine when a game ends and the party returns to the lobby.
  onInit() {
    this.state = { status: GAME_STATUS.LOBBY, players: {}, scores: {} };
  }

  // Required. Runs once for every player already in the party right after
  // onInit (isLateJoin = false), then for each new join (isLateJoin = true
  // if the game has already started).
  onPlayerJoin(playerId, name, isLateJoin) {
    this.state.players = ensurePlayer(this.state.players, playerId, name);
    this.state.scores[playerId] ??= 0;
    this.sync();
  }

  // Required. A player left, was kicked, or didn't reconnect in time.
  // Cloud hosting calls it only after Start; Local hosting may call it in
  // the lobby too, so handle both.
  onPlayerLeave(playerId) {
    this.sync();
  }

  // Required. A player's connection came back; resend what they need.
  onReconnect(playerId, meta) {
    this.sendStateSnapshot(playerId, meta.isBoard);
  }

  // Required. A player's connection dropped (they may come back).
  onDisconnect(playerId, meta) {}

  // Optional. Runs once per engine when the board or VIP presses Start.
  onGameStart() {
    super.onGameStart();
    this.state.status = GAME_STATUS.PLAYING;
    this.sync();
  }

  // Required. Every message whose type starts with "game:" lands here.
  processAction(actionType, payload, meta) {
    switch (actionType) {
      case 'game:score':
        if (meta.isBoard || this.isGameOver) return; // only phones score, and not after the end
        this.state.scores[meta.playerId] += payload.points;
        this.sync();
        if (this.state.scores[meta.playerId] >= 10) {
          // The platform shows the results, counts the win, and offers Play again.
          this.gameOver({ players: this.state.scores });
        }
        break;
      default:
        console.warn(`Unhandled action: ${actionType}`);
    }
  }

  // Optional. Play again from the results screen, on this same instance.
  // Leave it out and the platform starts a fresh engine instead.
  onPlayAgain() {
    for (const id in this.state.scores) this.state.scores[id] = 0;
    this.sync();
  }

  // Optional. Clear timers/intervals when the room closes or the game ends.
  destroy() {}

  // Broadcasting game:sync_state also saves a checkpoint, so the game
  // survives the host's tab reloading.
  sync() {
    this.broadcastRoomUpdate({ type: 'game:sync_state', payload: { state: this.state } });
  }
}
```

For where engines run, the runtime's limits, reconnects and checkpoints, see [How your engine runs](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/engine.md).

### Sending messages

| Method | Goes to |
|---|---|
| `this.broadcastRoomUpdate(message)` | The board and every player |
| `this.sendMessageToPlayer(playerId, message)` | One player |
| `this.sendMessageToBoard(message)` | The board only |

Use a `game:` prefix on every message type. The frontends only see `game:*` messages plus the platform's `room:update` and `room:reconnected`; other `room:*` messages are filtered out before they reach your iframe.

`broadcastRoomUpdate` sends the same payload to everyone. If your state has secrets (hands, roles, hidden words), send each player their own view with `sendMessageToPlayer` instead.

## Sound and vibration on one screen

The engine decides who hears and feels what. These send a `game:fx` message that `@dallincreates/boardgame-client` plays on its own, at each device's volume and vibration settings, so your apps need no code for them:

```js
this.playSound(meta.playerId, 'buzz');            // a wrong answer, on that phone only
this.playSound('board', 'fanfare');               // the TV only
this.notifyTurn(nextPlayerId);                    // the 'turn' vibration on their phone
this.notifyTurn(nextPlayerId, { sound: 'ding' }); // plus a sound on that phone
this.notifyTimeRunningOut();                      // every phone: the 'warning' vibration
this.vibrate([annId, boId], 'success');
this.sendEffect(meta.playerId, { sound: 'buzz', volume: 0.6, haptic: 'error' });
```

| Method | Does |
|---|---|
| `sendEffect(to, { sound?, volume?, haptic? })` | The general form. The others call it. |
| `playSound(to, sound, { volume? })` | A sound. `sound` is a name from `<BoardgameProvider sounds>`, or a path relative to the app (`'./sounds/buzz.mp3'`). |
| `vibrate(to, pattern = 'tap')` | `'tap'`, `'success'`, `'error'`, `'turn'`, `'warning'`, a duration in ms, or `[on, off, on, ...]`. |
| `notifyTurn(playerId, { sound? })` | "It's your turn." `playerId` can be an array. |
| `notifyTimeRunningOut(to = 'players', { sound? })` | "Hurry." |

`to` is a player ID, an array of them, `'board'`, `'players'` (every phone) or `'all'` (every phone and the board). Vibration only ever happens on phones, and only where the player allows it; iPhones can't vibrate from the web at all, so never rely on it alone.

Effects are fire-and-forget: they aren't part of your state, so a phone that reconnects doesn't replay them.

## Ending a game

```ts
this.gameOver(results: GameOverResults): void
this.isGameOver: boolean          // true from gameOver() until Play again
onPlayAgain?(): void              // optional hook
```

```ts
interface GameOverResults {
  players?: Record<string, number | 'WON' | 'LOST' | 'TIE' | { outcome?: 'WON' | 'LOST' | 'TIE'; score?: number }>;
  teams?: { name: string; players: string[]; outcome?: 'WON' | 'LOST' | 'TIE'; score?: number; color?: string }[];
  summary?: string;          // up to 140 characters
  lowerScoreWins?: boolean;  // default false: the highest score wins
  delayMs?: number;          // 0-10000, default 1500
}
```

Call `gameOver` once, after `onGameStart`. Invalid results are ignored with a console warning. Team wins count as a win for every player on the team. `validateGameOverResults(results)` is exported if you want to check results yourself; it returns the problem as a string, or `null`.

How ranking, the results screen, Play again and the Tonight scoreboard work: [Ending a game](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/engine.md#ending-a-game).

## ActionMeta

Every action arrives with metadata filled in by the room server, so clients can't spoof it:

```ts
interface ActionMeta {
  playerId: string;   // who sent it
  isBoard: boolean;   // true if it came from the shared screen
  isVip: boolean;     // true if the sender is the party's VIP
  timestamp: number;  // epoch ms
}
```

The VIP runs the party from their phone (picks games, starts, kicks). The first player to join becomes VIP, except that a phone signed into the host's account takes VIP when it joins. If the VIP leaves, it passes to the host's phone if present, otherwise to the next player.

## State snapshots (reconnect and refresh)

The platform re-delivers state to a single client when a player reconnects, rejoins mid-game, or presses **Refresh room state** in the game menu. Two getters decide what they get:

```js
getBoardState() {
  return this.state;
}

// Strip out anything this player shouldn't see.
getPlayerState(playerId) {
  const { roles, ...publicState } = this.state;
  return { ...publicState, myRole: roles?.[playerId] };
}
```

Both default to the full `this.state`. `sendStateSnapshot(playerId, isBoard)` wraps the result as:

```json
{ "type": "game:sync_state", "payload": { "state": { } } }
```

Your board and player apps should handle `game:sync_state` by replacing their local state with the payload.

## Utilities

- `validateGameOverResults(results)` returns the first problem with `gameOver` results, or `null`. `GameOverResults`, `TeamResult` and `GameOutcome` are exported as types.
- `SDK_VERSION` is this package's version. Every engine also inherits it as the static `sdkVersion` (`MyGame.sdkVersion`), so the bundled engine records which SDK it was built with.
- `shuffle(array, random = Math.random)` returns a shuffled copy. Not cryptographically secure.
- `ensurePlayer(players, playerId, name = 'Player')` returns a copy of the players map with `{ name, connected: true }` added for `playerId` if it was missing. It doesn't mutate the map you pass in.
- `GAME_FX_MESSAGE` (`'game:fx'`), `buildEffectMessage(effect)` and the `GameEffect`, `EffectTarget` and `HapticPattern` types, for sending effects yourself.
- `GAME_STATUS` has `LOBBY`, `ASSIGNING_ROLES`, `PLAYING` and `GAME_OVER`.
- `MESSAGE_TYPE` has `ROOM_UPDATE`, `ROOM_GAME_STARTED`, `ROOM_CLOSED`, `GAME_UPDATE` and `GAME_ERROR`.

## License

MIT
