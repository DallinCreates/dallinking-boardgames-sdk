import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import * as configTemplates from './templates/config.js';
import * as appTemplates from './templates/apps.js';
import { engine } from './templates/engine.js';
import { buildZip } from './templates/scripts.js';
import * as docTemplates from './templates/docs.js';

export const DOCS_URL = 'https://github.com/DallinCreates/dallinking-boardgames-sdk/tree/main/docs';

// "My Game!" -> "my-game". Game IDs become CDN paths, so letters, numbers,
// dashes and underscores only.
export function toGameId(folderName) {
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "my-game" -> "My Game"
export function toGameName(folderName) {
  return folderName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function projectFiles(context) {
  return {
    'package.json': configTemplates.packageJson(context),
    'public/game.config.json': configTemplates.gameConfig(context),
    'vite.config.js': configTemplates.viteConfig,
    'jsconfig.json': configTemplates.jsconfig,
    '.nvmrc': configTemplates.nvmrc,
    '.gitignore': configTemplates.gitignore,
    'board.html': appTemplates.boardHtml(context),
    'player.html': appTemplates.playerHtml(context),
    'src/engine/engine.js': engine,
    'src/shared/game.js': appTemplates.sharedGame,
    'src/shared/GameState.jsx': appTemplates.sharedGameState,
    'src/shared/styles.css': appTemplates.sharedStyles,
    'src/board/main.jsx': appTemplates.boardMain,
    'src/board/App.jsx': appTemplates.boardApp,
    'src/player/main.jsx': appTemplates.playerMain,
    'src/player/App.jsx': appTemplates.playerApp,
    'scripts/build-zip.js': buildZip,
    'README.md': docTemplates.readme(context),
    'AGENTS.md': docTemplates.agents,
    'CLAUDE.md': docTemplates.claude,
  };
}

function writeFiles(targetDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  }
}

// Replaces "latest" with the version npm actually installed, so the project
// keeps building against the same SDK until someone upgrades on purpose.
function pinSdkVersions(targetDir) {
  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  for (const [field, names] of Object.entries(configTemplates.SDK_DEPENDENCIES)) {
    for (const name of names) {
      if (packageJson[field]?.[name] !== 'latest') continue;
      const installedPath = path.join(targetDir, 'node_modules', ...name.split('/'), 'package.json');
      if (!fs.existsSync(installedPath)) continue;
      const { version } = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
      packageJson[field][name] = `^${version}`;
    }
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function installDependencies(targetDir, log) {
  log('\n📦 Installing dependencies (npm install)...\n');
  try {
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
  } catch {
    log('\n⚠️  npm install failed. Fix the error above, then run "npm install" in the project folder.');
    return false;
  }
  pinSdkVersions(targetDir);
  return true;
}

function runQuietly(command, cwd) {
  execSync(command, { cwd, stdio: 'ignore' });
}

function initGit(targetDir, log) {
  try {
    runQuietly('git --version', targetDir);
  } catch {
    log('ℹ️  Git isn\'t installed, so no repository was created.');
    return false;
  }

  // Scaffolding inside an existing repo (a monorepo, say): leave it to that repo.
  try {
    runQuietly('git rev-parse --is-inside-work-tree', targetDir);
    log('ℹ️  This folder is already inside a git repository, so no new one was created.');
    return false;
  } catch {
    // Not in a repo yet.
  }

  try {
    runQuietly('git init', targetDir);
    runQuietly('git add -A', targetDir);
  } catch {
    log('⚠️  Couldn\'t create a git repository.');
    return false;
  }

  try {
    runQuietly('git commit -m "Create game with create-dallinking-boardgame"', targetDir);
    log('✅ Created a git repository with an initial commit.');
  } catch {
    log('ℹ️  Created a git repository. Set your git name and email to make the first commit.');
  }
  return true;
}

/**
 * Creates a new game project in `projectDir`.
 *
 * @param {string} projectDir Folder to create. Its name becomes the game ID.
 * @param {object} [options]
 * @param {string} [options.name] Display name. Defaults to the folder name in Title Case.
 * @param {boolean} [options.install=true] Run npm install.
 * @param {boolean} [options.git=true] Create a git repository with a first commit.
 * @param {(message: string) => void} [options.log=console.log]
 */
export function scaffoldProject(projectDir, { name, install = true, git = true, log = console.log } = {}) {
  const targetDir = path.resolve(projectDir);
  const folderName = path.basename(targetDir);
  const gameId = toGameId(folderName);

  if (!gameId) {
    throw new Error(`Can't make a game ID from "${folderName}". Use a folder name with letters or numbers, like "my-game".`);
  }
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(`${targetDir} already exists and isn't empty. Pick a new folder name.`);
  }

  const gameName = name?.trim() || toGameName(folderName);
  log(`\n🎲 Creating "${gameName}" (game ID: ${gameId}) in ${targetDir}`);

  writeFiles(targetDir, projectFiles({ gameId, gameName }));

  const installed = install ? installDependencies(targetDir, log) : false;
  const gitInitialized = git ? initGit(targetDir, log) : false;

  const relativeDir = path.relative(process.cwd(), targetDir) || '.';
  const steps = [
    relativeDir !== '.' ? `  cd ${relativeDir.includes(' ') ? `"${relativeDir}"` : relativeDir}` : null,
    installed ? null : '  npm install',
    '  npm run sandbox        play it locally: the board plus players on one page',
  ].filter(Boolean);

  log(`
🎉 "${gameName}" is ready.

Next:
${steps.join('\n')}

Then make it yours:
  src/engine/engine.js        the rules
  src/board/App.jsx           the shared screen
  src/player/App.jsx          the phones
  public/game.config.json     name, player limits, store page

Docs: ${DOCS_URL}
`);

  return { targetDir, gameId, gameName, installed, gitInitialized };
}

export default {
  scaffoldProject,
  toGameId,
  toGameName,
};
