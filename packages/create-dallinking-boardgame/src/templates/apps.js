// The board app (shared screen), the player app (phones), and the code both
// share with the engine.

export const sharedGame = `// Shared by the engine and both apps, so action names can't drift apart.
// Keep this file plain JavaScript: the engine can't use React or browser APIs.

export const WINNING_SCORE = 10;

export const PHASE = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  GAME_OVER: 'game_over',
};

// Actions the apps send to the engine. Always prefix with "game:".
// (Play again isn't one: the platform's results screen handles it and calls
// the engine's onPlayAgain.)
export const ACTION = {
  SCORE: 'game:score',
};

// Messages the engine sends to the apps.
export const MESSAGE = {
  SYNC_STATE: 'game:sync_state',
};
`;

export const sharedGameState = `import { createContext, useContext, useMemo, useState } from 'react';
import { useBoardgame } from '@dallincreates/boardgame-client';
import { MESSAGE } from './game.js';

const GameStateContext = createContext(null);

/**
 * Collects everything the platform tells this screen:
 * - state:  the engine's latest game state (from game:sync_state)
 * - me:     this screen's player ID, or the board's ID (from room:update)
 * - room:   the room, including room.players with names and VIP status
 * - error:  the last error message, if any
 * - send:   sends an action to the engine
 *
 * Message reference:
 * https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/messages.md
 */
export function GameStateProvider({ children }) {
  const [state, setState] = useState(null);
  const [room, setRoom] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  const { send } = useBoardgame({
    onMessage: (message) => {
      switch (message.type) {
        case MESSAGE.SYNC_STATE:
          setState(message.payload.state);
          setError(null);
          break;
        case 'room:update':
        case 'room:reconnected':
          if (message.clientId) setMe(message.clientId);
          if (message.room) setRoom(message.room);
          break;
        case 'system:error':
          setError(message.message || message.payload?.message || 'Something went wrong.');
          break;
        default:
          break;
      }
    },
  });

  const value = useMemo(() => {
    const seat = room?.players?.find((player) => player.id === me);
    return { state, room, me, isVip: Boolean(seat?.isVip), error, send };
  }, [state, room, me, error, send]);

  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>;
}

export function useGameState() {
  const context = useContext(GameStateContext);
  if (!context) throw new Error('useGameState must be used inside <GameStateProvider>.');
  return context;
}
`;

export const sharedStyles = `:root {
  color-scheme: dark;
  --bg: #0f1117;
  --surface: #1a1d27;
  --text: #f4f5f7;
  --muted: #9aa0ae;
  --accent: #4f8cff;
  --win: #22c55e;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

button {
  font: inherit;
  font-weight: 700;
  border: none;
  border-radius: 14px;
  padding: 1rem 2rem;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

button:active {
  transform: scale(0.97);
}

.muted {
  color: var(--muted);
}

.center {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 1.5rem;
  text-align: center;
}

.error {
  color: #fca5a5;
}
`;

const mainFor = (folder) => `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardgameProvider } from '@dallincreates/boardgame-client';
import { GameStateProvider } from '@shared/GameState.jsx';
import '@shared/styles.css';
import App from './App.jsx';

// BoardgameProvider connects this ${folder === 'board' ? 'screen' : 'phone'} to the platform; GameStateProvider
// turns its messages into state your components can read with useGameState().
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BoardgameProvider>
      <GameStateProvider>
        <App />
      </GameStateProvider>
    </BoardgameProvider>
  </StrictMode>
);
`;

export const boardMain = mainFor('board');
export const playerMain = mainFor('player');

export const boardApp = `import { useGameState } from '@shared/GameState.jsx';
import { PHASE, WINNING_SCORE } from '@shared/game.js';

// The shared screen everyone looks at: a TV or laptop. Design for distance:
// big text, nothing anyone needs to tap. When the game ends, the platform's
// results screen appears over this one with Play again for the host.
export default function App() {
  const { state, error } = useGameState();

  if (!state) {
    return <div className="center muted">Loading the game…</div>;
  }

  const ranked = Object.entries(state.players)
    .filter(([, player]) => !player.left)
    .sort(([, a], [, b]) => b.score - a.score);
  const winner = state.players[state.winnerId];

  return (
    <div className="center" style={{ fontSize: '1.5rem' }}>
      {state.phase === PHASE.GAME_OVER ? (
        <h1 style={{ fontSize: '4rem', margin: 0, color: 'var(--win)' }}>{winner?.name ?? 'Someone'} wins!</h1>
      ) : (
        <h1 style={{ fontSize: '3rem', margin: 0 }}>First to {WINNING_SCORE} taps wins</h1>
      )}

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, width: 'min(640px, 100%)' }}>
        {ranked.map(([id, player]) => (
          <li
            key={id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.75rem 1.25rem',
              margin: '0.5rem 0',
              borderRadius: '12px',
              background: 'var(--surface)',
              opacity: player.connected ? 1 : 0.45,
            }}
          >
            <span>{player.name}{player.connected ? '' : ' (away)'}</span>
            <strong>{player.score}</strong>
          </li>
        ))}
      </ol>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
`;

export const playerApp = `import { useGameState } from '@shared/GameState.jsx';
import { ACTION, PHASE } from '@shared/game.js';

// Each player's phone. Design for thumbs: one clear action at a time, big
// touch targets, and no reading the shared screen should do instead.
export default function App() {
  const { state, me, send, error } = useGameState();

  if (!state) {
    return <div className="center muted">Loading the game…</div>;
  }

  const myself = state.players[me];
  const winner = state.players[state.winnerId];

  if (state.phase === PHASE.GAME_OVER) {
    return (
      <div className="center">
        <h1>{state.winnerId === me ? 'You win! 🎉' : (winner?.name ?? 'Someone') + ' wins'}</h1>
        <p className="muted">The results are coming up…</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="center">
      <p className="muted">{myself ? myself.name + ' · ' + myself.score + ' points' : 'Joining…'}</p>
      <button
        type="button"
        onClick={() => send({ type: ACTION.SCORE })}
        style={{ width: '70vmin', height: '70vmin', borderRadius: '50%', fontSize: '2rem' }}
      >
        Tap!
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
`;

const htmlFor = ({ title, entry, viewport }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="${viewport}" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${entry}"></script>
  </body>
</html>
`;

export function boardHtml({ gameName }) {
  return htmlFor({
    title: `${gameName} (board)`,
    entry: '/src/board/main.jsx',
    viewport: 'width=device-width, initial-scale=1.0',
  });
}

export function playerHtml({ gameName }) {
  return htmlFor({
    title: gameName,
    entry: '/src/player/main.jsx',
    // Phones: no pinch-zoom or double-tap zoom while players mash buttons.
    viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
  });
}
