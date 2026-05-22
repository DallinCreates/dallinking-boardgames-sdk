#!/usr/bin/env node

import { scaffoldProject } from './index.js';

function printHelp() {
  console.log(`
create-dallinking-boardgame

Usage:
  create-dallinking-boardgame <project-directory>

Scaffolds a new Dallin King boardgame project into the target directory.
`);
}

const args = process.argv.slice(2);
const [projectPath] = args;

if (!projectPath || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(projectPath ? 0 : 1);
}

try {
  scaffoldProject(projectPath);
} catch (error) {
  console.error('\n❌ Failed to scaffold project:', error);
  process.exit(1);
}