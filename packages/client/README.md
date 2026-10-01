# @dallincreates/boardgame-client

The React bridge between your game's board and player screens and the [boardgames.dallinking.com](https://boardgames.dallinking.com) platform.

Your board app and player app each run in an iframe on the site. This package handles the `postMessage` plumbing: it tells the platform your app is ready, sends your actions up to the engine, and delivers the engine's messages back to you.

## Installation

```bash
npm install @dallincreates/boardgame-client
```

React 18 is a peer dependency.

## Usage

Wrap each app (board and player) in `BoardgameProvider`, then use `useBoardgame` anywhere inside it.

```jsx
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardgameProvider, useBoardgame } from '@dallincreates/boardgame-client';

function PlayerScreen() {
  const [state, setState] = useState(null);

  const { send } = useBoardgame({
    onMessage: (msg) => {
      switch (msg.type) {
        case 'game:update':      // your engine's broadcasts
        case 'game:sync_state':  // snapshot after a reconnect or refresh
          setState(msg.payload.state);
          break;
      }
    },
  });

  return <button onClick={() => send({ type: 'game:score', payload: { points: 1 } })}>Score</button>;
}

createRoot(document.getElementById('root')).render(
  <BoardgameProvider>
    <PlayerScreen />
  </BoardgameProvider>
);
```

### What reaches `onMessage`

| Type | From | Notes |
|---|---|---|
| `game:*` | Your engine | Everything it broadcasts or sends to this screen, including `game:sync_state` snapshots after a reconnect or refresh |
| `room:update`, `room:reconnected` | The platform | `{ clientId, room }`: this screen's ID and the room's players |
| `system:error` | The platform or your engine | `{ message }`: something was refused |
| `game:fx` | Your engine's `sendEffect` / `playSound` / `vibrate` / `notifyTurn` | Already played by the SDK. Handle it only to add your own flourish. |
| `game:ack` | Cloud hosting | `{ messageId }`: an action was processed. Safe to ignore. |

Other `room:*` platform traffic and all `platform:*` messages (settings) are filtered out. Full shapes are in the [message reference](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/messages.md).

### Which player is this?

`room:update` carries `clientId`: this screen's ID. On a phone it's the player's ID, the same one your engine sees as `meta.playerId`; on the shared screen it's the board's ID. Keep it in state:

```jsx
const [me, setMe] = useState(null);

useBoardgame({
  onMessage: (msg) => {
    if (msg.type === 'room:update' && msg.clientId) setMe(msg.clientId);
  },
});
```

`msg.room.players` lists everyone seated as `{ id, name, isVip, isHost, connected }`.

### `send({ type, payload, meta })`

Sends an action to the engine's `processAction`. Types without a `game:` prefix get one added by the room server, so `'score'` arrives as `'game:score'`.

The server fills in `playerId`, `isBoard`, `isVip` and `timestamp` on `meta`, overwriting anything you sent for those keys. Other keys pass through; for example, `meta.messageId` is used to drop duplicate sends.

## Sound

Play sound through `audio`, not your own `<audio>` elements. Each device has its own volume, music, sound-effects and mute settings in the platform's game menu, and `audio` applies them for you. A game can't read or change them, and doesn't need to.

```jsx
import { BoardgameProvider, audio } from '@dallincreates/boardgame-client';

// Name your sounds once (paths are relative to your app, as with images).
<BoardgameProvider sounds={{ buzz: './sounds/buzz.mp3', ding: './sounds/ding.mp3' }}>

audio.playSfx('buzz');                         // this screen only, at its sound-effects volume
audio.playSfx('ding', { volume: 0.5 });        // 0-1, scaled by the player's setting
audio.playMusic('./music/theme.mp3');          // loops at the music volume; replaces the current track
audio.stopMusic({ fadeMs: 800 });
audio.preload();                               // fetch every registered sound ahead of time
```

`playSfx` only plays on the screen that calls it. To play a sound on **one player's phone** from the engine (a buzzer for a wrong answer, say), use [`this.playSound(playerId, 'buzz')`](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/packages/server/README.md#sound-and-vibration-on-one-screen); the SDK plays it on that phone automatically.

Browsers keep audio locked until the user taps the page. The SDK unlocks it on the first tap or key press and starts any music that was waiting.

## Vibration

```js
import { haptics } from '@dallincreates/boardgame-client';

haptics.yourTurn();          // "it's your turn"
haptics.timeRunningOut();    // "hurry"
haptics.vibrate('tap');      // 'tap', 'success', 'error', 'turn', 'warning', a duration in ms, or [on, off, on, ...]
haptics.isAvailable();       // false on the board, on iPhones, or if the player turned vibration off
```

Browsers block `navigator.vibrate()` inside game iframes, so don't call it yourself: `haptics` asks the platform to vibrate the phone. Patterns are capped at 3 seconds. From the engine, use `this.notifyTurn(playerId)` and `this.notifyTimeRunningOut()` instead.

## Platform settings

`usePlatformSettings()` returns this device's settings and re-renders when they change. Use it to show a muted icon, or to skip work when sound is off:

```jsx
const { muted, masterVolume, musicVolume, sfxVolume, haptics, canVibrate } = usePlatformSettings();
```

Outside React, `platformSettings.get()` and `platformSettings.subscribe(listener)` do the same.

The platform also keeps each screen awake during a party (the Screen Wake Lock API), so phones don't lock between turns. Your game doesn't need to do anything for that.

## Where your app runs

Your board and player apps load in a sandboxed iframe with no same-origin access. `localStorage`, `sessionStorage`, cookies and popups don't work. Keep anything worth remembering in the engine's state. See [Building the board and player apps](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/apps.md) for the full list, design guidance and testing tips.

## API

| Export | Does |
|---|---|
| `<BoardgameProvider targetOrigin? sounds?>` | Connects its children to the platform. Wrap each app once. `targetOrigin` defaults to `'*'`. `sounds` maps names to URLs for `audio`. |
| `useBoardgame({ onMessage? })` | Returns `{ send, audio, haptics }`, and calls `onMessage(msg)` for each incoming message. Must be inside `BoardgameProvider`. |
| `usePlatformSettings()` | This device's sound and vibration settings. Re-renders on change. |
| `audio` | `playSfx`, `playMusic`, `stopMusic`, `registerSounds`, `preload`, `currentMusic`, `unlock`. |
| `haptics` | `vibrate`, `yourTurn`, `timeRunningOut`, `isAvailable`. |
| `platformSettings` | `get()`, `subscribe(listener)`, `isFromPlatform()`. |
| `createIframeGameBridge({ onIncomingMessage, targetOrigin? })` | The same bridge without React (below). |
| `unwrapGameMessage(data)` | Parses a raw `message` event's data into `{ type, payload, ... }`, or `null`. |

## Without React

```js
import { createIframeGameBridge } from '@dallincreates/boardgame-client';

const bridge = createIframeGameBridge({ onIncomingMessage: (msg) => { /* ... */ } });
const stop = bridge.startListening();   // also announces "system:ready" to the platform
bridge.sendToParent({ type: 'game:score', payload: { points: 1 } });
```

`unwrapGameMessage(data)` is exported too, if you need to parse raw `message` events yourself.

## License

MIT
