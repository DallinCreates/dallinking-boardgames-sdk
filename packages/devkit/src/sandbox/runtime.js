import http from 'http';
import { spawn } from 'child_process';

import { WebSocketServer } from 'ws';

import { generateHarnessHtml } from './harness-html.js';

export async function startSandboxRuntime({
    gameName,
    numPlayers,
    previewPort,
    harnessPort,
    GameEngine,
}) {
    console.log(`\n🚀 Starting Static Preview Server...`);
    const previewProcess = spawn('npm', ['run', 'preview', '--', '--port', previewPort.toString()], { stdio: 'inherit', shell: true });

    const mockRoom = {
        code: 'DEV4',
        gameId: gameName,
        gameStarted: false,
        players: {},
    };

    function getRoomState() {
        return {
            code: mockRoom.code,
            boardId: 'board',
            gameId: mockRoom.gameId,
            gameStarted: mockRoom.gameStarted,
            boardUrl: `http://localhost:${previewPort}/board.html`,
            playerUrl: `http://localhost:${previewPort}/player.html`,
            players: Object.values(mockRoom.players),
        };
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

    function broadcastState() {
        broadcast({ type: 'room:update', room: getRoomState() });
    }

    function initializeEngine() {
        if (engine && typeof engine.onDisconnect === 'function') {
            engine.onDisconnect();
        }

        engine = new GameEngine({
            boardId: 'board',
            broadcastRoomUpdate: (payload) => broadcast(payload),
            sendMessageToPlayer: (id, payload) => sendToPlayer(id, payload),
            sendMessageToBoard: (payload) => sendToBoard(payload),
        });

        try {
            if (typeof engine.onInit === 'function') engine.onInit();
        } catch (error) {
            console.error('⚠️ Engine onInit error:', error);
        }

        if (!engine.state) engine.state = {};
        if (!engine.state.players) engine.state.players = {};
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
                    initializeEngine();
                    ws.send(JSON.stringify({ targetId: 'harness', data: { type: 'DEV_FORCE_RELOAD' } }));
                    break;

                case 'room:create':
                    mockRoom.gameId = payload.gameId || gameName;
                    try {
                        engine.onPlayerJoin('board', 'Board', mockRoom.gameStarted);
                    } catch (error) { }
                    sendToBoard({ type: 'room:created', room: getRoomState() });
                    break;

                case 'room:join': {
                    const playerName = payload.name || `Player ${senderId.split('_')[1]}`;
                    const isFirst = Object.keys(mockRoom.players).length === 0;

                    mockRoom.players[senderId] = { id: senderId, name: playerName, isVip: isFirst };
                    try {
                        engine.onPlayerJoin(senderId, playerName, mockRoom.gameStarted);
                    } catch (error) { }

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

                    if (typeof engine.onReconnect === 'function') engine.onReconnect(senderId);
                    break;

                case 'room:start':
                    if (!isBoard && !isVip && senderId !== 'harness') {
                        sendToPlayer(senderId, { type: 'system:error', message: 'Only the VIP or Board can start the game.' });
                        return;
                    }

                    mockRoom.gameStarted = true;
                    if (typeof engine.onGameStart === 'function') engine.onGameStart();

                    sendToBoard({ type: 'room:game-started', gameId: mockRoom.gameId, boardUrl: getRoomState().boardUrl });
                    Object.keys(mockRoom.players).forEach((playerId) => {
                        sendToPlayer(playerId, { type: 'room:game-started', gameId: mockRoom.gameId, playerUrl: getRoomState().playerUrl });
                    });
                    broadcastState();
                    break;

                case 'room:leave':
                    delete mockRoom.players[senderId];
                    if (typeof engine.onPlayerLeave === 'function') engine.onPlayerLeave(senderId);
                    sendToPlayer(senderId, { type: 'room:left' });
                    broadcastState();
                    break;

                default: {
                    const resolvedActionType = actionType === 'game:action' ? (payload?.action || actionType) : actionType;
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