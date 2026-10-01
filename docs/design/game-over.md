# Design: game over, results and party history

> **Status: phases 1 and 2 implemented** (SDK 1.2.0, devkit 1.1.0, and the platform). Only the "Later" items (anything needing cloud storage) remain.
> Developer docs: [Ending a game](../engine.md#ending-a-game), [Messages → room.results](../messages.md#roomresults), [When the game ends](../apps.md#when-the-game-ends).
> See [Implementation notes](#10-implementation-notes) for where phase 1 differs from this design.

## Summary

Today a game has no standard way to end. Each game draws its own winner screen, the host leaves through the pause menu, and nothing remembers who won.

This design adds:

1. **`this.gameOver(results)`**, one call in the engine that tells the platform the game is finished and who won (modeled on Rune's `gameOver`). It supports individual players and teams.
2. **A results screen owned by the platform.** It's a modal over the game on every screen (like the pause menu), shown after a short delay. The board shows who won ("Red team wins!") and each phone shows that player's own result ("You won!"). The host and VIP get *Play again* / *Pick another game*.
3. **An optional `onPlayAgain()` hook**, so a game can restart in place and keep anything it wants across rounds.
4. **Party history:** every finished game is recorded for the party, giving a "Tonight" scoreboard ranked by wins, then points. Players keep their place on it if they drop out and come back. Nothing is stored in the cloud.

A game that never calls `gameOver` keeps working exactly as it does today.

## Goals

- One line for a developer to get a polished, consistent ending.
- Players always know who won, how *they* did, and what happens next, on the TV and on their phone.
- The host or VIP decides what's next without hunting through menus.
- A party feels like one evening: a running scoreboard across different games, which follows players who drop out and return.
- Works the same in Local and Cloud hosting, and in the devkit sandbox.

## Non-goals (for now)

- Cloud accounts, global leaderboards or cross-device stats.
- Ratings or matchmaking.
- Saving a game in progress to finish another night, or continuing a party after the host's board is gone.

---

## 1. The engine API

### `this.gameOver(results)`

**Individual players.** Each player's value is a score, an outcome, or both:

```js
// Scores: the highest score wins (ties share a place, and all count as wins).
this.gameOver({
  players: { [annId]: 42, [boId]: 37, [cyId]: 42 },
  summary: 'Ann and Cy tied on the final round!',
});

// Win/lose: no scores.
this.gameOver({
  players: { [annId]: 'WON', [boId]: 'LOST', [cyId]: 'LOST' },
});

// Both: outcomes decide who won, and scores are shown.
this.gameOver({
  players: {
    [annId]: { outcome: 'WON', score: 12 },
    [boId]: { outcome: 'LOST', score: 15 },
  },
});

// Cooperative: everyone won (or everyone lost).
this.gameOver({
  players: { [annId]: 'WON', [boId]: 'WON', [cyId]: 'WON' },
  summary: 'The crew escaped with 3 seconds left.',
});

// Golf-style: the lowest score wins.
this.gameOver({
  players: { [annId]: 3, [boId]: 7 },
  lowerScoreWins: true,
});
```

**Teams.** Each team gets a result; every player on a winning team gets the win:

```js
this.gameOver({
  teams: [
    { name: 'Red team', color: '#ef4444', players: [annId, boId], outcome: 'WON' },
    { name: 'Blue team', color: '#3b82f6', players: [cyId, deeId], outcome: 'LOST' },
  ],
  summary: 'Red found the assassin card last.',
});

// Team scores, plus optional individual scores to show who carried the team.
this.gameOver({
  teams: [
    { name: 'Red team', players: [annId, boId], score: 9 },
    { name: 'Blue team', players: [cyId, deeId], score: 7 },
  ],
  players: { [annId]: 6, [boId]: 3, [cyId]: 4, [deeId]: 3 },
});
```

| Field | Type | Rules |
|---|---|---|
| `players` | object | Keys are player IDs (the same IDs as `meta.playerId`). Each value is a **score** (finite number), an **outcome** (`'WON'`, `'LOST'` or `'TIE'`), or `{ outcome?, score? }` with at least one of the two. **Required unless `teams` is given.** With `teams`, it only adds individual scores for display; any outcomes in it are ignored. |
| `teams` | array | Each team is `{ name, players, outcome?, score?, color? }`. `name` is up to 40 characters, `players` is a non-empty array of player IDs, and each team needs an `outcome` or a `score`. `color` is an optional CSS hex color for the results screen. A player can be on only one team. |
| `summary` | string, max 140 | One line under the winner on the results screen: the story of the ending. |
| `lowerScoreWins` | boolean | Rank scores ascending instead of descending. Default `false`: **the highest score wins**. |
| `delayMs` | number, 0–10000 | How long to wait before the results screen appears. **Default `1500`**, a short beat so the game's final moment lands. Use `0` for instant, or longer if you play your own ending animation. |

### How results are ranked

Everything is ranked the same way, whether the entries are players or teams:

| Results contain | Winner(s) | Ranking |
|---|---|---|
| Scores only | The best score: highest by default, lowest with `lowerScoreWins`. Ties share 1st and **all count as wins**. | By score. Ties share a place, and the next place is skipped (1, 1, 3). |
| Outcomes only | Everyone with `'WON'`. If nobody won, everyone with `'TIE'`. | `WON` first, then `TIE`, then `LOST`. |
| Both | By outcome | By outcome, then by score within each outcome |

**With teams**, the teams are ranked, then every player takes their team's place and outcome. When Red beats Blue, Ann and Bo both rank 1st and get a win; Cy and Dee both rank 2nd.

### Rules

- Call it **once** per game. Later calls are ignored with a console warning until the game restarts.
- **Every seated player should appear**, in `players` or on a team. Seated players you leave out are recorded as *didn't finish*. IDs that aren't seated are ignored.
- **Invalid results are rejected** with a console warning naming the problem, and the game carries on as if `gameOver` was never called. That covers no `players` or `teams`, a value that isn't a score or outcome, a player on two teams, or an over-long `summary`. The devkit sandbox shows the warning on screen.
- After `gameOver`, **your engine keeps running**. The board can keep showing your own end screen behind the modal, and `processAction` still receives actions. Most games should ignore gameplay actions once `this.isGameOver` is true.

### `this.isGameOver`

A read-only boolean: `true` from `gameOver()` until the game restarts.

### `onPlayAgain()`: optional hook

Called when the host or VIP chooses **Play again**, *if your engine defines it*:

```js
onPlayAgain() {
  // Keep the players and anything you want across rounds; reset the rest.
  for (const player of Object.values(this.state.players)) player.score = 0;
  this.state.round = 1;
  this.state.phase = PHASE.PLAYING;
  this.state.firstPlayer = nextInOrder(this.state.firstPlayer); // rotate who goes first
  this.sync();
}
```

| If your engine… | Play again does |
|---|---|
| **Defines `onPlayAgain`** | Calls it on the **same** engine instance. State, timers and the apps' iframes stay; `isGameOver` resets to `false`. `onGameStart` is **not** called again. |
| **Doesn't define it** | Starts a **fresh** engine, as if the game had been picked again: a new instance, `onInit`, `onPlayerJoin` for everyone, then straight into `onGameStart` without stopping in the lobby. The apps' iframes reload. |

Both paths check the player count first. If players left and the count no longer fits `players.min`, Play again is disabled with the usual "Needs 3–8 players (you have 2)".

### Players can come back

With this design, a player who leaves and rejoins gets **their original player ID back** (see [Identity](#identity-who-counts-as-the-same-player)). Your engine sees `onPlayerLeave(id)` and later `onPlayerJoin(id, name, isLateJoin)` with the **same** ID. If you kept their data instead of deleting it in `onPlayerLeave`, they pick up where they left off.

### Changes to `BaseGameEngine` (SDK 1.2.0)

```ts
type Outcome = 'WON' | 'LOST' | 'TIE';
type PlayerResult = number | Outcome | { outcome?: Outcome; score?: number };

export interface TeamResult {
  name: string;
  players: string[];
  outcome?: Outcome;
  score?: number;
  color?: string;
}

export interface GameOverResults {
  players?: Record<string, PlayerResult>;
  teams?: TeamResult[];
  summary?: string;
  lowerScoreWins?: boolean;
  delayMs?: number;          // default 1500
}

export interface EngineDependencies {
  // ...existing...
  reportGameOver?: (results: GameOverResults) => void;   // injected by the platform
}

abstract class BaseGameEngine {
  public get isGameOver(): boolean;
  public gameOver(results: GameOverResults): void;        // validates, sets isGameOver, calls deps.reportGameOver
  public onPlayAgain?(): void;                            // optional hook
}
```

`gameOver()` validates in the SDK, so developers get the error where they made it. The platform validates again, because engines are untrusted.

---

## 2. What players see

### The results screen

A modal over the game iframe on every screen, the same layer as the pause menu. It appears `delayMs` after `gameOver` (1.5 s by default).

**On the board (TV):** who won, for the whole room.

```
┌──────────────────────────────────────────────────────────┐
│                     🏆  Ann wins!                         │
│        Ann and Cy tied on the final round!               │
│                                                          │
│   [ This game ]  [ Tonight ]                             │
│                                                          │
│    1st   Ann ................. 42      🏆 2 wins tonight  │
│    1st   Cy .................. 42      🏆 1 win tonight   │
│    3rd   Bo .................. 37                         │
│    —     Dee ............ didn't finish                   │
│                                                          │
│        [ ▶ Play again ]    [ Pick another game ]         │
│                                             [ Hide ⌄ ]   │
└──────────────────────────────────────────────────────────┘
```

**On the board, team game:** the team headline, with players grouped under their team.

```
┌──────────────────────────────────────────────────────────┐
│                 🏆  Red team wins!                        │
│           Red found the assassin card last.              │
│                                                          │
│    1st  ■ Red team ..................... 9               │
│            Ann 6 · Bo 3                                  │
│    2nd  ■ Blue team .................... 7               │
│            Cy 4 · Dee 3                                  │
│                                                          │
│        [ ▶ Play again ]    [ Pick another game ]         │
└──────────────────────────────────────────────────────────┘
```

**On a phone:** that player's own result first, always phrased as *you*.

```
Individual game            Team game, won            Team game, lost
┌────────────────────┐     ┌────────────────────┐    ┌────────────────────┐
│  You placed 3rd     │     │  🏆 You won!        │    │  You lost           │
│  Ann and Cy win     │     │  ■ Red team         │    │  ■ Blue team        │
│                    │     │                    │    │  Red team won       │
│  1st Ann 42         │     │  1st Red  9         │    │                    │
│  1st Cy  42         │     │  2nd Blue 7         │    │  1st Red  9         │
│ ▶3rd You 37         │     │                    │    │ ▶2nd Blue 7         │
│                    │     │ Waiting for Ann…    │    │ Waiting for Ann…    │
└────────────────────┘     └────────────────────┘    └────────────────────┘
```

- **Board headline:** "Ann wins!", "Ann and Cy win!", "Red team wins!", "Everyone wins!" (all `WON`), "Nobody made it" (all `LOST`), or "It's a tie!".
- **Phone headline**, from that player's own result:
  - "🏆 You won!" (including a shared 1st, or being on a winning team);
  - "You placed 3rd";
  - "You lost" (with the team that won underneath, in team games);
  - "It's a tie";
  - "You didn't finish this one".
- **Tabs:**
  - *This game* shows the ranking above.
  - *Tonight* shows the [party scoreboard](#tonight-scoreboard).
- **Actions:**
  - The **board and the VIP** see *Play again* and *Pick another game*.
  - Everyone else sees "Waiting for *VIP name*…".
  - *Play again* is disabled, with the reason, if the player count no longer fits.
- **Hide:** each screen can collapse the modal to a small "🏆 Results" pill, to look at the game's own end screen, and reopen it. This is per-screen and doesn't affect anyone else.
- **Persistence:** the results live in room state, so a phone that reconnects or a board that reloads comes back to the same screen.
- **Pause menu:** while results are showing, "Back to Lobby" does the same as *Pick another game*.

### Results inside your own game

Each player's personal result is also in room state, so a game's own UI can use it. For example, the phone app could show "You won!" in the game's style before the modal appears:

```js
// In the player app, from room:update:
const mine = room.results?.byPlayer[me];   // { rank, outcome: 'WON', score, team: 'Red team' }
```

See [New room state](#new-room-state).

### What happens next

```
                         gameOver()
                             │  (1.5 s)
                             ▼
                      ┌─────────────┐
                      │   RESULTS   │  modal on every screen, game recorded
                      └─────┬───────┘
          Play again        │        Pick another game
     ┌──────────────────────┴──────────────────────┐
     ▼                                             ▼
 onPlayAgain() on the same engine            back to the lobby
 (or a fresh engine, straight to start)      (game picker, party intact)
     │                                             │
     ▼                                             ▼
  PLAYING ...                                   LOBBY → pick → start → PLAYING
```

---

## 3. How it flows through the platform

### Recording a game over

```
Cloud hosting                                  Local hosting
─────────────                                  ─────────────
engine.gameOver(results)                       engine.gameOver(results)
  │ (isolate) $emit("gameover")                  │ (host worker) postMessage({ type: "gameover" })
  ▼                                              ▼
Room.recordGameOver(results) ◄── room:game_over ── host's RoomContext (board only)
  │  validate · rank (teams → players) · attach names
  │  room.results = …   room.party.games.push(…)
  ▼
broadcastState()  →  room:update { room: { …, results, party } }  →  every screen
                                                                       │
                                     GameViewer shows the results modal ┘
```

- **Cloud:** the sandbox gives the engine a `reportGameOver` that emits a new `gameover` kind across the isolate boundary, the same way `broadcast` and `player` messages cross today. `Room` handles it directly.
- **Local:** the host worker forwards it to the board's `RoomContext`, which sends `room:game_over`. The server accepts it **only from the board**, like `room:checkpoint`, because the host is trusted with its own party.
- **Either way, `Room.recordGameOver` is the single place that validates, ranks and records.**

### New room state

```js
room = {
  // ...existing fields...
  phase: 'lobby' | 'playing' | 'results',
  results: {                                   // null unless phase === 'results'
    gameId, gameName, version,
    endedAt, durationMs, showAt,               // showAt = endedAt + delayMs
    summary, lowerScoreWins,
    headline: 'Red team wins!',
    teams: [ { name, color, rank, outcome, score, players: [playerId] } ],   // [] for individual games
    standings: [ { playerId, name, rank, outcome, score, team } ],          // every player, individually
    byPlayer: { [playerId]: { rank, outcome, score, team } },               // quick lookup for "my" result
    didNotFinish: [ { playerId, name } ],
  },
  party: {
    id,                                        // a UUID per party
    startedAt,
    gamesPlayed,
    standings: [ { playerId, name, wins, points, gamesPlayed, seated } ],
    recent: [ { gameName, headline, endedAt } ],     // last 10, for the Tonight tab
  },
}
```

Game iframes already receive `room:update`, so **apps can read `room.results` and `room.party` too**. No new message type reaches the apps.

### New platform messages

| Message | From → to | Purpose |
|---|---|---|
| `room:game_over` `{ results }` | Board → server (Local only) | Report the host engine's results. Refused from anyone but the board. |
| `room:play_again` | Board or VIP → server | Restart the same game. |
| `room:end_game` *(exists)* | Board or VIP → server | Pick another game: back to the lobby. |
| `room:play-again` `{ mode: 'hook' \| 'fresh' }` | Server → board (Local only) | Tells the host worker to call `onPlayAgain`, or to report it has none so the server can start a fresh engine. |

---

## 4. Party history

### What a party is

A **party** is one room, from the moment the host creates it until the room closes. It might be one game or ten. Each party gets a `partyId` (UUID).

**A party ends with its board.** If the host closes the party, or the board disconnects and doesn't return within its grace period (10 minutes today), the room and its party are gone. Hosting again starts a **new party from scratch**, with an empty scoreboard. A board that reloads or briefly drops *within* the grace period reconnects to the same room, and the party carries on.

### Identity: who counts as the same player

The scoreboard follows **people**, not connections. A player keeps one **party member ID** for the whole party, and that is the player ID the engine sees.

| What happened | How they come back | Same ID? |
|---|---|---|
| **Connection dropped** (phone locked, Wi-Fi blip) | Automatically, within the grace period (1 minute in the lobby, 10 mid-game), exactly as today | Yes, same seat |
| **Dropped for longer than the grace period** (the seat was released) | They rejoin with the room code | Yes, mapped back |
| **Left on purpose**, then rejoined | They rejoin with the room code | Yes, mapped back |
| **Kicked**, then rejoined | They rejoin with the room code | Yes, mapped back (the host can kick again) |
| **New phone, or cleared their browser** | They rejoin with the room code *and the same name* | Yes, matched by name (see below) |

**How mapping back works.** Every seat already has a secret reclaim token stored on the player's phone. Today that token dies with the seat. In this design it becomes a **party membership token**:

- **The server keeps it:** `room.party.members` keeps every player who has been seated: their ID, name and membership token. Members stay after their seat is released.
- **The phone keeps it:** the phone stores the token per party, and no longer deletes it when the player leaves or is kicked.
- **On `room:join`, the server looks for an existing member, in this order:**
  1. The phone's player ID matches a member. It's the same phone, with the same session.
  2. The phone presents a member's membership token.
  3. **By name, as a last resort:** exactly one member who is *not currently seated* has the same name (ignoring case and surrounding spaces). This covers a new phone or cleared storage.
- **If one matches**, the player gets that member's ID back. Otherwise they're a new member.

Name matching never takes over a seat that's in use: if "Ann" is still seated, a second "Ann" becomes a new player. The scoreboard shows two people with the same name the way the lobby already does.

**What the engine sees:** `onPlayerLeave(id)` when the seat is released, then `onPlayerJoin(id, name, isLateJoin)` with the **same** `id` when they're back. The game decides whether to restore their in-game data (see [Players can come back](#players-can-come-back)); the party scoreboard always keeps theirs.

### What's recorded

For every game that calls `gameOver`:

```js
{
  gameId, gameName, version,
  startedAt, endedAt,
  headline, summary,
  teams: [ { name, rank, outcome, score, players } ],
  standings: [ { playerId, name, rank, outcome, score, team } ],
  didNotFinish: [ { playerId, name } ],
}
```

Games that end without `gameOver` (the host backs out to the lobby) are recorded as **played, no result**. They count toward the party's games played, but not toward anyone's wins or points.

### Tonight scoreboard

**Ranked by wins, then points.**

| Column | Rule |
|---|---|
| **Wins** | Games where you placed 1st. A shared 1st counts for everyone sharing it, a team win counts for every player on the team, and a cooperative win counts for everyone. By default the highest score wins, so the top scorer gets the win. |
| **Points** | Per game, one point for each player you finished ahead of. Winning a 6-player game earns 5; on the winning team of a 2-vs-2, each player earns 2. *Didn't finish* earns 0. |
| **Played** | Games you were part of (finished or not) |

Ties on both wins and points share a place. Players who left stay on the scoreboard (dimmed) so their wins still count, and they light up again if they rejoin.

### Where it's stored

There's no cloud storage.

| Where | Holds | Lifetime |
|---|---|---|
| **The room server's memory** (`room.party`) | The live party: members, every game record, the scoreboard | Until the room closes. This is the source of truth while the party runs. |
| **Each player's phone** | Only that player's membership token for the party | Until the party ends (expires with the room-record TTL) |
| **The host's device** (`localStorage`) | An archive of finished parties, written as the party updates | For phase 2 stats only (*Game nights*). **Never used to restore a party.** |

**Host archive:**

| Key | Holds |
|---|---|
| `boardgames.parties` | Index: `[ { id, startedAt, updatedAt, gamesPlayed } ]` |
| `boardgames.party.<partyId>` | That party's game records and player names (no tokens) |

- **Retention:** the 20 most recent parties, and nothing older than 90 days. At most 200 games per party, which is well under 100 KB.
- **Privacy:** player names stay on the host's device. Clearing site data removes the archive.

### Stats

| Phase | Stat | Where |
|---|---|---|
| 1 | Tonight: wins, points, games played; most-played game; party length | Results modal, *Tonight* tab |
| 2 | **Night summary** when the host closes the party: winner of the night, every game played, highlights (longest win streak, closest finish) | Shown on the board at *Close Party* |
| 2 | **Game nights** page: past parties on this device, per-game play counts and average length | Host's device, from the archive |
| Later (needs a decision) | Anything across devices or for developers | Would need opt-in cloud storage. Out of scope. |

---

## 5. Developer experience

- **Scaffold:** the starter engine calls `gameOver` instead of drawing its own winner screen, implements `onPlayAgain`, and keeps a returning player's score in `onPlayerJoin`.
- **Sandbox:** the devkit harness gets the same flow: a results overlay on the board and on each phone (team and individual layouts), *Play again* / *Pick another game* driving `onPlayAgain` or a fresh engine, a *Tonight* tab kept in memory, and invalid-results warnings shown on screen. A **Leave / Rejoin** control per player exercises the identity mapping.
- **`validate`:** warns when the engine never calls `gameOver` (a source search), since the game then gets no results screen or party history. It also checks that `onPlayAgain`, if present, is a function, and runs a sample `gameOver` through the same validation the platform uses.
- **Docs:**
  - [engine.md](../engine.md) gets an "Ending a game" section (players, teams, play again), plus "Players can come back" in the lifecycle.
  - [messages.md](../messages.md) gets `room.phase`, `room.results` and `room.party`.
  - [apps.md](../apps.md) gets "What to show when the game ends" and using `results.byPlayer`.
  - [troubleshooting.md](../troubleshooting.md) gets "Results screen never appears", "Play again starts from the lobby" and "A returning player got a new ID".

## 6. Compatibility

- **Games that don't call `gameOver`** behave exactly as today. The host ends them from the pause menu, and they're recorded as *played, no result*.
- **SDK version:** `gameOver` needs `@dallincreates/boardgame-server` 1.2.0 or newer. Engines built with older SDKs simply never call it, and they ignore the platform's extra `reportGameOver` dependency.
- **Mixed versions during rollout:** if a 1.2 engine runs where the platform hasn't shipped yet, `gameOver()` finds no `reportGameOver`, logs a warning, and returns. The game's own end screen still shows.
- **Returning players keeping their ID** changes what existing engines see. A rejoining player used to arrive with a new ID; now `onPlayerJoin` can receive an ID the engine already removed in `onPlayerLeave`. Engines that rebuild the player on join (as the starter does) are unaffected. An engine that assumed IDs never repeat could double-count, so the release notes will call this out.

## 7. Edge cases

| Case | Behavior |
|---|---|
| `gameOver` called before `onGameStart` | Rejected with a warning. |
| A player leaves during results | They stay in this game's results. Play again rechecks the count. |
| A player joins during results | New players are seated and see the results modal; returning players get their old ID back. Either way, they join the next game via `onPlayerJoin` (hook path) or the fresh engine. |
| The VIP leaves during results | VIP passes as it does today, and the new VIP gets the buttons. |
| The board reloads during results (within its grace period) | Results are in room state; the board comes back to the modal. Local hosting restores the engine from its checkpoint. |
| The board is gone past its grace period | The room and party end. Hosting again is a new party from scratch. |
| The engine crashes or is shut down (Cloud limits) after `gameOver` | Results are already recorded; Play again uses a fresh engine. |
| Results name a player who left before `gameOver` | Ignored (not seated), so they show as absent from this game. |
| A player is on two teams, or a team lists an unseated player | Two teams: rejected. Unseated: that ID is ignored. |
| Two `gameOver` calls | The second is ignored with a warning. |
| `delayMs` and a reconnect | Uses `showAt`, so a reconnecting phone shows the modal immediately if the delay has passed. |
| Two seated players with the same name | Allowed. Name matching only ever maps to a member who isn't seated, and only when exactly one matches. |

## 8. Implementation plan

**Phase 1: game over, teams, results, play again, Tonight, returning players (SDK 1.2.0)**

| Area | Work |
|---|---|
| SDK `server` | `gameOver` (players and teams), `isGameOver`, `onPlayAgain?`, types, SDK-side validation and default `delayMs` |
| Platform `service/games/engineSandbox.js` | Inject `reportGameOver`; new `gameover` emit kind; expose `onPlayAgain` |
| Platform `service/roomSystem/room.js` | `recordGameOver` (validate, rank teams then players, record), `phase`, `results`, `party` with members, `playAgain` (hook or fresh); `removePlayer` keeps the member |
| Platform `service/roomSystem/roomSystem.js` | `room:game_over` (board only), `room:play_again` (board/VIP); `roomJoin` maps returning players (ID, membership token, then name) |
| Platform `src/workers/hostEngineWorker.js` | Inject `reportGameOver`; handle `room:play-again` |
| Platform `src/context/RoomContext.jsx` | Forward worker game-over; `playAgain()`; keep the membership token per party on leave/kick; archive parties on the host |
| Platform `src/components/GameViewer/` | New `GameResultsDialog` (board, phone and team layouts, Tonight tab, Hide pill); pause-menu tie-in |
| SDK `devkit` | Sandbox results overlay, play-again flow, Leave/Rejoin control; `validate` checks |
| SDK `create` | Starter engine uses `gameOver` and `onPlayAgain` |
| Docs | Sections listed in [Developer experience](#5-developer-experience) |

**Phase 2: night summary and Game nights page.**
**Later: anything needing cloud storage, if ever.**

## 9. Decisions

| Question | Decision |
|---|---|
| How is Tonight ranked? | **Wins, then points.** The highest score wins by default, so the top scorer gets the win. |
| Should results appear instantly? | **After a short delay:** `delayMs` defaults to 1500 ms. Games can set 0–10000. |
| What if the room server loses the room (the board is gone)? | **Start from scratch.** The party ends with its board; the host's archive is for stats only. |
| A player left and rejoined? | **Same player ID**, via the party membership token, with name matching as a fallback. |
| A player disconnected and came back? | **Same seat and ID**, as today within the grace period; mapped back like a rejoin after it. |
| Teams? | **Supported in v1.** The board shows the team result ("Red team wins!"); each phone shows that player's own result ("You won!" / "You lost"). A team win counts as a win for every player on the team. |

**Assumed unless you say otherwise:**

- **Who can press Play again:** the board and the VIP, the same as Start.
- **Calling `gameOver`:** encouraged, not required. `validate` warns when a game never calls it.
- **Party history:** only the host's device keeps it; phones keep just their membership token.

## 10. Implementation notes

Phase 1 follows this design, with these differences and details:

- **`validate`** searches `src/engine/` for a `gameOver(` call and checks that `onPlayAgain` is a method. It doesn't run a sample `gameOver`, because it can't know what results a game would report.
- **`beginPlayAgain()`** is a `BaseGameEngine` method the platform calls for Play again: it clears `isGameOver`, then runs `onPlayAgain`. Developers implement `onPlayAgain`, not this.
- **Ranking with outcomes:** within the same outcome, scores order players (a losing 15 ranks above a losing 9), and earn points for players beaten.
- **The ranking module is in two copies** with identical logic: the platform's `service/roomSystem/gameResults.js` and the sandbox's `packages/devkit/src/sandbox/game-results.js`. The SDK's `validateGameOverResults` checks the shape only.
- **The membership token is the seat's existing reclaim token**, now kept per party member. Phones store it per room code for 12 hours (`boardgames.partyMembers`) and no longer clear it on leave or kick.
- **Results timing** uses the server's `showAt`, but a device never waits longer than `delayMs`, so clock drift can't hold the screen back.
- **The devkit sandbox's results overlay** sits over the whole harness. It shows the board's view, plus each phone's personal headline in a list, rather than an overlay in every phone frame.

### Phase 2

- **Night summary:** when the board confirms **Close Party** after at least one game, the TV shows the night's summary first, with **Close party** and **Keep playing**. It shows:
  - the winner or winners of the night;
  - the number of games and how long the night ran;
  - highlights: the longest win streak, the closest finish (smallest score gap between 1st and 2nd, or a tie, in individual score games) and the most-played game (two or more plays);
  - the final standings;
  - every game with its result.

  It reads the host's archive, falling back to room state (the last 10 games) if storage is blocked.
- **Phones when the host closes:** the room now closes with reason `host_closed` instead of `board_disconnected`, so phones say "The host closed the party. Thanks for playing!" plus their own night, e.g. "You finished 2nd tonight with 2 wins in 4 games." A board that never comes back still reads as a disconnect.
- **Game nights page** (`/game-nights`, linked from the account menu and My Library) shows:
  - totals across every night on the device;
  - the most-played games, with average length;
  - night champions;
  - every night, expandable to its full summary;
  - **Clear history**.

  Players are matched across nights by name, ignoring case.
- **Archive changes:**
  - parties are only saved once a game has been played;
  - games that ended without results are archived too, via `party.recent`, which now carries `gameId` and `startedAt`;
  - a result game's party record and `room.results` share one `endedAt`.
- **Streaks** count consecutive games *with results*. A game that ended without one doesn't break or extend a streak.
