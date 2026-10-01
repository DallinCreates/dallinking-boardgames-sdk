// Project config files: package.json, game.config.json, build and editor setup.

const json = (value) => JSON.stringify(value, null, 2);

// SDK packages start at "latest"; after `npm install`, the scaffolder
// rewrites them to the installed versions (^x.y.z) so builds are repeatable.
export const SDK_DEPENDENCIES = {
  dependencies: ['@dallincreates/boardgame-client', '@dallincreates/boardgame-server'],
  devDependencies: ['@dallincreates/boardgame-devkit'],
};

export function packageJson({ gameId }) {
  return json({
    name: gameId,
    version: '1.0.0',
    private: true,
    type: 'module',
    engines: { node: '>=18' },
    scripts: {
      sandbox: 'boardgame-devkit sandbox',
      'sandbox:dev': 'boardgame-devkit sandbox -dev',
      validate: 'boardgame-devkit validate',
      build: 'npm run build:ui && npm run build:engine && npm run build:config && npm run build:zip',
      'build:ui': 'vite build',
      // Engines run in a browser worker or an isolated sandbox, never Node, so
      // bundle for the browser: a stray `fs` or `process` import fails here.
      'build:engine': 'esbuild src/engine/engine.js --bundle --platform=browser --format=cjs --target=es2020 --outfile=dist/engine.cjs',
      'build:config': 'boardgame-devkit stamp',
      'build:zip': 'node scripts/build-zip.js',
      dev: 'vite',
      preview: 'vite preview',
    },
    dependencies: {
      '@dallincreates/boardgame-client': 'latest',
      '@dallincreates/boardgame-server': 'latest',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@dallincreates/boardgame-devkit': 'latest',
      '@vitejs/plugin-react': '^4.3.0',
      'adm-zip': '^0.5.10',
      esbuild: '^0.20.0',
      vite: '^5.4.0',
    },
  });
}

export function gameConfig({ gameId, gameName }) {
  return json({
    // Autocomplete and inline checks in VS Code and other JSON-schema editors.
    $schema: '../node_modules/@dallincreates/boardgame-devkit/schema/game.config.schema.json',
    id: gameId,
    name: gameName,
    version: '1.0.0',
    subtitle: '',
    description: '',
    tags: [],
    gallery: [],
    players: { min: 2, max: 8 },
    averageDurationMinutes: 10,
    difficultyToLearn: 'Easy',
    languages: ['en'],
  });
}

export const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  // Releases are served from a versioned CDN folder, so every asset URL must
  // be relative.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fromRoot('./src/shared'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        board: fromRoot('./board.html'),
        player: fromRoot('./player.html'),
      },
    },
  },
});
`;

// Lets editors resolve the @shared alias and understand JSX.
export const jsconfig = json({
  compilerOptions: {
    baseUrl: '.',
    jsx: 'react-jsx',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    target: 'ES2022',
    checkJs: false,
    paths: { '@shared/*': ['src/shared/*'] },
  },
  include: ['src'],
});

export const nvmrc = '20\n';

export const gitignore = `node_modules/
dist/
*.zip
*.log
.vite/
.env
.env.*
.DS_Store
`;
