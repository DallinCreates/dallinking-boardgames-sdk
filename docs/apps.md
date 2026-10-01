# Building the board and player apps

Your game has two front ends:

| App | Entry | Runs on | Its job |
|---|---|---|---|
| **Board** | `board.html` → `src/board/` | The shared screen: a TV, laptop or projector | Show the game to the room |
| **Player** | `player.html` → `src/player/` | Each player's phone | Let one player act |

Both are ordinary web apps (React in the scaffold) that the platform loads in an iframe. Neither holds the real game state: they send actions to your [engine](./engine.md) and draw whatever it broadcasts.

## Wiring

```jsx
import { BoardgameProvider } from '@dallincreates/boardgame-client';

createRoot(document.getElementById('root')).render(
  <BoardgameProvider>
    <App />
  </BoardgameProvider>
);
```

`BoardgameProvider` connects the iframe to the platform. Inside it, `useBoardgame({ onMessage })` gives you `send()` and calls `onMessage` for every incoming [message](./messages.md). See the [client README](../packages/client/README.md) for the full API.

Scaffolded projects add one more layer, `GameStateProvider` in `src/shared/GameState.jsx`, so components can simply read:

```jsx
const { state, me, isVip, room, error, send } = useGameState();
```

| Value | From | Meaning |
|---|---|---|
| `state` | `game:sync_state` | The engine's latest state, or `null` until the first one arrives |
| `me` | `room:update` → `clientId` | This screen's ID: the key for "my" data in `state` |
| `isVip` | `room.players` | Whether this phone runs the party |
| `room` | `room:update` | Code, players, names, connection status |
| `error` | `system:error` | The last error, cleared by the next state update |
| `send` | `useBoardgame` | Sends an action to the engine |

## Showing state

Render from `state`, never from your own guesses about what the engine will do. A tap should send an action and wait for the next `game:sync_state`, not update the screen itself. That keeps every screen in agreement, and reconnecting phones recover for free.

Show something sensible while `state` is `null` (the first moments after load): a "Loading…" message is enough.

## Who am I, and am I the VIP?

`me` is the same ID your engine sees as `meta.playerId`, so if your engine keys players by ID:

```jsx
const myself = state.players[me];
```

Only the VIP (or the board) should see party controls like **Play again** or **Skip round**. Show them when `isVip` is true, and also check `meta.isVip` in the engine, because the UI isn't a security boundary.

## When the game ends

When your engine calls [`this.gameOver()`](./engine.md#ending-a-game), the platform shows its results screen over your app on every screen after a short delay. On the board it shows who won; on each phone, that player's own result. It also offers **Play again** to the host and VIP. So your apps don't need a results screen or a Play again button.

What your apps can still do:

- **Mark the moment.** In the delay before the results screen (1.5 s by default, or `delayMs`), show a final flourish: the winning word, the last card, a confetti burst.
- **Show "my" result in your own style.** `room.results.byPlayer[me]` has `{ rank, outcome, score, team, won }`; `room` arrives with every `room:update`. See [Messages → room.results](./messages.md#roomresults).
- **Keep showing the game.** The results screen can be hidden on any screen, which reveals your app underneath, so leave the final state visible.

## Designing for each screen

**Board (seen from across the room):**

- Big type: assume people are 3 meters away. Body text around 1.5rem; headings much larger.
- Nothing needs to be tapped. The host's mouse may not be near it.
- Show whose turn it is, what's happening, and the scores. Players look up at it between actions.
- Make it work at both 16:9 and other shapes: laptops, ultrawide monitors, projectors.

**Player (held in a hand):**

- One clear action at a time, with big touch targets (at least 48px).
- Portrait first, since most people hold their phones upright.
- Keep private information here, never on the board.
- Expect to be backgrounded: phones lock and switch apps. When the phone returns, the platform resends state.

## Sound and vibration

Volume, mute and vibration belong to the device, not your game. Players and the host set them once in the platform's game menu (or the toolbar's mute button), and every game follows them. So:

- **Play everything through the SDK's `audio`**: `audio.playSfx('buzz')` for effects, `audio.playMusic(url)` for background music. It applies the device's music and sound-effects volumes and mute. An `<audio>` element of your own ignores them. Don't build your own volume or mute controls.
- **Decide who hears what.** `audio.playSfx` plays on the screen that calls it. For a sound on one player's phone only, have the engine call `this.playSound(playerId, 'buzz')`; for the TV only, `this.playSound('board', 'fanfare')`. Big, shared moments belong on the board; private feedback (wrong answer, your card was played) belongs on the phone.
- **Vibrate for "your turn" and "time's running out".** From the engine: `this.notifyTurn(playerId)` and `this.notifyTimeRunningOut()`. From a phone's app: `haptics.yourTurn()` and `haptics.timeRunningOut()`. Pair it with something visible: iPhones can't vibrate from the web, and players can turn it off.
- **Music on the board, effects on the phones,** usually. Several phones playing the same music a few milliseconds apart sounds bad.

See the [client README](../packages/client/README.md#sound) for the API.

The platform also keeps every screen awake during a party, so phones don't lock between turns. Nothing to do on your side.

## What the iframe allows

Your apps run in a sandboxed iframe (`allow-scripts allow-forms`) with no same-origin access:

| Works | Doesn't work |
|---|---|
| JavaScript, React, CSS, canvas, WebGL | `localStorage`, `sessionStorage`, IndexedDB and cookies (they throw) |
| Forms and inputs | Popups and `window.open` |
| Images, audio, video and fonts from your release | Navigating the top page |
| Gamepads, audio autoplay (delegated to your iframe) | Reading the platform page or other iframes |
| Vibration and screen wake lock, through the platform (see above) | Calling `navigator.vibrate()` or `navigator.wakeLock` yourself (blocked in iframes) |

- **Remember things in the engine, not the browser.** If a phone needs to recall something, it should be in the engine's state.
- **Audio:** browsers may still require a tap before sound plays on phones. The SDK's `audio` unlocks on the first tap and starts any music that was waiting.
- **Wrap storage access in `try`/`catch`** if a library you use touches `localStorage`.

## Assets and paths

Releases are served from a versioned folder: `https://cdn.dallinking.com/boardgames/<id>/<version>/`. So:

- Keep `base: './'` in `vite.config.js` so built asset URLs are relative.
- Put static files in `public/` and reference them with relative paths: `./images/card.png`, not `/images/card.png`. A leading `/` points at the site root, not your release.
- Imported assets (`import cardUrl from './card.png'`) are handled by Vite automatically.
- Don't load assets from other sites unless you have to; your release is versioned and cached, and other sites aren't.

## Testing

```bash
npm run sandbox            # production build: what players will get
npm run sandbox:dev        # skip the build while iterating
npm run sandbox -- -6      # 6 players
```

The sandbox page shows the board and every player side by side. Use its toolbar to switch to **Board** or **Player** view and to 📱 portrait or 📟 landscape device frames, and check:

- The board reads well at full screen.
- Each phone fits in portrait without scrolling during play.
- Every phase of your game (lobby, playing, game over) looks right on both.

The sandbox also plays the platform's part for sound and vibration: its **Sound** menu picks which screens play audio (the board and the player you're looking at, by default), **🔊 Levels** sets the volumes sent to your game, and a phone that vibrates shakes on screen. Use **Network** to add lag and **Disconnect** to drop a phone, and **🔍 State** to inspect and rewind your engine's state. See [Running the sandbox](../packages/devkit/README.md#running-the-sandbox).

Then host a testing build on the real site and join from actual phones. Nothing replaces a real room.
