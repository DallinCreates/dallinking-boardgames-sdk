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
| `game:ack` | Cloud hosting | `{ messageId }`: an action was processed. Safe to ignore. |

Other `room:*` platform traffic is filtered out. Full shapes are in the [message reference](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/messages.md).

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

## Where your app runs

Your board and player apps load in a sandboxed iframe with no same-origin access. `localStorage`, `sessionStorage`, cookies and popups don't work. Keep anything worth remembering in the engine's state. See [Building the board and player apps](https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/apps.md) for the full list, design guidance and testing tips.

## API

| Export | Does |
|---|---|
| `<BoardgameProvider targetOrigin?>` | Connects its children to the platform. Wrap each app once. `targetOrigin` defaults to `'*'`. |
| `useBoardgame({ onMessage? })` | Returns `{ send }`, and calls `onMessage(msg)` for each incoming message. Must be inside `BoardgameProvider`. |
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
