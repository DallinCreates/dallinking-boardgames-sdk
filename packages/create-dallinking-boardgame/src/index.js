import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export function scaffoldProject(projectDir) {
  const targetDir = path.resolve(projectDir);
  const projectName = path.basename(targetDir);

  console.log(`\n🚀 Scaffolding a new boardgame: "${projectName}" inside "${targetDir}"...`);

  const writeFile = (relativeFilePath, content) => {
    const fullPath = path.join(targetDir, relativeFilePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  };

  // 1. package.json
  const packageJsonContent = `{
  "name": "${projectName}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build:ui": "vite build",
    "build:engine": "esbuild src/engine/engine.js --bundle --outfile=dist/engine.cjs --platform=node --format=cjs --sourcemap",
    "build:zip": "node scripts/build-zip.js",
    "build": "npm run build:ui && npm run build:engine && npm run build:zip",
    "preview": "vite preview",
    "sandbox": "boardgame-devkit sandbox"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@dallincreates/boardgame-client": "latest",
    "@dallincreates/boardgame-server": "latest"
    },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "esbuild": "^0.20.0",
    "adm-zip": "^0.5.10",
    "@dallincreates/boardgame-devkit": "latest"
  }
}`;

  // 2. public/game.config.json
  const gameConfigContent = `{
  "id": "${projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '')}",
  "name": "${projectName.charAt(0).toUpperCase() + projectName.slice(1)}",
  "minPlayers": 2,
  "maxPlayers": 8,
  "version": "1.0.0"
}`;

  // 3. vite.config.js
  const viteConfigContent = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    }
  },
  build: {
    rollupOptions: {
      input: {
        board: resolve(__dirname, 'board.html'),
        player: resolve(__dirname, 'player.html'),
      }
    }
  }
});`;

  // 4. .gitignore
  const gitignoreContent = `node_modules/
dist/
*.zip
.env
.DS_Store
`;

  // 5. scripts/build-zip.js
  const buildZipContent = `import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

const zipName = '${projectName}.zip';
const distPath = path.resolve('./dist');

if (!fs.existsSync(distPath)) {
  console.error('Error: dist folder does not exist. Run build first.');
  process.exit(1);
}

const zip = new AdmZip();
zip.addLocalFolder(distPath);
zip.writeZip(zipName);

