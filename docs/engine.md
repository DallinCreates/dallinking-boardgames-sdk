# How your engine runs

Your engine is the single source of truth for a game. The board and phones only send actions and draw what the engine tells them. This guide covers what the platform does around your engine: where it runs, when each hook fires, what the runtime allows, and how games survive dropped connections.

For the API itself (hooks, `this.state`, sending messages, `ActionMeta`), see the [`@dallincreates/boardgame-server` README](../packages/server/README.md).

## Where it runs

The host picks how to host a room, and the same engine file runs in either place:

| Hosting | Engine runs in | Players connect | Notes |
|---|---|---|---|
| **Local** (default) | A web worker in the host's browser | Peer-to-peer (WebRTC) to the host | Free. If the host's tab reloads, the game is restored from a [checkpoint](#checkpoints-local-hosting). |
| **Cloud** | An isolated sandbox on our servers | WebSocket to our servers | Needs the host's account to have Cloud hosting. Stricter [limits](#runtime-rules). |

You can't choose which one your game gets, so **write for Cloud's rules**. An engine that works there works in both.

## Lifecycle

A room is a party that plays several games in a row. Each time a game is picked, your engine gets a fresh instance:

```
Host or VIP picks your game
  └─ new Engine(deps)
  └─ onInit()                          set up this.state
  └─ onPlayerJoin(id, name, false)     once for each player already seated
       ... more players join ...      onPlayerJoin(id, name, false)
Host or VIP presses Start             (only if the player count fits game.config.json)
  └─ onGameStart()                     exactly once
       ... play ...                    processAction(type, payload, meta) for every game:* action
                                       onPlayerJoin(id, name, true) for late joiners
                                       onDisconnect / onReconnect as phones drop and return
                                       onPlayerLeave(id) when someone leaves (they may rejoin)
Someone wins
  └─ this.gameOver(results)            the platform shows results on every screen
Host or VIP chooses on the results screen
  ├─ Play again
  │    └─ onPlayAgain()                same instance, if you define it
  │       (otherwise: a fresh instance, onInit, onPlayerJoin for everyone, onGameStart)
  └─ Pick another game, or the room closes
       └─ destroy()                    clear your timers
       └─ (back in the lobby: a new instance, starting again at onInit)
```

What to know about each hook:

| Hook | Fires | Notes |
|---|---|---|
| `onInit()` | Once per instance, before any players | Set `this.state` here, not in the constructor. |
| `onPlayerJoin(id, name, isLateJoin)` | Every seated player, then each new one | `isLateJoin` is `true` only after `onGameStart`. The platform sends late joiners a state snapshot afterwards, so you don't have to. **A player who left and rejoins arrives with the same `id`**, so check whether you already know them. |
| `onGameStart()` | Once, when Start is pressed | Call `super.onGameStart()` so `hasStarted` is set. |
| `processAction(type, payload, meta)` | Every action from the board or a phone | `type` always starts with `game:`. `meta` is filled in by the platform and can be trusted. `payload` comes from the client and can't. |
| `onDisconnect(id, meta)` | A connection drops | The player may come back. Mark them offline; don't remove them. |
| `onReconnect(id, meta)` | A dropped connection returns, or the client presses **Refresh** | The platform sends a state snapshot right after, so you don't need to. After a dropped connection, `meta` has only `isBoard` and `timestamp`, so use the `id` argument. |
| `onPlayerLeave(id)` | A player leaves, is kicked, or doesn't return in time | Cloud calls it only after the game starts. Local can also call it in the lobby, so handle both. They may come back with the same `id`, so consider keeping their data rather than deleting it. |
| `onPlayAgain()` *(optional)* | The host or VIP chose **Play again** after `gameOver` | Runs on the same instance. Reset what you want and broadcast. Leave it undefined and the platform starts a fresh instance instead. See [Ending a game](#ending-a-game). |
| `destroy()` | The game ends or the room closes | Clear every `setTimeout` / `setInterval`. |

Keep game data in `this.state`. Each game gets a fresh runtime, so nothing leaks between games. But only `this.state` survives a [checkpoint](#checkpoints-local-hosting): module-level variables and other fields on `this` are reset.

## Ending a game

When the game is decided, call `this.gameOver(results)` once. The platform takes it from there:
- it shows a results screen over the game on every screen, after a short delay (1.5 s by default);
- the board shows who won ("Ann wins!", "Red team wins!");
- each phone leads with that player's own result ("🏆 You won!", "You placed 3rd", "You lost");
- the game counts on the party's **Tonight** scoreboard;
- the host and VIP get **Play again** and **Pick another game**.

### Individual results

Give each player a score, an outcome, or both:

```js
// Scores: the highest score wins. Ties share 1st, and all count as wins.
this.gameOver({ players: { [annId]: 42, [boId]: 37, [cyId]: 42 } });

// Win/lose
this.gameOver({ players: { [annId]: 'WON', [boId]: 'LOST' } });

// Both: outcomes decide the winner; scores are shown and order players within an outcome.
this.gameOver({ players: { [annId]: { outcome: 'WON', score: 12 }, [boId]: { outcome: 'LOST', score: 15 } } });

// Cooperative: everyone won (or everyone lost)
this.gameOver({ players: { [annId]: 'WON', [boId]: 'WON' }, summary: 'The crew escaped!' });

// Golf-style: the lowest score wins
this.gameOver({ players: { [annId]: 3, [boId]: 7 }, lowerScoreWins: true });
```

### Team results

Give each team a result. Every player takes their team's place, so **a team win counts as a win for each player on the team**. The board shows "Red team wins!" and each phone shows "You won!" or "You lost":

```js
this.gameOver({
  teams: [
    { name: 'Red team', color: '#ef4444', players: [annId, boId], outcome: 'WON' },
    { name: 'Blue team', color: '#3b82f6', players: [cyId, deeId], outcome: 'LOST' },
  ],
  players: { [annId]: 6, [boId]: 3, [cyId]: 4, [deeId]: 3 },   // optional individual scores, shown under each team
  summary: 'Red found the last word.',
});
```

### Options

| Field | Rules |
|---|---|
| `players` | `{ [playerId]: score \| 'WON' \| 'LOST' \| 'TIE' \| { outcome, score } }`. Required unless `teams` is given; with teams, only individual scores are used. Either every player has an outcome, or none do. |
| `teams` | `[{ name, players, outcome?, score?, color? }]`. `name` up to 40 characters; each team needs an outcome or a score; a player can be on only one team. |
| `summary` | Up to 140 characters, shown under the headline. |
| `lowerScoreWins` | Rank scores ascending. Default `false`: the highest score wins. |
| `delayMs` | 0–10000. How long before the results screen appears. Default `1500`. Raise it if you play your own ending animation. |

**How it ranks:**
- **Scores only:** the best score wins. Ties share a place, and the next place is skipped (1, 1, 3).
- **Outcomes:** `WON` beats `TIE`, which beats `LOST`. If nobody won, players who tied share the win. `LOST` never wins.

### Rules

- **Call it once, after `onGameStart`.** Later calls, and invalid results, are ignored with a console warning naming the problem, and the game carries on.
- **Include every seated player.** Anyone you leave out is shown as *didn't finish*. IDs that aren't seated are ignored.
- **Your engine keeps running** behind the results screen, and `processAction` still receives actions. Check `this.isGameOver` and ignore gameplay actions once it's `true`.
- **Don't build your own Play again button.** The results screen has one for the host and VIP.

### Play again

When the host or VIP picks **Play again**, the platform checks the player count still fits. Then:

| Your engine… | What happens |
|---|---|
| **Defines `onPlayAgain()`** | It runs on the same instance; `isGameOver` resets first. Keep what you like across rounds (rotate who goes first, keep teams), reset the rest, and broadcast. `onGameStart` isn't called again, and the apps keep running. |
| **Doesn't** | A fresh instance starts the game straight away: `onInit`, `onPlayerJoin` for everyone, `onGameStart`. The apps reload. |

```js
onPlayAgain() {
  for (const player of Object.values(this.state.players)) player.score = 0;
  this.state.phase = PHASE.PLAYING;
  this.sync();
}
```

**Pick another game** ends this engine (`destroy()`) and returns everyone to the lobby. A game that never calls `gameOver` still counts as played on the Tonight scoreboard, with no result.

### The Tonight scoreboard

The party keeps score across every game it plays, ranked by **wins**, then **points**:
- **Points:** one point per player you finished ahead of in a game.
- **Leaving:** players who leave keep their totals.
- **Rejoining:** a player who rejoins gets their old ID back, so their totals continue.
- **Duration:** the party lasts as long as the host's board. If the board is gone for good, the next party starts from scratch.

## Runtime rules

Your release ships one bundled file, `engine.cjs` (or `engine.js`), whose default export is your engine class. `npm run build` produces it from `src/engine/engine.js`, bundling in `@dallincreates/boardgame-server` and anything else you import.

| You can | You can't |
|---|---|
| Use plain JavaScript, `Math.random`, `Date`, `JSON` | `require` or `import` at runtime. Bundle everything in. |
| Use `setTimeout` / `setInterval` (up to 1000 at once) | Use Node APIs (`fs`, `process`, `Buffer`) or browser APIs (`window`, `document`, `localStorage`). |
| Use `console.log` / `warn` / `error` | Use any network access except the `fetch` described below. |
| Use `fetch(url)` for GET requests to `https://cdn.dallinking.com` or `https://raw.githubusercontent.com`, up to 8 MB per response | Send headers, cookies or request bodies. Only `.text()` and `.json()` are available on the response. |

**Cloud limits.** An engine that breaks one of these is shut down. Players see "The game stopped responding", and the host has to end the game.

| Limit | Value |
|---|---|
| Time for one hook call or timer callback | 1 second |
| Total CPU time | 3 seconds per 10-second window |
| Memory | 192 MB |

A healthy hook takes well under a millisecond. If you need a big setup step (a dictionary or a deck), do it once in `onInit`, and fetch large data from your release's CDN folder instead of building it in code.

**Errors.** If a hook throws, the platform catches it and the room keeps going. The action is simply lost. Validate inputs and stay defensive rather than throwing on bad input.

## State

Everything that crosses into or out of your engine is converted to JSON: hook arguments, messages you send, snapshots, and checkpoints. So:

- **Keep `this.state` plain JSON:** objects, arrays, strings, numbers, booleans and `null`. A `Map`, `Set`, `Date`, class instance or function is lost or garbled the moment it crosses. Store timestamps as numbers (`Date.now()`).
- **Keep secrets per player.** `broadcastRoomUpdate` sends the same message to the board and every phone, and anyone can open their browser tools. Send hands, roles and answers with `sendMessageToPlayer`, and override `getPlayerState(playerId)` so snapshots leave out other players' secrets.
- **Never trust `payload`.** Check that it's the sender's turn, that they're allowed to act (`meta.isVip`, `meta.isBoard`), and that values are what you expect. `meta.playerId` is the only reliable record of who sent an action.

## Messages

- **Your engine may only send `game:*` messages.** Anything else is dropped, except `system:error` sent to a single player or the board, which shows that error text.
- **Clients may only send `game:*` actions.** A bare type like `"vote"` arrives as `"game:vote"`, and reserved namespaces (`room:`, `system:`, `connection:`, `webrtc:`) are refused.
- **Clients should handle `game:sync_state`** by replacing their whole local state with `payload.state`. The platform sends it on reconnects, late joins and Refresh.
- **Retries are safe.** If a client sends `meta.messageId`, Cloud hosting runs an action with the same ID only once.
- **Messages are capped at 5 MB.** Keep them far below that: phones re-render on every message.

## Disconnects and recovery

Phones lock, switch apps and lose Wi-Fi all the time. The platform holds a seat open while its player is away:

| Where the room is | Seat held for |
|---|---|
| Lobby | 1 minute |
| Mid-game | 10 minutes |

During that window, the player's seat, VIP status and place in your state are untouched. You get `onDisconnect`, then `onReconnect` if they return, and the platform sends them a fresh snapshot. If they don't return in time, you get `onPlayerLeave`.

**Players who come back keep their ID.** Whether they left on purpose, were kicked, or dropped for longer than the grace period, rejoining the room gives them the same player ID. You'll see `onPlayerJoin(id, …)` with an ID you already handled in `onPlayerLeave`, and their Tonight totals continue. The platform recognizes them in this order:
1. the same phone;
2. a token their phone keeps for the party;
3. on a new phone, the same name as exactly one player who isn't seated or connected.

Design for gaps: a game shouldn't stall forever waiting on one missing phone. Skip their turn after a timeout, or let the VIP skip them.

### Checkpoints (Local hosting)

In Local hosting the engine lives in the host's tab, so a reload would lose the game. To prevent that, the platform saves a checkpoint every time your engine **broadcasts** `game:sync_state`:

```js
this.broadcastRoomUpdate({ type: 'game:sync_state', payload: { state: this.state } });
```

When the host's tab comes back, the platform creates a fresh instance, runs `onInit`, replaces `this.state` with the checkpoint, and sends everyone a snapshot from `getBoardState` / `getPlayerState`.

What this means for you:

- **Broadcast `game:sync_state` after every meaningful change** if you want reload recovery. Broadcasts with other types (like `game:update`) aren't checkpointed.
- **Only `this.state` is restored.** Fields on `this` outside `state` and running timers are gone. For timed rounds, store the deadline in state (`roundEndsAt: Date.now() + 60000`), let clients render the countdown from it, and check it on the next action instead of relying on a timer that might not exist.
- **The checkpoint is the broadcast,** so it reaches every phone. For games with secrets, see [Known gaps](#known-gaps).

Cloud hosting doesn't need checkpoints: the engine lives on our servers and survives any client reloading.

## Testing locally

```bash
npm run sandbox            # board + players on one page
npm run sandbox -- -6      # with 6 players
npm run sandbox:dev        # skip the build
```

The sandbox follows the platform's lifecycle:
- it introduces only players (never the board) to `onPlayerJoin`;
- it runs `onReconnect` and then sends a snapshot on refresh;
- it adds the `game:` prefix to bare action types and refuses reserved ones;
- it calls `destroy()` on reset.

It also has the tools a real room can't give you:
- **Network** lag per phone, and **Disconnect** / **Reconnect** to drop a phone mid-game: `onDisconnect`, then `onReconnect` with a snapshot and the actions it queued.
- **🔍 State**: a timeline of `this.state` after every action, join and timer, with what changed, what each screen would receive (`getBoardState` / `getPlayerState`), and **⏪ Rewind** to any point.
- **Hot reload** with `npm run sandbox:dev`: save the engine and it reloads without losing the game.

See [Running the sandbox](../packages/devkit/README.md#running-the-sandbox).

What it can't reproduce is the Cloud runtime. It runs your engine directly in Node, so it won't catch blocked `fetch` hosts, slow hooks or non-JSON state. Scaffolded projects bundle the engine for the browser, so `npm run build` *does* fail on `require` and Node APIs like `fs`. Before releasing, check the rest of the [runtime rules](#runtime-rules) yourself. The best test is to host a testing build both ways.

## Known gaps

- **Checkpoints and secrets conflict.** Local-hosting recovery requires broadcasting your full state, which sends it to every phone. A game with hidden information currently has to choose between reload recovery and secrecy.
- **Local and Cloud differ** on when `onPlayerLeave` fires (see [Lifecycle](#lifecycle)).
- **The sandbox doesn't enforce** Cloud's runtime rules or `game.config.json` player limits.

## Checklist

- [ ] `this.state` is set in `onInit` and is plain JSON.
- [ ] Every timer is cleared in `destroy`.
- [ ] No game data in module-level variables. It all lives in `this.state`.
- [ ] `processAction` validates the sender and the payload, and never throws on bad input.
- [ ] Secrets go out with `sendMessageToPlayer` and are left out of `getPlayerState`.
- [ ] Both apps handle `game:sync_state` by replacing their state.
- [ ] Timed rounds store deadlines in state rather than relying on timers alone.
- [ ] A missing player can't stall the game forever.
- [ ] The game ends with `this.gameOver(...)`, and gameplay actions are ignored while `this.isGameOver` is true.
- [ ] `onPlayerJoin` handles a returning player's ID, and `onPlayerLeave` keeps data you'd want back.
- [ ] No hook takes more than a few milliseconds.
