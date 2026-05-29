import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

export async function loadSandboxEngine(cwd) {
    const engineCandidates = [
        path.join(cwd, 'dist/engine.cjs'),
        path.join(cwd, 'src/engine/engine.js'),
    ];

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