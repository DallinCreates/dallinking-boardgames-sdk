# Messages

Every message your game sends or receives is a JSON object with a `type`. This page lists all of them, in each direction.

```
 board app ──┐                           ┌──> board app
             ├── send() ──> engine ──────┤
 player app ─┘   processAction()         └──> player apps
                                 ▲
                      platform ──┘ room:update, system:error, ...
```

## Apps → engine

Your apps send actions with `send()` from `useBoardgame()` (or `useGameState()` in scaffolded projects):

```js
send({ type: 'game:guess', payload: { word: 'apple' } });
```

| Field | Rules |
|---|---|
| `type` | Must start with `game:`. A bare name like `'guess'` is turned into `'game:guess'`. Types starting with `room:`, `system:`, `connection:`, `webrtc:` or `platform:` are refused and never reach your engine. |
| `payload` | Any JSON. Your engine receives it unchanged. **Validate it**: anyone can send anything. |
| `meta` | Optional. The platform overwrites `playerId`, `isBoard`, `isVip` and `timestamp`; other keys pass through. |

The engine receives it as `processAction(type, payload, meta)`:

```js
meta = {
  playerId: 'a1b2…',   // who sent it (the board's ID if the board sent it)
  isBoard: false,      // true if the shared screen sent it
  isVip: true,         // true if the sender is the party's VIP
  timestamp: 1767225600000,
}
```

## Engine → apps

Your engine sends with these methods (see the [server README](../packages/server/README.md)):

| Method | Reaches |
|---|---|
| `this.broadcastRoomUpdate(message)` | The board and every player |
| `this.sendMessageToPlayer(playerId, message)` | One player |
| `this.sendMessageToBoard(message)` | The board |

Rules:

