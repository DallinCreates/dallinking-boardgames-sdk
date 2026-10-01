#!/usr/bin/env node

import { DOCS_URL, scaffoldProject } from './index.js';
import { SDK_VERSION } from './version.js';

function printHelp() {
  console.log(`
create-dallinking-boardgame ${SDK_VERSION}

Creates a new game for boardgames.dallinking.com.

Usage:
  npm create @dallincreates/dallinking-boardgame <folder> [options]

Options:
  --name "<name>"   Display name (default: the folder name in Title Case)
  --no-install      Skip npm install
  --no-git          Skip creating a git repository
  -h, --help        Show this help
  -v, --version     Show the version

Examples:
  npm create @dallincreates/dallinking-boardgame my-game
  npm create @dallincreates/dallinking-boardgame word-duel -- --name "Word Duel!"

Docs: ${DOCS_URL}
`);
}

function parseArgs(args) {
  const options = { install: true, git: true };
  const positional = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--no-install') options.install = false;
    else if (arg === '--no-git') options.git = false;
    else if (arg === '--name') options.name = args[(i += 1)];
    else if (arg.startsWith('--name=')) options.name = arg.slice('--name='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}. Run with --help to see the options.`);
    else positional.push(arg);
  }

  return { ...options, projectDir: positional[0] };
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (options.version) {
    console.log(SDK_VERSION);
  } else if (options.help || !options.projectDir) {
    printHelp();
    process.exitCode = options.help ? 0 : 1;
  } else {
    scaffoldProject(options.projectDir, options);
  }
} catch (error) {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
