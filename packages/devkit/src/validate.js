import fs from 'fs';
import path from 'path';
import { validateGameConfig } from './config-rules.js';
import { loadSandboxEngine } from './sandbox/engine-loader.js';

// BaseGameEngine declares these abstract, but JavaScript doesn't enforce
// that: a missing one only shows up when a room calls it.
export const REQUIRED_HOOKS = ['onInit', 'onPlayerJoin', 'onPlayerLeave', 'processAction', 'onReconnect', 'onDisconnect'];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COVER_MIN_SHORT_SIDE = 600;
const COVER_MAX_BYTES = 2 * 1024 * 1024;

const toPosix = (value) => value.split(path.sep).join('/');

// Every file under `dir`, as forward-slash paths relative to it (the way zip
// entries and gallery `src` values are written).
function listReleaseFiles(dir, prefix = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results.push(...listReleaseFiles(path.join(dir, entry.name), relativePath));
        } else {
            results.push(relativePath);
        }
    }
    return results;
}

// Where the release's files live: public/ before a build (Vite copies it
// into dist/), dist/ after one. Older projects keep the config at the root.
export function resolveConfigLocation(cwd, { dist = false } = {}) {
    const candidates = dist
        ? [path.join(cwd, 'dist')]
        : [path.join(cwd, 'public'), cwd];
    const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'game.config.json')));
    if (!dir) {
        const where = dist ? 'dist/' : 'public/';
        throw new Error(`No game.config.json in ${where}.${dist ? ' Build the UI first; Vite copies public/game.config.json into dist/.' : ''}`);
    }
    return { dir, configPath: path.join(dir, 'game.config.json') };
}

// Checks a project's game.config.json against the upload rules. Throws with
// the first error; returns the parsed config plus non-fatal warnings. Used by
// `stamp` during the build; `validate` runs this plus the cover and engine checks.
export function validateProjectConfig({ cwd = process.cwd(), dist = false } = {}) {
    const { dir, configPath } = resolveConfigLocation(cwd, { dist });
    const label = toPosix(path.relative(cwd, configPath)) || 'game.config.json';

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        throw new Error(`${label} isn't valid JSON: ${error.message}`);
    }

    // Before a build, the release root is public/ (or the project root for
    // older layouts, where listing node_modules would be pointless).
    const isProjectRoot = path.resolve(dir) === path.resolve(cwd);
    const files = isProjectRoot ? undefined : listReleaseFiles(dir);
    const relativeDir = toPosix(path.relative(cwd, dir));
    const problem = validateGameConfig(config, { files, filesLabel: `${relativeDir}/` });
    if (problem) {
        throw new Error(`${label}: ${problem}`);
    }

    const warnings = [];
    if (files && !files.includes('cover.png')) {
        warnings.push(`No cover.png in ${relativeDir}/. Catalog cards will show a plain gradient.`);
    }
    if (!config.subtitle) warnings.push('No "subtitle". Catalog cards and search results will have no description.');
    if (!config.players) warnings.push('No "players". Rooms will have no player limits, and the Explore player filter will hide your game.');

    return { config, configPath, dir, warnings };
}

