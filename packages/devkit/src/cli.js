#!/usr/bin/env node

import { initDevkit } from './index.js';

function printHelp() {
  const { version } = initDevkit();

  console.log(`
boardgame-devkit ${version}

Usage:
  boardgame-devkit [--help] [--version]

The devkit package currently exposes shared SDK helpers and this lightweight
CLI entrypoint for package validation.
`);
}

const args = new Set(process.argv.slice(2));

if (args.has('--version') || args.has('-v')) {
  console.log(initDevkit().version);
  process.exit(0);
}

if (args.has('--help') || args.has('-h') || args.size === 0) {
  printHelp();
  process.exit(0);
}

printHelp();