console.log(\`✅ Successfully created \${zipName} with the contents of the dist folder.\`);
`;

  const boardHtmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Host Board | ${projectName}</title>
  </head>
  <body style="background: #121212; color: white; margin: 0; font-family: sans-serif;">
    <div id="root"></div>
    <script type="module" src="/src/board/main.jsx"></script>
  </body>
</html>`;

  const playerHtmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>Controller | ${projectName}</title>
  </head>
  <body style="background: #1e1e1e; color: white; margin: 0; font-family: sans-serif; overflow: hidden;">
    <div id="root"></div>
    <script type="module" src="/src/player/main.jsx"></script>
  </body>
</html>`;

  // 7. SHARED: src/shared/game/constants.js
  const constantsContent = `export const GAME_STATUS = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  GAME_OVER: 'game_over'
};

export const ACTION_TYPE = {
  START_GAME: 'game:start',
  RESET_GAME: 'game:reset',
  ADD_POINT: 'game:add_point'
};

export const MESSAGE_TYPE = {
  SYNC_STATE: 'game:sync_state',
  ERROR: 'system:error'
};
`;

  // 8. SHARED: src/shared/context/clientState.jsx
  const clientStateContent = `import React, { createContext, useContext, useState } from 'react';
import { useBoardgame } from "@dallincreates/boardgame-client";
import { MESSAGE_TYPE } from '@shared/game/constants.js';

const ClientStateContext = createContext();

export const useClientState = () => {
  const context = useContext(ClientStateContext);
  if (!context) {
    throw new Error('useClientState must be used within a ClientStateProvider');
  }
  return context;
};

export const ClientStateProvider = ({ children }) => {
  const [state, setState] = useState({ status: 'lobby', score: {}, players: [] });
  const [statusMessage, setStatusMessage] = useState('Connecting to the room...');

  const { send } = useBoardgame({
    onMessage: (msg) => {
      if (msg.type === MESSAGE_TYPE.SYNC_STATE) {
        setState(msg.payload.state);
        setStatusMessage('Sync complete.');
      }
      if (msg.type === MESSAGE_TYPE.ERROR) {
        setStatusMessage(\`Error: \${msg.payload.message}\`);
      }
    }
  });

  return (
    <ClientStateContext.Provider value={{ state, send, statusMessage }}>
      {children}
    </ClientStateContext.Provider>
  );
};
`;

  // 9. ENGINE: src/engine/engine.js (FULLY DOCUMENTED LIFECYCLES)
  const engineContent = `import { BaseGameEngine } from '@dallincreates/boardgame-server';
import { GAME_STATUS, ACTION_TYPE, MESSAGE_TYPE } from '../shared/game/constants.js';

/**
 * This class extends the dallinking-boardgames-sdk BaseGameEngine.
 * It manages the authoritative state and handles the entire game lifecycle.
 */
export default class Engine extends BaseGameEngine {
  
  /**
   * 1. TRIGGERED ON "room:create"
   * Initializes base state before any players join the room.
   */
  onInit() {
    this.state = {
      status: GAME_STATUS.LOBBY,
      score: {},
      players: [],
      winner: null
    };
  }

  // HELPER: SEND STATE TO ALL CLIENTS
  broadcastState() {
    this.broadcastRoomUpdate({
      type: MESSAGE_TYPE.SYNC_STATE,
      payload: { state: this.state }
    });
  }

  /**
   * 2. TRIGGERED ON "room:join"
   * Called when a new player enters the lobby or late-joins an active game.
   */
  onPlayerJoin(playerId, name, isLateJoin) {
    if (playerId === this.boardId) return;
    
    // Prevent duplicates if system routes a weird event
    if (!this.state.players.find(p => p.id === playerId)) {
      this.state.players.push({ id: playerId, name, connected: true });
      if (this.state.score[playerId] === undefined) {
        this.state.score[playerId] = 0;
      }
    } else {
      // Mark as reconnected if they were previously offline
      const p = this.state.players.find(p => p.id === playerId);
      if (p) p.connected = true;
    }
    
    this.broadcastState();
  }

  /**
   * 3. TRIGGERED ON "room:start"
   * Called exactly once per game session to begin gameplay.
   */
  onGameStart() {
    super.onGameStart(); // Sets this.hasStarted = true internally
    this.state.status = GAME_STATUS.PLAYING;
    this.broadcastState();
  }

  /**
   * 4. THE ACTION ROUTER
   * Triggered for any incoming message starting with "game:*".
   * @param {string} actionType - E.g., "game:add_point"
   * @param {object} payload - Developer-defined data from the client
   * @param {object} meta - System metadata { playerId, isBoard, isVip, timestamp }
   */
  processAction(actionType, payload, meta) {
    const { playerId, isBoard, isVip } = meta;

    switch (actionType) {
      case ACTION_TYPE.START_GAME:
        if (!isVip && !isBoard) return;
        this.onGameStart();
        break;

      case ACTION_TYPE.ADD_POINT:
        if (this.state.status !== GAME_STATUS.PLAYING) return;
        this.state.score[playerId] = (this.state.score[playerId] || 0) + 1;
        this.broadcastState();
        break;

      case ACTION_TYPE.RESET_GAME:
        if (!isVip && !isBoard) return;
        this.onInit();
        this.broadcastState();
        break;

      default:
        console.warn(\`[Engine] Unhandled action: \${actionType}\`);
    }
  }

  /**
   * 5. TRIGGERED ON CONNECTION RECOVERY
   * Called when a player's socket reconnects to the system.
   */
  onReconnect(playerId, meta) {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) player.connected = true;
    this.broadcastState();
  }

  /**
   * 5b. STATE SNAPSHOTS (RECONNECT / REFRESH)
   * The platform calls these to re-deliver state to a single client when
   * they reconnect or press the in-game refresh button. The result is sent
   * as a "game:sync_state" message. Override getPlayerState to hide
   * secrets (roles, hands, hidden words) from individual players.
   */
  getBoardState() {
    return this.state;
  }

  getPlayerState(playerId) {
    return this.state;
  }

  /**
   * 6. TRIGGERED ON SOCKET DISCONNECT
   * Called when a player drops connection. Game logic should usually mark them
   * offline here rather than deleting them, allowing for \`onReconnect\`.
   */
  onDisconnect(playerId, meta) {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) player.connected = false;
    this.broadcastState();
  }

  /**
   * 7. TRIGGERED ON "room:leave"
   * Called when a player explicitly leaves the room entirely.
   */
  onPlayerLeave(playerId) {
    if (this.state.status !== GAME_STATUS.PLAYING) {
      // Safe to delete if we are just in the lobby
      delete this.state.score[playerId];
      this.state.players = this.state.players.filter(p => p.id !== playerId);
    } else {
      // If mid-game, you might just want to mark them offline or handle forfeit
      const player = this.state.players.find(p => p.id === playerId);
      if (player) player.connected = false;
    }
    this.broadcastState();
  }

  /**
   * 8. TRIGGERED ON ROOM DESTRUCTION
   * Called when the room is closed or the board fully disconnects.
   * Clean up intervals, timeouts, or memory here.
   */
  destroy() {
    // clearInterval(...) etc.
  }
}`;

  // 10. BOARD: src/board/main.jsx
  const boardMainContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BoardgameProvider } from '@dallincreates/boardgame-client';
