import fs from 'fs';
import path from 'path';

export function resolveSandboxConfig({ cwd = process.cwd(), argv = process.argv.slice(2) } = {}) {
    const playerArg = argv.find((arg) => arg.startsWith('-'));
    let numPlayers = playerArg ? parseInt(playerArg.replace('-', ''), 10) : null;

    const configPath = path.join(cwd, 'game.config.json');
    let gameName = path.basename(cwd);

    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        gameName = config.name || gameName;

        if (!numPlayers) {
            numPlayers = config.minPlayers || 4;
        }
    } else if (!numPlayers) {
        numPlayers = 4;
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const buildCmd = packageJson.scripts['build:all'] ? 'build:all' : 'build';

    return { gameName, numPlayers, buildCmd };
}