// Reads a PNG's dimensions from its IHDR chunk, or null if it isn't a PNG.
function readPngSize(filePath) {
    const header = Buffer.alloc(24);
    const fd = fs.openSync(filePath, 'r');
    try {
        fs.readSync(fd, header, 0, 24, 0);
    } finally {
        fs.closeSync(fd);
    }
    if (!header.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function checkCover(dir, relativeDir, report) {
    const coverPath = path.join(dir, 'cover.png');
    if (!fs.existsSync(coverPath)) {
        report.error('Cover', `No cover.png in ${relativeDir}/. Catalog cards, the lobby picker and your game page all use it.`);
        return;
    }

    const size = readPngSize(coverPath);
    if (!size) {
        report.error('Cover', 'cover.png isn\'t a PNG file. Export it as PNG (renaming a .jpg isn\'t enough).');
        return;
    }

    const { width, height } = size;
    const bytes = fs.statSync(coverPath).size;
    report.pass('Cover', `cover.png ${width}×${height}, ${Math.round(bytes / 1024)} KB`);

    if (Math.min(width, height) < COVER_MIN_SHORT_SIDE) {
        report.warn('Cover', `cover.png is ${width}×${height}. Make the short side at least ${COVER_MIN_SHORT_SIDE}px so it stays sharp; 1200×1800 is ideal.`);
    }
    if (Math.abs(width / height - 2 / 3) > 0.05) {
        report.warn('Cover', `cover.png is ${width}×${height}, not 2:3 portrait. Catalog cards crop it to 2:3, so keep the important parts centered.`);
    }
    if (bytes > COVER_MAX_BYTES) {
        report.warn('Cover', `cover.png is ${(bytes / 1024 / 1024).toFixed(1)} MB. The catalog loads many covers at once; aim for under 2 MB.`);
    }
}

function checkPlayers(config, report) {
    const { min, max, recommended } = config.players || {};
    if (!config.players) {
        report.warn('Players', 'No "players" in game.config.json. Rooms will start with any count, and the Explore player filter will hide your game.');
        return;
    }
    const range = min && max ? (min === max ? `exactly ${min}` : `${min}–${max}`) : min ? `${min}+` : `up to ${max}`;
    report.pass('Players', `${range} players${recommended ? `, best at ${recommended}` : ''}`);
    if (!min) report.warn('Players', 'No "players.min". A room can start with a single player.');
    if (!max) report.warn('Players', 'No "players.max". Rooms won\'t stop anyone from joining.');
}

// Finds the first value that wouldn't survive the trip through JSON, and
// returns where it is ("state.seen: Map"), or null. A round-trip comparison
// can't do this: a Map stringifies to "{}" both times.
function findNonJson(value, where = 'state', seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? null : `${where}: ${value}`;
    if (typeof value !== 'object') return `${where}: ${typeof value}`;
    if (seen.has(value)) return `${where}: circular reference`;
    seen.add(value);

    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            const problem = findNonJson(value[i], `${where}[${i}]`, seen);
            if (problem) return problem;
        }
        return null;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return `${where}: ${value.constructor?.name || 'class instance'}`;
    for (const [key, child] of Object.entries(value)) {
        if (child === undefined) continue; // dropped by JSON, harmless
        const problem = findNonJson(child, `${where}.${key}`, seen);
        if (problem) return problem;
    }
    return null;
}

// Games that never call gameOver() still work, but get no results screen or
// Tonight scoreboard. Searches the engine's sources (the built bundle also
// contains the SDK's own gameOver, so it can't tell).
function checkGameOverCall(cwd, report) {
    const engineDir = path.join(cwd, 'src', 'engine');
    if (!fs.existsSync(engineDir)) return;
    const sources = listReleaseFiles(engineDir).filter((file) => /\.(c|m)?(j|t)sx?$/.test(file));
    const callsGameOver = sources.some((file) => /\bgameOver\s*\(/.test(fs.readFileSync(path.join(engineDir, file), 'utf8')));
    if (!callsGameOver) {
        report.warn('Engine', 'Your engine never calls this.gameOver(), so players get no results screen and the game won\'t count on the Tonight scoreboard.');
    }
}

// Loads the engine and walks it through the start of a game with stubbed
// platform calls: the same order a real room uses.
async function checkEngine(cwd, { dist }, config, report) {
    let Engine;
    let label;
    try {
        const built = path.join(cwd, 'dist', 'engine.cjs');
        label = dist || !fs.existsSync(path.join(cwd, 'src', 'engine', 'engine.js')) ? 'dist/engine.cjs' : 'src/engine/engine.js';
        if (dist && !fs.existsSync(built)) {
            report.error('Engine', 'dist/engine.cjs not found. Run "npm run build" first.');
            return;
        }
        Engine = await loadSandboxEngine(cwd, { preferSource: !dist });
    } catch (error) {
        report.error('Engine', `Couldn't load your engine: ${error.message}`);
        return;
    }

    if (typeof Engine !== 'function') {
        report.error('Engine', `${label} must export your engine class as its default export.`);
        return;
    }
    if (!Engine.sdkVersion) {
        report.warn('Engine', 'Your engine doesn\'t inherit sdkVersion. Make sure it extends BaseGameEngine from @dallincreates/boardgame-server 1.1 or newer.');
    }

    const missing = REQUIRED_HOOKS.filter((hook) => typeof Engine.prototype[hook] !== 'function');
    if (missing.length > 0) {
        report.error('Engine', `Missing required ${missing.length === 1 ? 'hook' : 'hooks'}: ${missing.join(', ')}. Every engine must implement ${REQUIRED_HOOKS.join(', ')}.`);
        return;
    }
    report.pass('Engine', `${label} implements all ${REQUIRED_HOOKS.length} required hooks`);

    if (Engine.prototype.onPlayAgain !== undefined && typeof Engine.prototype.onPlayAgain !== 'function') {
        report.error('Engine', 'onPlayAgain must be a method (or left undefined to restart with a fresh engine).');
        return;
    }
    checkGameOverCall(cwd, report);

    const badTypes = new Set();
    const capture = (message) => {
        if (!message || typeof message.type !== 'string') badTypes.add(String(message?.type));
        else if (!message.type.startsWith('game:') && message.type !== 'system:error') badTypes.add(message.type);
    };
    const engine = new Engine({
        boardId: 'validate-board',
        broadcastRoomUpdate: capture,
        sendMessageToPlayer: (_id, message) => capture(message),
        sendMessageToBoard: capture,
    });

    const playerCount = Math.max(config.players?.min || 2, 1);
    const steps = [
        ['onInit()', () => engine.onInit()],
        ...Array.from({ length: playerCount }, (_, i) => [
            `onPlayerJoin("player-${i + 1}")`,
            () => engine.onPlayerJoin(`player-${i + 1}`, `Player ${i + 1}`, false),
        ]),
        ['onGameStart()', () => engine.onGameStart()],
    ];

    try {
        for (const [step, run] of steps) {
            try {
                run();
            } catch (error) {
                report.error('Engine', `${step} threw: ${error.message}`);
                return;
            }
            const nonJson = findNonJson(engine.state);
            if (nonJson) {
                report.error('Engine', `After ${step}, this.state isn't plain JSON (${nonJson}). Use objects, arrays, strings, numbers, booleans and null; no Map, Set, Date or class instances.`);
                return;
            }
        }
        if (!engine.hasStarted) {
            report.warn('Engine', 'hasStarted is still false after onGameStart(). Call super.onGameStart() in your override.');
        }
        report.pass('Engine', `Starts a game with ${playerCount} players`);
        if (badTypes.size > 0) {
            report.warn('Engine', `Sent message types the platform drops: ${[...badTypes].join(', ')}. Engine messages must start with "game:".`);
        }
    } finally {
        try {
            engine.destroy?.();
        } catch {
            // Reported nowhere: a broken destroy() can't affect the result.
        }
    }
}

function createReport() {
    const results = [];
    return {
        results,
        pass: (area, message) => results.push({ level: 'pass', area, message }),
        warn: (area, message) => results.push({ level: 'warn', area, message }),
        error: (area, message) => results.push({ level: 'error', area, message }),
    };
}

/**
 * The full pre-upload check: config rules, player counts, the cover image and
 * the engine's hooks. Never throws for problems in the project; they come back
 * as results with level "error".
 */
export async function checkRelease({ cwd = process.cwd(), dist = false } = {}) {
    const report = createReport();

    let configResult;
    try {
        configResult = validateProjectConfig({ cwd, dist });
    } catch (error) {
        report.error('Config', error.message);
    }

    if (configResult) {
        const { config, configPath, dir } = configResult;
        report.pass('Config', `${toPosix(path.relative(cwd, configPath))}: ${config.name || config.id} ${config.version}`);
        if (!config.subtitle) report.warn('Config', 'No "subtitle". Catalog cards and search results will have no description.');
        checkPlayers(config, report);
        checkCover(dir, toPosix(path.relative(cwd, dir)) || '.', report);
        await checkEngine(cwd, { dist }, config, report);
    }

    const errors = report.results.filter((result) => result.level === 'error');
    const warnings = report.results.filter((result) => result.level === 'warn');
    return { ok: errors.length === 0, results: report.results, errors, warnings };
}

const ICONS = { pass: '✅', warn: '⚠️ ', error: '❌' };

export async function runValidate({ cwd = process.cwd(), argv = [] } = {}) {
    const dist = argv.includes('--dist');
    const { ok, results, errors, warnings } = await checkRelease({ cwd, dist });

    console.log('');
    for (const { level, area, message } of results) {
        console.log(`${ICONS[level]} ${area.padEnd(8)} ${message}`);
    }
    console.log('');

    if (ok) {
        console.log(warnings.length > 0
            ? `Ready to upload, with ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'} worth a look.`
            : 'Ready to upload.');
    } else {
        console.log(`${errors.length} ${errors.length === 1 ? 'problem' : 'problems'} to fix before uploading.`);
    }
    return ok;
}
