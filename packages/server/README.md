# @dallinking/boardgame-server

The authoritative backend engine for the Dallin King Boardgames SDK.

This package provides the base classes and TypeScript interfaces required to write state-driven, turn-based game logic that seamlessly synchronizes between a central Host Board and multiple Mobile Player controllers.

## Instalization

```bash
npm install @dallinking/boardgame-server
```

## Usage: Creating a Game Engine

To build a game, create a class that extends BaseGameEngine. This class acts as your authoritative server. It catches actions sent by the frontends, updates the internal state, and automatically broadcasts the changes.

```node
import { BaseGameEngine, ActionMeta, GAME_STATUS } from '@dallinking/boardgame-server';

export class MyCustomGame extends BaseGameEngine {
  constructor(deps) {
    super(deps);
    // Initialize your custom state
    this.state = {
      status: GAME_STATUS.LOBBY,
      score: 0
    };
  }

  // Hook: Triggered when the Host clicks "Start Game"
  onGameStart() {
    super.onGameStart();
    this.state.status = GAME_STATUS.PLAYING;
    this.syncState();
  }

  // Core Router: Handle actions sent by the React frontends
  processAction(actionType: string, payload: any, meta: ActionMeta) {
    switch (actionType) {
      case 'PLAYER_SCORED':
        // The 'meta' object is securely injected by the SDK
        if (meta.isBoard) return; // Ignore if the board tries to score
        
        this.state.score += payload.points;
        this.syncState();
        break;
        
      default:
        console.warn(`Unhandled action: ${actionType}`);
    }
  }

  // Utility to push state to all connected screens
  private syncState() {
    this.broadcastRoomUpdate({
      type: 'game:update',
      state: this.state
    });
  }
}
```

## The ActionMeta Object

Every action processed by your engine automatically receives a secure meta object injected by the room system. This prevents client-side spoofing and makes authorization checks effortless.

```node
interface ActionMeta {
  playerId: string;    // The unique ID of the sender
  isBoard: boolean;    // True if the action came from the Host Screen
  isVip: boolean;      // True if the sender is the Room VIP (first to join)
  timestamp: number;   // Epoch timestamp of the action
}
```

## Built-in Utilities

This package also exports common, highly optimized utilities for tabletop mechanics:

- shuffle(array): Cryptographically safe array shuffler.
- ensurePlayer(state, id): Safely initializes a player in your state object.
- GAME_STATUS / MESSAGE_TYPE: Standardized string constants for routing.