- **`type` must start with `game:`.** Anything else is dropped. The one exception: `system:error` sent to a single player or the board (not broadcast) is delivered, for showing an error message.
- **The whole message must be JSON.** Functions, `Map`, `Set` and class instances don't survive.
- **Broadcasting `game:sync_state` saves a checkpoint** in Local hosting. See [Checkpoints](./engine.md#checkpoints-local-hosting).

### `game:sync_state` (the convention)

The platform itself sends `game:sync_state` when a client reconnects, joins late or presses **Refresh**, built from your engine's `getBoardState()` / `getPlayerState(playerId)`:

```json
{ "type": "game:sync_state", "payload": { "state": { } } }
```

Use the same message for your own updates and handle it in your apps by **replacing** local state with `payload.state`. That way one handler covers normal updates, reconnects and refreshes. Scaffolded projects do this in `src/shared/GameState.jsx`.

You can send other `game:*` messages too, for one-off events like `game:round_timer` or `game:your_hand`.

### `game:fx` (sound and vibration)

`this.playSound`, `this.vibrate`, `this.notifyTurn`, `this.notifyTimeRunningOut` and `this.sendEffect` send this ([server README](../packages/server/README.md#sound-and-vibration-on-one-screen)):

```json
{ "type": "game:fx", "payload": { "sound": "buzz", "volume": 0.6, "haptic": "turn", "only": "players" } }
```

Every field is optional. The client SDK plays it as soon as it arrives, at the device's own settings: the sound on that screen, the vibration on phones only, and nothing on the board when `only` is `"players"`. It still reaches `onMessage`, so you can add a visual flourish. Don't use `game:fx` for anything else.

## Platform → apps

Besides your engine's `game:*` messages, `onMessage` receives these from the platform:

| Type | When | Shape |
|---|---|---|
| `room:update` | When the game loads, and whenever the room changes (joins, leaves, VIP changes) | `{ type, clientId, room }` |
| `room:reconnected` | This screen's connection came back | `{ type, clientId, room }` |
| `system:error` | Something this screen did was refused, or your engine sent one | `{ type, message }` |
| `game:ack` | Cloud hosting confirms it processed an action | `{ type, messageId }` (safe to ignore) |

Every other `room:*` message is filtered out before it reaches your app, and so is every `platform:*` message (below).

### `clientId`: who am I?

`clientId` on `room:update` is **this screen's ID**: the player's ID on a phone, the board's ID on the shared screen. It's the same ID your engine sees as `meta.playerId` and uses as a key in its state. Use it to find "my" data:

```js
const me = message.clientId;
const myScore = state.players[me]?.score;
```

### The `room` object

| Field | Type | Meaning |
|---|---|---|
| `code` | string | The 4-letter room code |
| `boardId` | string | The board's ID |
| `gameId` | string | Your game's `id` |
| `gameName` | string | Your game's name |
| `gameStarted` | boolean | Whether Start has been pressed |
| `players` | array | Everyone seated: `{ id, name, isVip, isHost, connected }` |
| `minPlayers`, `maxPlayers` | number or null | From your `game.config.json` |
| `phase` | string | `'lobby'`, `'playing'`, or `'results'` after your engine calls `gameOver` |
| `results` | object or null | The ranked results while `phase` is `'results'` ([below](#roomresults)) |
| `party` | object | The party's Tonight scoreboard across games ([below](#roomparty)) |

`isVip` marks the player who runs the party from their phone; `isHost` marks the phone signed into the host's account. Rely on your engine's state for game data, and on `room` for names, VIP status and connection status.

### `room.results`

Set while the results screen is up, after your engine calls [`gameOver`](./engine.md#ending-a-game):

```js
{
  gameId, gameName, version, startedAt, endedAt, durationMs,
  showAt,                // when the results screen appears (endedAt + delayMs)
  headline,              // "Ann wins!", "Red team wins!", "Everyone wins!", "It's a tie!"
  summary,               // your summary, or ""
  lowerScoreWins,
  teams: [ { name, color, rank, outcome, score, won, players: [playerId] } ],     // [] without teams
  standings: [ { playerId, name, rank, outcome, score, team, won, points } ],     // every finisher
  byPlayer: { [playerId]: { rank, outcome, score, team, won, points } },          // look up "my" result
  didNotFinish: [ { playerId, name } ],
}
```

Use `room.results.byPlayer[me]` to show a player their own result in your game's style. The platform's results screen does this too.

### `room.party`

The night so far, ranked by wins, then points:

```js
{
  id, startedAt, gamesPlayed,
  standings: [ { playerId, name, rank, wins, points, gamesPlayed, seated } ],
  recent: [ { gameId, gameName, headline, startedAt, endedAt } ],   // last 10 games, newest first; headline is null with no result
}
```

The devkit sandbox sends a smaller `room` (`code`, `boardId`, `gameId`, `gameName`, `gameStarted`, `phase`, `results`, `party`, and `players` with `id`, `name`, `isVip` and `connected`), so don't depend on the other fields without a fallback.

## Platform ↔ SDK

The platform and the client SDK talk to each other directly, inside the device, in the `platform:` namespace. These never reach your engine or your `onMessage`, and the SDK handles them for you. They're listed here for completeness.

| Type | Direction | Shape | What happens |
|---|---|---|---|
| `platform:settings` | Platform → game | `{ payload: { muted, masterVolume, musicVolume, sfxVolume, haptics, canVibrate } }` | Sent when the game loads and whenever the player changes a setting. `audio` applies it; `usePlatformSettings()` returns it. |
| `platform:haptic` | Game → platform | `{ payload: { pattern: [on, off, ...] } }` | The platform vibrates the phone, if the player allows it. Patterns are capped at 10 steps and 3 seconds. |

Older platforms don't send `platform:settings`. Until it arrives, the SDK plays at full volume and doesn't ask for vibration.

## Reserved namespaces

| Prefix | Owner | Can your game use it? |
|---|---|---|
| `game:` | Your game | Yes: all of your actions and messages |
| `room:` | Platform room control | No. Receive `room:update` and `room:reconnected` only. |
| `system:` | Platform errors and readiness | Receive `system:error`. Engines may send a targeted `system:error`. |
| `platform:` | The device's settings and vibration ([above](#platform--sdk)) | No. The SDK uses it for you. |
| `connection:`, `webrtc:` | Platform networking | No |
