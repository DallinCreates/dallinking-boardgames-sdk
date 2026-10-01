import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const dynamicImport = new Function('specifier', 'return import(specifier);');

// Hot reload copies src/ here for each reload (see loadFreshSourceEngine).
const hotRoot = (cwd) => path.join(cwd, 'node_modules', '.cache', 'boardgame-devkit', 'hot');

function enginePaths(cwd, preferSource) {
    const built = path.join(cwd, 'dist/engine.cjs');
    const source = path.join(cwd, 'src/engine/engine.js');
    return preferSource ? [source, built] : [built, source];
}

/** The engine file the sandbox runs: src/engine/engine.js with -dev, dist/engine.cjs otherwise. */
export function resolveEnginePath(cwd, { preferSource = false } = {}) {
    const engineCandidates = enginePaths(cwd, preferSource);
    const enginePath = engineCandidates.find((candidatePath) => fs.existsSync(candidatePath));

    if (!enginePath) {
        throw new Error(`Could not find engine. Looked in: ${engineCandidates.join(', ')}`);
    }
    return enginePath;
}

function requireBuiltEngine(cwd, enginePath, { fresh }) {
    const requireFromCwd = createRequire(path.join(cwd, 'package.json'));
    if (fresh) delete requireFromCwd.cache[requireFromCwd.resolve(enginePath)];
    const requiredEngine = requireFromCwd(enginePath);
    return requiredEngine.default || requiredEngine;
}

// Dev mode serves the UI live from src/, so it loads the engine source too;
// otherwise engine edits would be ignored until the next build.
export async function loadSandboxEngine(cwd, { preferSource = false } = {}) {
    fs.rmSync(hotRoot(cwd), { recursive: true, force: true });
    const enginePath = resolveEnginePath(cwd, { preferSource });

    if (enginePath.endsWith('.cjs')) {
        return requireBuiltEngine(cwd, enginePath, { fresh: false });
    }

    const engineModule = await dynamicImport(pathToFileURL(enginePath).href);

    return engineModule.default || engineModule;
}

function copyModuleFiles(fromDir, toDir) {
    fs.mkdirSync(toDir, { recursive: true });
    for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
        const from = path.join(fromDir, entry.name);
        const to = path.join(toDir, entry.name);
        if (entry.isDirectory()) copyModuleFiles(from, to);
        else if (/\.(m?js|cjs|json)$/.test(entry.name)) fs.copyFileSync(from, to);
    }
}

// Node caches ES modules by URL and can't evict them, and a cache-busting
// query on engine.js would still reuse the files it imports. So each reload
// imports a fresh copy of src/ from its own folder: every module gets a new
// URL. The copy lives under node_modules/, so bare imports
// (@dallincreates/boardgame-server) still resolve to the project's packages.
async function loadFreshSourceEngine(cwd) {
    const root = hotRoot(cwd);
    const dir = path.join(root, String(Date.now()));
    copyModuleFiles(path.join(cwd, 'src'), path.join(dir, 'src'));

    // Module type comes from the nearest package.json, and node_modules/ hides
    // the project's: give the copy the same "type".
    const { type = 'commonjs' } = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true, type }));

    try {
        const engineModule = await dynamicImport(pathToFileURL(path.join(dir, 'src', 'engine', 'engine.js')).href);
        return engineModule.default || engineModule;
    } finally {
        // Loaded modules stay in memory; the files aren't needed again.
        for (const name of fs.readdirSync(root)) {
            fs.rmSync(path.join(root, name), { recursive: true, force: true });
        }
    }
}

/** Loads the engine again, picking up edits. Throws if it doesn't load. */
export async function reloadSandboxEngine(cwd, { preferSource = false } = {}) {
    const enginePath = resolveEnginePath(cwd, { preferSource });
    if (enginePath.endsWith('.cjs')) return requireBuiltEngine(cwd, enginePath, { fresh: true });
    return loadFreshSourceEngine(cwd);
}
