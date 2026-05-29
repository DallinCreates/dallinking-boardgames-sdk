#!/usr/bin/env node

import { initDevkit, runSandbox } from './index.js';

function printHelp() {
  const { version } = initDevkit();

  console.log(`
boardgame-devkit ${version}

Usage:
  boardgame-devkit sandbox [player-count-flag]
  boardgame-devkit [--help] [--version]

Examples:
  boardgame-devkit sandbox -5
  npm run sandbox -- -5

The devkit package currently exposes shared SDK helpers and this lightweight
CLI entrypoint for package validation.
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

  printHelp();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});