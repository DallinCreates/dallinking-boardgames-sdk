import http from 'http';
import { spawn } from 'child_process';

import { WebSocketServer } from 'ws';

import { generateHarnessHtml } from './harness-html.js';
import { normalizeGameOver, summarizeParty } from './game-results.js';

export async function startSandboxRuntime({
    gameName,
    numPlayers,
    previewPort,
    harnessPort,
    GameEngine,
    isDev,
}) {
    const npmScript = isDev ? 'dev' : 'preview';
    const serverLabel = isDev ? 'Development' : 'Static Preview';

    console.log(`\n🚀 Starting ${serverLabel} Server...`);
    const previewProcess = spawn('npm', ['run', npmScript, '--', '--port', previewPort.toString()], { stdio: 'inherit', shell: true });
    const newParty = () => ({ id: `sandbox-${Date.now()}`, startedAt: Date.now(), members: {}, games: [] });
    const mockRoom = {
        code: 'DEV4',
        gameId: gameName,
        gameStarted: false,
        players: {},
        // Game over, results and the Tonight scoreboard, as on the platform
        // (see docs/design/game-over.md).
        phase: 'lobby',
        results: null,
        gameStartedAt: null,
        gameRecorded: false,
        party: newParty(),
    };

    function getRoomState() {
        return {
            code: mockRoom.code,
            boardId: 'board',
            gameId: mockRoom.gameId,
            gameName,
            gameStarted: mockRoom.gameStarted,
            boardUrl: `http://localhost:${previewPort}/board.html`,
            playerUrl: `http://localhost:${previewPort}/player.html`,
            players: Object.values(mockRoom.players),
            phase: mockRoom.phase,
            results: mockRoom.results,
            party: summarizeParty(mockRoom.party),
        };
    }

    function sendToHarness(data) {
        if (harnessSocket) harnessSocket.send(JSON.stringify({ targetId: 'harness', data }));
    }

    function addPartyGame(record) {
        mockRoom.party.games.push({ gameId: mockRoom.gameId, gameName, startedAt: mockRoom.gameStartedAt, endedAt: Date.now(), ...record });
        mockRoom.gameRecorded = true;
    }

    function recordGameOver(rawResults) {
        if (!mockRoom.gameStarted) return "The game hasn't started.";
        if (mockRoom.phase === 'results') return 'Results were already recorded for this game.';
        const seated = Object.values(mockRoom.players).map(({ id, name }) => ({ id, name }));
        const { error, results } = normalizeGameOver(rawResults, seated);
        if (error) return error;

        const endedAt = Date.now();
        mockRoom.results = { gameId: mockRoom.gameId, gameName, startedAt: mockRoom.gameStartedAt, endedAt, showAt: endedAt + results.delayMs, ...results };
        mockRoom.phase = 'results';
        addPartyGame({ headline: results.headline, standings: results.standings, participants: seated.map((p) => p.id) });
        console.log(`\n[🏆 Sandbox] ${results.headline}${results.summary ? ` (${results.summary})` : ''}`);
        broadcastState();
        sendToHarness({ type: 'DEV_RESULTS', room: getRoomState() });
        return null;
    }

    function recordUnfinishedGame() {
        if (mockRoom.gameRecorded || !mockRoom.gameStarted) return;
        addPartyGame({ headline: null, standings: [], participants: Object.keys(mockRoom.players) });
    }

    function markPlaying() {
        mockRoom.gameStarted = true;
        mockRoom.phase = 'playing';
        mockRoom.results = null;
        mockRoom.gameStartedAt = Date.now();
        mockRoom.gameRecorded = false;
    }

    // A fresh engine with everyone seated, as when a game is picked.
    function freshEngineWithPlayers() {
        initializeEngine();
        Object.values(mockRoom.players).forEach((player) => {
            try {
                engine.onPlayerJoin(player.id, player.name, false);
            } catch (error) {
                console.error('⚠️ onPlayerJoin error:', error);
            }
        });
    }

    let harnessSocket = null;
    let engine = null;

    function decoratePayload(payload, clientId) {
        return { ...payload, clientId };
    }

    function sendToBoard(payload) {
        if (harnessSocket) {
            harnessSocket.send(JSON.stringify({ targetId: 'board', data: decoratePayload(payload, 'board') }));
        }
    }

    function sendToPlayer(clientId, payload) {
        if (clientId === 'board') {
            sendToBoard(payload);
            return;
        }

        if (harnessSocket && mockRoom.players[clientId]) {
            harnessSocket.send(JSON.stringify({ targetId: clientId, data: decoratePayload(payload, clientId) }));
        }
    }

    function broadcast(payload) {
        sendToBoard(payload);
        Object.keys(mockRoom.players).forEach((playerId) => sendToPlayer(playerId, payload));
    }

    // Mirrors the platform's snapshot: getBoardState/getPlayerState when the
    // engine has them, raw state otherwise, sent as game:sync_state.
    function sendStateSnapshot(clientId, isBoard) {
        if (!engine || !engine.hasStarted) return;
        let state;
        try {
            if (isBoard) {
                state = typeof engine.getBoardState === 'function' ? engine.getBoardState() : engine.state;
            } else {
                state = typeof engine.getPlayerState === 'function' ? engine.getPlayerState(clientId) : engine.state;
            }
        } catch (error) {
            console.error('⚠️ State snapshot error:', error);
            state = engine.state;
        }
        if (state == null) return;
        const message = { type: 'game:sync_state', payload: { state } };
        if (isBoard) sendToBoard(message);
        else sendToPlayer(clientId, message);
    }

    function broadcastState() {
        broadcast({ type: 'room:update', room: getRoomState() });
    }

    function initializeEngine() {
        // A reset retires the old engine the way the platform does, so its
        // timers don't keep firing into the new game.
        if (engine && typeof engine.destroy === 'function') {
            try {
                engine.destroy();
            } catch (error) {
                console.error('⚠️ Engine destroy error:', error);
            }
        }

        engine = new GameEngine({
            boardId: 'board',
            broadcastRoomUpdate: (payload) => broadcast(payload),
            sendMessageToPlayer: (id, payload) => sendToPlayer(id, payload),
            sendMessageToBoard: (payload) => sendToBoard(payload),
            reportGameOver: (results) => {
                const problem = recordGameOver(results);
                if (problem) {
                    console.warn(`⚠️ gameOver() rejected: ${problem}`);
                    sendToHarness({ type: 'DEV_WARNING', message: `gameOver() rejected: ${problem}` });
                }
            },
        });

        try {
            if (typeof engine.onInit === 'function') engine.onInit();
        } catch (error) {
            console.error('⚠️ Engine onInit error:', error);
        }

    }

    initializeEngine();

    const server = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(generateHarnessHtml(gameName, numPlayers, previewPort));
            return;
        }

        res.writeHead(404);
        res.end();
    });

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        harnessSocket = ws;

        ws.on('message', (message) => {
            const { senderId, data } = JSON.parse(message);
            const actionType = data.type;
            const payload = data.payload || data;

            const isBoard = senderId === 'board';
            const isVip = mockRoom.players[senderId]?.isVip || false;

            switch (actionType) {
                case 'DEV_RESET':
                    console.log(`\n[🔄 Sandbox] Resetting Server State and Client Iframes...`);
                    mockRoom.gameStarted = false;
                    mockRoom.players = {};
                    mockRoom.phase = 'lobby';
                    mockRoom.results = null;
                    mockRoom.party = newParty();
                    initializeEngine();
                    ws.send(JSON.stringify({ targetId: 'harness', data: { type: 'DEV_FORCE_RELOAD' } }));
                    break;

                case 'room:create':
                    // Like the platform, the board is never introduced to the
                    // engine as a player.
                    mockRoom.gameId = payload.gameId || gameName;
                    sendToBoard({ type: 'room:created', room: getRoomState() });
                    break;

                case 'room:join': {
                    const playerName = payload.name || `Player ${senderId.split('_')[1]}`;

                    // Already seated (the iframe reloaded): a reconnect, as on the platform.
                    if (mockRoom.players[senderId]) {
                        sendToPlayer(senderId, { type: 'room:joined', room: getRoomState() });
                        try {
                            if (typeof engine.onReconnect === 'function') engine.onReconnect(senderId, { isBoard: false, timestamp: Date.now() });
                        } catch (error) {
                            console.error('⚠️ onReconnect error:', error);
                        }
                        sendStateSnapshot(senderId, false);
                        break;
                    }

                    const isFirst = Object.keys(mockRoom.players).length === 0;
                    mockRoom.players[senderId] = { id: senderId, name: playerName, isVip: isFirst };
                    // Each sandbox player is a fixed iframe, so a returning
                    // player always keeps their ID, as party members do.
                    mockRoom.party.members[senderId] = { id: senderId, name: playerName, seated: true };
                    try {
                        engine.onPlayerJoin(senderId, playerName, mockRoom.gameStarted);
                    } catch (error) {
                        console.error('⚠️ onPlayerJoin error:', error);
                    }

                    sendToPlayer(senderId, { type: 'room:joined', room: getRoomState() });
                    broadcastState();
                    break;
                }

                case 'room:request_full_state':
                    if (isBoard) {
                        sendToBoard({ type: 'room:update', room: getRoomState() });
                    } else {
                        sendToPlayer(senderId, { type: 'room:update', room: getRoomState() });
                    }

                    // Like the platform: run the engine's reconnect hook, then
                    // send this client its own snapshot.
                    try {
                        if (typeof engine.onReconnect === 'function') engine.onReconnect(senderId, { isBoard, timestamp: Date.now() });
                    } catch (error) {
                        console.error('⚠️ onReconnect error:', error);
                    }
                    sendStateSnapshot(senderId, isBoard);
                    break;

                case 'room:start':
                    if (!isBoard && !isVip && senderId !== 'harness') {
                        sendToPlayer(senderId, { type: 'system:error', message: 'Only the VIP or Board can start the game.' });
                        return;
                    }

                    markPlaying();
                    if (typeof engine.onGameStart === 'function') engine.onGameStart();

                    sendToBoard({ type: 'room:game-started', gameId: mockRoom.gameId, boardUrl: getRoomState().boardUrl });
                    Object.keys(mockRoom.players).forEach((playerId) => {
                        sendToPlayer(playerId, { type: 'room:game-started', gameId: mockRoom.gameId, playerUrl: getRoomState().playerUrl });
                    });
                    broadcastState();
                    break;

                case 'room:leave': {
                    const leaving = mockRoom.players[senderId];
                    if (!leaving) break;
                    sendToPlayer(senderId, { type: 'room:left' });
                    delete mockRoom.players[senderId];
                    if (mockRoom.party.members[senderId]) mockRoom.party.members[senderId].seated = false;
                    // VIP passes on, as on the platform.
                    const remaining = Object.values(mockRoom.players);
                    if (leaving.isVip && remaining.length > 0) remaining[0].isVip = true;
                    try {
                        if (typeof engine.onPlayerLeave === 'function') engine.onPlayerLeave(senderId);
                    } catch (error) {
                        console.error('⚠️ onPlayerLeave error:', error);
                    }
                    broadcastState();
                    break;
                }

                // Results screen controls (the harness plays the board/VIP).
                case 'room:play_again': {
                    if (mockRoom.phase !== 'results') break;
                    if (typeof engine.onPlayAgain === 'function') {
                        try {
                            if (typeof engine.beginPlayAgain === 'function') engine.beginPlayAgain();
                            else engine.onPlayAgain();
                        } catch (error) {
                            console.error('⚠️ onPlayAgain error:', error);
                        }
                        console.log('\n[🔁 Sandbox] Play again: onPlayAgain() on the same engine');
                        markPlaying();
                    } else {
                        console.log('\n[🔁 Sandbox] Play again: no onPlayAgain(), so a fresh engine');
                        freshEngineWithPlayers();
                        markPlaying();
                        if (typeof engine.onGameStart === 'function') engine.onGameStart();
                    }
                    broadcastState();
                    sendToHarness({ type: 'DEV_RESULTS', room: getRoomState() });
                    break;
                }

                case 'room:end_game':
                    recordUnfinishedGame();
                    console.log('\n[🏠 Sandbox] Back to the lobby with a fresh engine. Press ▶ to start again.');
                    freshEngineWithPlayers();
                    mockRoom.gameStarted = false;
                    mockRoom.phase = 'lobby';
                    mockRoom.results = null;
                    broadcastState();
                    sendToHarness({ type: 'DEV_RESULTS', room: getRoomState() });
                    break;

                default: {
                    const requestedType = actionType === 'game:action' ? (payload?.action || actionType) : actionType;
                    // Like the platform: bare names get the game: prefix, and
                    // reserved namespaces never reach the engine.
                    if (typeof requestedType !== 'string' || /^(room|system|connection|webrtc):/.test(requestedType)) break;
                    const resolvedActionType = requestedType.startsWith('game:') ? requestedType : `game:${requestedType}`;
                    const enrichedMeta = { playerId: senderId, isBoard, isVip, timestamp: Date.now() };

                    if (typeof engine.processAction === 'function') {
                        try {
                            engine.processAction(resolvedActionType, payload, enrichedMeta);
                        } catch (error) {
                            console.error(`⚠️ processAction error:`, error);
                        }
                    }
                    break;
                }
            }
        });

        ws.on('close', () => {
            if (harnessSocket === ws) {
                harnessSocket = null;
            }

            if (engine && typeof engine.onDisconnect === 'function') engine.onDisconnect();
        });
    });

    await new Promise((resolve, reject) => {
        const handleStartupError = (error) => {
            if (!previewProcess.killed) {
                previewProcess.kill();
            }

            if (error?.code === 'EADDRINUSE') {
                reject(new Error(`Sandbox harness port ${harnessPort} is already in use. Stop the existing sandbox (or other process) on that port, then try again.`));
                return;
            }

            reject(error);
        };

        server.once('error', handleStartupError);
        wss.once('error', handleStartupError);

        server.listen(harnessPort, () => {
            console.log(`\n========================================`);
            console.log(`🎮 Simulator Ready for: ${gameName}`);
            console.log(`👉 Open http://localhost:${harnessPort}`);
            console.log(`========================================\n`);
            resolve();
        });
    });

    await new Promise((resolve) => {
        let shuttingDown = false;

        const shutdown = () => {
            if (shuttingDown) return;
            shuttingDown = true;

            if (!previewProcess.killed) {
                previewProcess.kill();
            }

            wss.close();
            server.close(() => resolve());
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        previewProcess.on('exit', shutdown);
    });
}