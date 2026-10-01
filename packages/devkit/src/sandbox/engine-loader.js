import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// Dev mode serves the UI live from src/, so it loads the engine source too;
// otherwise engine edits would be ignored until the next build.
export async function loadSandboxEngine(cwd, { preferSource = false } = {}) {
    const built = path.join(cwd, 'dist/engine.cjs');
    const source = path.join(cwd, 'src/engine/engine.js');
    const engineCandidates = preferSource ? [source, built] : [built, source];

    const enginePath = engineCandidates.find((candidatePath) => fs.existsSync(candidatePath));

    if (!enginePath) {
        throw new Error(`Could not find engine. Looked in: ${engineCandidates.join(', ')}`);
    }

    if (enginePath.endsWith('.cjs')) {
        const requireFromCwd = createRequire(path.join(cwd, 'package.json'));
        const requiredEngine = requireFromCwd(enginePath);
        return requiredEngine.default || requiredEngine;
    }

    const dynamicImport = new Function('specifier', 'return import(specifier);');
    const engineModule = await dynamicImport(pathToFileURL(enginePath).href);

    return engineModule.default || engineModule;
}