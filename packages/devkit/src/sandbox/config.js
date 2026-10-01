import fs from 'fs';
import path from 'path';

export function resolveSandboxConfig({ cwd = process.cwd(), argv = process.argv.slice(2) } = {}) {
    const playerArg = argv.find((arg) => arg.match(/^-\d+$/));
    let numPlayers = playerArg ? parseInt(playerArg.replace('-', ''), 10) : null;

    const isDev = argv.includes('-dev');
    const hotReload = !argv.includes('--no-hot');

    // Scaffolded projects keep it in public/ so Vite copies it into dist/.
    const configPath = [path.join(cwd, 'public', 'game.config.json'), path.join(cwd, 'game.config.json')]
        .find((candidate) => fs.existsSync(candidate));
    let gameName = path.basename(cwd);

    if (configPath) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        gameName = config.name || gameName;

        if (!numPlayers) {
            numPlayers = config.players?.min || 4;
        }

        // The sandbox doesn't enforce limits, so you can test edge cases, but
        // a real room would refuse this count.
        const { min, max } = config.players || {};
        if ((min && numPlayers < min) || (max && numPlayers > max)) {
            console.warn(`⚠️  ${numPlayers} players is outside players ${min || 1}–${max || '∞'} in game.config.json. Real rooms won't start with this count.`);
        }
    } else if (!numPlayers) {
        numPlayers = 4;
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const buildCmd = packageJson.scripts['build:all'] ? 'build:all' : 'build';

    return { gameName, numPlayers, buildCmd, isDev, hotReload };
}