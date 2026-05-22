import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Scaffolds a new dallinking-boardgame project.
 * @param {string} projectDir - The absolute or relative path to create.
 */
export function scaffoldProject(projectDir) {
  const targetDir = path.resolve(projectDir);
  const projectName = path.basename(targetDir);

  console.log(`\n🚀 Scaffolding a new boardgame: "${projectName}" inside "${targetDir}"...`);

  // Helper to safely write files and create parent dirs
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
    "build": "vite build",
    "build:engine": "esbuild src/engine.js --bundle --outfile=dist/engine.cjs --platform=node --format=cjs --sourcemap",
    "build:all": "npm run build && npm run build:engine",
    "preview": "vite preview"
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
    "esbuild": "^0.20.0"
  }
}`;

  // 2. game.config.json
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

  // 4. board.html
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

  // 5. player.html
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

  const engineContent = `import { BaseGameEngine } from '@dallincreates/boardgame-server';

export default class Engine extends BaseGameEngine {
  onInit() {
    this.state = {
      status: 'lobby',
      score: {},
      players: [],
      winner: null
    };
  }

  // Helper function to send standardized state updates to everyone
  broadcastState() {
    this.broadcastRoomUpdate({
      type: 'game:sync_state',
      payload: { state: this.state }
    });
  }

  onPlayerJoin(playerId, name, isLateJoin) {
    if (playerId === this.boardId) return;
    
    // Prevent duplicates if a player reconnects
    if (!this.state.players.find(p => p.id === playerId)) {
      this.state.players.push({ id: playerId, name });
      this.state.score[playerId] = 0;
    }
    
    this.broadcastState();
  }

  onPlayerLeave(playerId) {
    delete this.state.score[playerId];
    this.state.players = this.state.players.filter(p => p.id !== playerId);
    this.broadcastState();
  }

  onGameStart() {
    super.onGameStart(); // Sets this.hasStarted = true
    this.state.status = 'playing';
    this.broadcastState();
  }

  processAction(actionType, payload, meta) {
    const { playerId, isBoard, isVip } = meta;

    switch (actionType) {
      case 'game:add_point':
        if (this.state.status !== 'playing') return;
        this.state.score[playerId] = (this.state.score[playerId] || 0) + 1;
        this.broadcastState();
        break;

      case 'game:reset':
        if (!isVip && !isBoard) return;
        this.onInit();
        this.broadcastState();
        break;

      default:
        console.warn(\`[Engine] Unhandled action: \${actionType}\`);
    }
  }

  destroy() {
    // Clean up any intervals or timeouts here when the game session ends
  }
}`;

  // 7. src/board/main.jsx
  const boardMainContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BoardgameProvider } from '@dallincreates/boardgame-client';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BoardgameProvider>
      <App />
    </BoardgameProvider>
  </React.StrictMode>
);`;

  // 8. src/board/App.jsx
  const boardAppContent = `import React, { useState } from 'react';
import { useBoardgame } from '@dallincreates/boardgame-client';

export default function App() {
  const [state, setState] = useState({ status: 'lobby', score: {}, players: [] });
  const [statusMessage, setStatusMessage] = useState('Waiting for players to join...');

  const { send } = useBoardgame({
    onMessage: (msg) => {
      if (msg.type === 'game:sync_state') {
        setState(msg.payload.state);
        setStatusMessage('Sync complete.');
      }
      if (msg.type === 'system:error') {
        setStatusMessage(\`Error: \${msg.payload.message}\`);
      }
    }
  });

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>📺 Big Screen Host Board</h1>
      <p>Status: <strong>{state.status}</strong></p>
      <p>System message: {statusMessage}</p>
      <hr style={{ borderColor: '#333' }} />

      <h2>Players in Room ({state.players?.length || 0})</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(state.players || []).map((player) => (
          <li key={player.id} style={{ margin: '0.5rem 0', fontSize: '1.2rem' }}>
            👤 {player.name} — Score: {state.score[player.id] || 0}
          </li>
        ))}
      </ul>

      {state.status === 'playing' && (
        <button 
          onClick={() => send({ type: 'game:reset' })}
          style={{ padding: '10px 20px', fontSize: '1rem', cursor: 'pointer', background: '#d32f2f', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          Reset Game
        </button>
      )}
    </div>
  );
}`;

  // 9. src/player/main.jsx
  const playerMainContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BoardgameProvider } from '@dallincreates/boardgame-client';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BoardgameProvider>
      <App />
    </BoardgameProvider>
  </React.StrictMode>
);`;

  // 10. src/player/App.jsx
  const playerAppContent = `import React, { useState } from 'react';
import { useBoardgame } from '@dallincreates/boardgame-client';

export default function App() {
  const [state, setState] = useState({ status: 'lobby', score: {} });
  const [statusMessage, setStatusMessage] = useState('Waiting for game to load...');

  const { send } = useBoardgame({
    onMessage: (msg) => {
      if (msg.type === 'game:sync_state') {
        setState(msg.payload.state);
        setStatusMessage('Sync complete.');
      }
    }
  });

  return (
    <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', boxSizing: 'border-box' }}>
      <h1>📱 Mobile Controller</h1>
      <p>Status: {statusMessage}</p>

      {state.status === 'lobby' ? (
        <h2>Waiting for host to start the game...</h2>
      ) : (
        <div style={{ margin: '2rem 0' }}>
          <button 
            onClick={() => send({ type: 'game:add_point' })}
            style={{ padding: '20px 40px', fontSize: '1.5rem', cursor: 'pointer', background: '#4caf50', color: 'white', border: 'none', borderRadius: '8px', width: '100%', maxWidth: '300px' }}
          >
            Tap to Score!
          </button>
        </div>
      )}
    </div>
  );
}`;

  // 11. README.md
  const readmeContent = `# ${projectName}

Interactive multi-player party boardgame scaffolded with \`create-dallinking-boardgame\`.

## Project Structure
- \`src/engine/engine.js\` - Authoritative server-side game logic (compiled to CJS for dynamic loading).
- \`src/board/App.jsx\` - React UI displayed on the Big Host screen (e.g. TV).
- \`src/player/App.jsx\` - React UI displayed on players' mobile devices.

## Getting Started
1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run the frontend Vite dev server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Build the full bundle (frontend + engine):
   \`\`\`bash
   npm run build:all
   \`\`\`
`;

  // Write all files!
  writeFile('package.json', packageJsonContent);
  writeFile('game.config.json', gameConfigContent);
  writeFile('vite.config.js', viteConfigContent);
  writeFile('board.html', boardHtmlContent);
  writeFile('player.html', playerHtmlContent);
  writeFile('src/engine/engine.js', engineContent);
  writeFile('src/board/main.jsx', boardMainContent);
  writeFile('src/board/App.jsx', boardAppContent);
  writeFile('src/player/main.jsx', playerMainContent);
  writeFile('src/player/App.jsx', playerAppContent);
  writeFile('README.md', readmeContent);

  console.log(`\n🎉 Success! Scaffolded game project at: "${targetDir}"`);
  console.log(`\nTo get started:\n  cd ${projectName}\n  npm install\n  npm run dev\n`);
}

export default {
  scaffoldProject,
};