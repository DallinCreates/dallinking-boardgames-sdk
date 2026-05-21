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
    "@dallinking/boardgame-client": "latest"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "esbuild": "^0.20.0",
    "@dallinking/boardgame-server": "latest"
  }
}`;

  // 2. game.config.json (dynamic metadata!)
  const gameConfigContent = `{
  "id": "${projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '')}",
  "name": "${projectName.charAt(0).toUpperCase() + projectName.slice(1)}",
  "minPlayers": 2,
  "maxPlayers": 8,
  "version": "1.0.0"
}`;

  // 3. vite.config.js (configures multi-page board vs player builds)
  const viteConfigContent = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        board: resolve(__dirname, 'board.html'),
        player: resolve(__dirname, 'player.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
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

  // 6. src/engine.js (Backend engine extending @dallinking/boardgame-server)
  const engineContent = `import { BaseGameEngine } from '@dallinking/boardgame-server';

export default class ${projectName.charAt(0).toUpperCase() + projectName.slice(1)}Engine extends BaseGameEngine {
  onInit() {
    // Set up your base state
    this.state = {
      status: 'lobby',
      score: {},
      winner: null
    };
  }

  onPlayerJoin(playerId, name, isLateJoin) {
    if (playerId === this.boardId) return;
    this.state.score[playerId] = 0;
    this.broadcastRoomUpdate({
      type: 'game:state',
      state: this.state
    });
  }

  onPlayerLeave(playerId) {
    delete this.state.score[playerId];
    this.broadcastRoomUpdate({
      type: 'game:state',
      state: this.state
    });
  }

  onGameStart() {
    this.hasStarted = true;
    this.state.status = 'playing';
    this.broadcastRoomUpdate({
      type: 'game:state',
      state: this.state
    });
  }

  processAction(actionType, payload, meta) {
    const { playerId } = meta;

    switch (actionType) {
      case 'game:add-point':
        if (this.state.status !== 'playing') return;
        this.state.score[playerId] = (this.state.score[playerId] || 0) + 1;
        this.broadcastRoomUpdate({
          type: 'game:state',
          state: this.state
        });
        break;

      case 'game:reset':
        if (!meta.isVip && !meta.isBoard) return;
        this.onInit();
        this.broadcastRoomUpdate({
          type: 'game:state',
          state: this.state
        });
        break;

      default:
        console.warn(\`[Engine] Unhandled action: \${actionType}\`);
    }
  }
}`;

  // 7. src/board/main.jsx
  const boardMainContent = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

  // 8. src/board/App.jsx (Board React Component using hook)
  const boardAppContent = `import React from 'react';
import { useBoardgame } from '@dallinking/boardgame-client';

export default function App() {
  const { state, roomPlayers, statusMessage, sendAction } = useBoardgame({
    initialState: { status: 'lobby', score: {} }
  });

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>📺 Big Screen Host Board</h1>
      <p>Status: <strong>{state.status}</strong></p>
      <p>System message: {statusMessage}</p>
      <hr style={{ borderColor: '#333' }} />

      <h2>Players in Room ({roomPlayers.length})</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {roomPlayers.map((player) => (
          <li key={player.id} style={{ margin: '0.5rem 0', fontSize: '1.2rem' }}>
            👤 {player.name} {player.isVip ? '⭐️ (VIP)' : ''} — Score: {state.score[player.id] || 0}
          </li>
        ))}
      </ul>

      {state.status === 'playing' && (
        <button 
          onClick={() => sendAction('game:reset')}
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

  // 10. src/player/App.jsx (Player Controller React Component using hook)
  const playerAppContent = `import React from 'react';
import { useBoardgame } from '@dallinking/boardgame-client';

export default function App() {
  const { state, statusMessage, sendAction } = useBoardgame({
    initialState: { status: 'lobby', score: {} }
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
            onClick={() => sendAction('game:add-point')}
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
- \`src/engine.js\` - Authoritative server-side game logic (compiled to CJS for dynamic loading).
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

## Publishing to your CDN
Deploy the compiled assets inside \`dist/\` (specifically \`board.html\`, \`player.html\`, \`assets/\`, and \`engine.js\`) to your CDN under path:
\`cdn.dallinking.com/boardgames/${projectName.toLowerCase()}/\`
`;

  // Write all files!
  writeFile('package.json', packageJsonContent);
  writeFile('game.config.json', gameConfigContent);
  writeFile('vite.config.js', viteConfigContent);
  writeFile('board.html', boardHtmlContent);
  writeFile('player.html', playerHtmlContent);
  writeFile('src/engine.js', engineContent);
  writeFile('src/board/main.jsx', boardMainContent);
  writeFile('src/board/App.jsx', boardAppContent);
  writeFile('src/player/main.jsx', playerMainContent);
  writeFile('src/player/App.jsx', playerAppContent);
  writeFile('README.md', readmeContent);

  console.log(`\n🎉 Success! Scaffolded game project at: "${targetDir}"`);
  console.log(`\nTo get started:\n  cd ${projectDir}\n  npm install\n  npm run dev\n`);
}

export default {
  scaffoldProject,
};
