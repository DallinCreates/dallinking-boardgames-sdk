#!/usr/bin/env node

import { initDevkit, runSandbox, stampReleaseConfig } from './index.js';
import { runValidate } from './validate.js';

function printHelp() {
  const { version } = initDevkit();

  console.log(`
boardgame-devkit ${version}

Usage:
  boardgame-devkit sandbox [-N] [-dev] [--no-hot]
                                         board + N players on one page, with network
                                         simulation, a state inspector and hot reload
  boardgame-devkit validate [--dist]     pre-upload check: config, players, cover, engine hooks
  boardgame-devkit stamp                 validate dist/game.config.json and write sdkVersion
  boardgame-devkit [--help] [--version]

Examples:
  npm run sandbox -- -5        sandbox with 5 players
  npm run sandbox -- -dev      skip the build; engine edits hot-reload
  npx boardgame-devkit validate

Docs: https://github.com/DallinCreates/dallinking-boardgames-sdk/tree/main/docs
`);
}

const rawArgs = process.argv.slice(2);
const [command, ...commandArgs] = rawArgs;
const args = new Set(rawArgs);

async function main() {
  if (args.has('--version') || args.has('-v')) {
    console.log(initDevkit().version);
    process.exit(0);
  }

  if (args.has('--help') || args.has('-h') || args.size === 0) {
    printHelp();
    process.exit(0);
  }

  if (command === 'sandbox') {
    await runSandbox({ cwd: process.cwd(), argv: commandArgs });
    return;
  }

  if (command === 'validate') {
    const ok = await runValidate({ cwd: process.cwd(), argv: commandArgs });
    // Exit explicitly: timers the engine started during the check would
    // otherwise keep the process alive.
    process.exit(ok ? 0 : 1);
  }

  if (command === 'stamp') {
    stampReleaseConfig({ cwd: process.cwd() });
    return;
  }

  printHelp();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});