import { ClientStateProvider } from '@shared/context/clientState.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BoardgameProvider>
      <ClientStateProvider>
        <App />
      </ClientStateProvider>
    </BoardgameProvider>
  </React.StrictMode>
);`;

  // 11. BOARD: src/board/App.jsx
  const boardAppContent = `import React from 'react';
import { useClientState } from '@shared/context/clientState.jsx';
import { ACTION_TYPE, GAME_STATUS } from '@shared/game/constants.js';

export default function App() {
  const { state, send, statusMessage } = useClientState();

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>📺 Big Screen Host Board</h1>
      <p>Status: <strong>{state.status}</strong></p>
      <p>System message: {statusMessage}</p>
      <hr style={{ borderColor: '#333' }} />

      <h2>Players in Room ({state.players?.length || 0})</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(state.players || []).map((player) => (
          <li key={player.id} style={{ margin: '0.5rem 0', fontSize: '1.2rem', opacity: player.connected ? 1 : 0.5 }}>
            {player.connected ? '👤' : '💤'} {player.name} — Score: {state.score[player.id] || 0}
          </li>
        ))}
      </ul>

      {state.status === GAME_STATUS.LOBBY && (
        <button 
          onClick={() => send({ type: ACTION_TYPE.START_GAME })}
          style={{ padding: '10px 20px', fontSize: '1rem', cursor: 'pointer', background: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', margin: '10px' }}
        >
          Start Game
        </button>
      )}

      {state.status === GAME_STATUS.PLAYING && (
        <button 
          onClick={() => send({ type: ACTION_TYPE.RESET_GAME })}
          style={{ padding: '10px 20px', fontSize: '1rem', cursor: 'pointer', background: '#d32f2f', color: 'white', border: 'none', borderRadius: '4px', margin: '10px' }}
        >
          Reset Game
        </button>
      )}
    </div>
  );
}`;

  // 12. PLAYER: src/player/main.jsx
  const playerMainContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BoardgameProvider } from '@dallincreates/boardgame-client';
import { ClientStateProvider } from '@shared/context/clientState.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BoardgameProvider>
      <ClientStateProvider>
        <App />
      </ClientStateProvider>
    </BoardgameProvider>
  </React.StrictMode>
);`;

  // 13. PLAYER: src/player/App.jsx
  const playerAppContent = `import React from 'react';
import { useClientState } from '@shared/context/clientState.jsx';
import { ACTION_TYPE, GAME_STATUS } from '@shared/game/constants.js';

export default function App() {
  const { state, send, statusMessage } = useClientState();

  return (
    <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', boxSizing: 'border-box' }}>
      <h1>📱 Mobile Controller</h1>
      <p>Status: {statusMessage}</p>

      {state.status === GAME_STATUS.LOBBY ? (
        <h2>Waiting for host to start the game...</h2>
      ) : (
        <div style={{ margin: '2rem 0' }}>
          <button 
            onClick={() => send({ type: ACTION_TYPE.ADD_POINT })}
            style={{ padding: '20px 40px', fontSize: '1.5rem', cursor: 'pointer', background: '#4caf50', color: 'white', border: 'none', borderRadius: '8px', width: '100%', maxWidth: '300px' }}
          >
            Tap to Score!
          </button>
        </div>
      )}
    </div>
  );
}`;

  // 14. README.md (HEAVILY DOCUMENTED FOR AI)
  const readmeContent = `# ${projectName}

Interactive multi-player party boardgame scaffolded with \`create-dallinking-boardgame\`.

## 🤖 AI / Developer Engine Architecture Guide
If you are an AI assisting with this codebase, you must understand the exact lifecycle of the \`BaseGameEngine\` exposed by \`@dallincreates/boardgame-server\`.

### The Core Engine Lifecycle Hooks
The server-side system automatically invokes the following class methods on \`src/engine/engine.js\`:

1. **\`onInit()\`**: Fired upon \`room:create\`. Used strictly to build the \`this.state\` object before players join.
2. **\`onPlayerJoin(playerId, name, isLateJoin)\`**: Fired upon \`room:join\`. The user was added to the room.
3. **\`onGameStart()\`**: Fired exactly once per game upon \`room:start\`. Use \`super.onGameStart()\` to flip \`hasStarted = true\`.
4. **\`processAction(actionType, payload, meta)\`**: The main game router. Fired for any custom \`game:*\` payload sent from the React UI via \`send()\`. The \`meta\` object includes \`{ playerId, isBoard, isVip, timestamp }\`.
5. **\`onDisconnect(playerId, meta)\`**: Fired when a socket drops. Usually, you should update your internal state to mark the player as offline rather than removing them from the game entirely.
6. **\`onReconnect(playerId, meta)\`**: Fired when a dropped player returns. Re-mark them as online and push a state sync.
7. **\`onPlayerLeave(playerId)\`**: Fired upon \`room:leave\` (explicit exit).
8. **\`destroy()\`**: Fired when the room shuts down. Clean up intervals and memory.
9. **\`getBoardState()\` / \`getPlayerState(playerId)\`**: Return the state snapshot re-delivered to one client (as a \`game:sync_state\` message) when they reconnect or press the in-game refresh button. Default to \`this.state\`; override \`getPlayerState\` to hide per-player secrets. Frontends must handle \`game:sync_state\` by replacing their local state with \`payload.state\`.

### Frontend Communication Bridge
* **Sending Actions:** React components call \`send({ type: ACTION_TYPE.X, payload: Y })\` (via \`useClientState\`). This routes to \`processAction\` in the engine.
* **Receiving State:** The Engine calls \`this.broadcastRoomUpdate(payload)\`. The React \`ClientStateProvider\` listens for this via \`useBoardgame\` and updates React State.

## Getting Started
1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Test your game locally using the sandbox:
   \`\`\`bash
   npm run sandbox
   \`\`\`

3. Build the full bundle (frontend + engine + zip archive):
   \`\`\`bash
   npm run build:all
   \`\`\`
   Outputs \`${projectName}.zip\` directly ready for deployment.
`;

  // Write all files!
  writeFile('package.json', packageJsonContent);
  writeFile('public/game.config.json', gameConfigContent);
  writeFile('vite.config.js', viteConfigContent);
  writeFile('.gitignore', gitignoreContent);
  writeFile('scripts/build-zip.js', buildZipContent);
  writeFile('board.html', boardHtmlContent);
  writeFile('player.html', playerHtmlContent);
  writeFile('src/shared/game/constants.js', constantsContent);
  writeFile('src/shared/context/clientState.jsx', clientStateContent);
  writeFile('src/engine/engine.js', engineContent);
  writeFile('src/board/main.jsx', boardMainContent);
  writeFile('src/board/App.jsx', boardAppContent);
  writeFile('src/player/main.jsx', playerMainContent);
  writeFile('src/player/App.jsx', playerAppContent);
  writeFile('README.md', readmeContent);

  console.log(`\n🎉 Success! Scaffolded game project at: "${targetDir}"`);

  try {
    console.log('\n📦 Initializing Git repository...');
    execSync('git init', { cwd: targetDir, stdio: 'ignore' });
    execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit: Scaffolded boardgame project with Full Lifecycle definitions"', { cwd: targetDir, stdio: 'ignore' });
    console.log('✅ Git repository initialized and first commit created.');
  } catch (err) {
    console.warn('⚠️ Could not initialize Git repository automatically. Make sure Git is installed on your system.');
  }

  console.log(`\nTo get started:\n  cd ${projectName}\n  npm install\n  npm run dev\n`);
}

export default {
  scaffoldProject,
};