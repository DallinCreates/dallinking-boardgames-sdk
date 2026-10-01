import fs from 'fs';
import path from 'path';

// Watches the files the sandbox runs and reports what changed:
// - With -dev: src/ (outside the board and player apps, which Vite already
//   hot-reloads) for engine changes.
// - Without: dist/, so running `npm run build` in another terminal swaps in
//   the new engine and reloads the screens.

const ENGINE_SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json']);
const APP_FOLDERS = new Set(['board', 'player']);
const DEBOUNCE_MS = 250;
// A build writes for a while; wait for it to go quiet.
const BUILD_SETTLE_MS = 1000;

// Recursive fs.watch isn't available everywhere (Linux before Node 20), so
// fall back to one watcher per folder that exists now.
function watchTree(rootDir, onChange) {
    try {
        const watcher = fs.watch(rootDir, { recursive: true }, (_event, filename) => {
            if (filename) onChange(String(filename));
        });
        return () => watcher.close();
    } catch {
        const watchers = [];
        const walk = (dir) => {
            try {
                watchers.push(fs.watch(dir, (_event, filename) => {
                    if (filename) onChange(path.relative(rootDir, path.join(dir, String(filename))));
                }));
            } catch {
                return;
            }
            fs.readdirSync(dir, { withFileTypes: true })
                .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
                .forEach((entry) => walk(path.join(dir, entry.name)));
        };
        walk(rootDir);
        return () => watchers.forEach((watcher) => watcher.close());
    }
}

function isEngineSource(relativePath) {
    const parts = relativePath.split(/[\\/]/);
    if (parts.length > 1 && APP_FOLDERS.has(parts[0])) return false;
    return ENGINE_SOURCE_EXTENSIONS.has(path.extname(relativePath));
}

export function watchForChanges({ cwd, useSource, onEngineChange, onAppChange }) {
    const rootDir = path.join(cwd, useSource ? 'src' : 'dist');
    if (!fs.existsSync(rootDir)) return () => {};

    let engineChanged = false;
    let appChanged = false;
    let timer = null;

    // `vite build` empties dist/ before writing it again: wait until the
    // pages are back rather than reloading the screens into a 404.
    const buildIsComplete = () => useSource
        || ['board.html', 'player.html'].every((file) => fs.existsSync(path.join(rootDir, file)));

    const flush = () => {
        timer = null;
        if (!buildIsComplete()) {
            timer = setTimeout(flush, BUILD_SETTLE_MS);
            return;
        }
        const engine = engineChanged;
        const app = appChanged;
        engineChanged = false;
        appChanged = false;
        if (engine) onEngineChange();
        if (app) onAppChange();
    };

    const stop = watchTree(rootDir, (relativePath) => {
        if (useSource) {
            if (!isEngineSource(relativePath)) return;
            engineChanged = true;
        } else if (/^engine\.c?js$/.test(relativePath)) {
            engineChanged = true;
        } else {
            appChanged = true;
        }
        clearTimeout(timer);
        timer = setTimeout(flush, useSource ? DEBOUNCE_MS : BUILD_SETTLE_MS);
    });

    return () => {
        clearTimeout(timer);
        stop();
    };
}
