import { spawnSync } from 'child_process';

import { HARNESS_PORT, PREVIEW_PORT } from './sandbox/constants.js';
import { resolveSandboxConfig } from './sandbox/config.js';
import { loadSandboxEngine } from './sandbox/engine-loader.js';
import { startSandboxRuntime } from './sandbox/runtime.js';

export async function runSandbox({ cwd = process.cwd(), argv = process.argv.slice(2) } = {}) {
    const { gameName, numPlayers, buildCmd } = resolveSandboxConfig({ cwd, argv });

    console.log(`\n📦 Building Production Distribution Files (npm run ${buildCmd})...`);
    const buildResult = spawnSync('npm', ['run', buildCmd], { stdio: 'inherit', shell: true });

    if (buildResult.status !== 0) {
        console.error(`❌ Build failed. Sandbox cannot start.`);
        process.exit(1);
    }

    let GameEngine;

    try {
        GameEngine = await loadSandboxEngine(cwd);
    } catch (error) {
        console.error(`❌ Error loading engine module:`, error.message);
        process.exit(1);
    }

    await startSandboxRuntime({
        cwd,
        gameName,
        numPlayers,
        previewPort: PREVIEW_PORT,
        harnessPort: HARNESS_PORT,
        GameEngine,
    });
}