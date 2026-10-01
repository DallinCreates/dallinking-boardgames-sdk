import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { validateProjectConfig } from './validate.js';

const SERVER_PACKAGE = '@dallincreates/boardgame-server';

// The version of the engine SDK this project actually has installed, which
// is the one esbuild bundles into dist/engine.cjs.
function resolveSdkVersion(cwd) {
    const requireFromCwd = createRequire(path.join(cwd, 'package.json'));
    try {
        const packageJsonPath = requireFromCwd.resolve(`${SERVER_PACKAGE}/package.json`);
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    } catch {
        throw new Error(`${SERVER_PACKAGE} isn't installed in ${cwd}. Run npm install first.`);
    }
}

// Checks dist/game.config.json against the upload rules, then writes the
// build-time fields into it. Runs after the UI build (Vite copies
// public/game.config.json into dist/) and before zipping. Never touches
// public/game.config.json.
export function stampReleaseConfig({ cwd = process.cwd() } = {}) {
    const { config, configPath, warnings } = validateProjectConfig({ cwd, dist: true });
    warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));

    const sdkVersion = resolveSdkVersion(cwd);
    const stamped = { ...config, sdkVersion };
    // $schema only helps editors; the published file doesn't need it.
    delete stamped.$schema;

    fs.writeFileSync(configPath, `${JSON.stringify(stamped, null, 2)}\n`, 'utf8');
    console.log(`✅ Stamped dist/game.config.json with sdkVersion ${sdkVersion}`);

    return { configPath, sdkVersion };
}
