import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';

import { WebSocketServer } from 'ws';

import { generateHarnessHtml } from './harness-html.js';
import { normalizeGameOver, summarizeParty } from './game-results.js';
import { createNetworkSimulator } from './network.js';
import { createHistory } from './history.js';
import { watchForChanges } from './hot-reload.js';
import { reloadSandboxEngine } from './engine-loader.js';

export async function startSandboxRuntime({
    cwd = process.cwd(),
    gameName,
    numPlayers,
    previewPort,
    harnessPort,
    GameEngine,
    isDev,
    hotReload = true,
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

    const network = createNetworkSimulator();
    const history = createHistory();

    let EngineClass = GameEngine;
    let harnessSocket = null;
    let engine = null;
    // > 0 while the sandbox is inside an engine hook. Messages the engine
    // sends outside one came from a timer, and get their own timeline entry.
    let engineDepth = 0;
    // Swallows engine output while a hot reload rebuilds the engine.
    let silenced = false;
    let asyncCheckPending = false;

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

    function deliver(targetId, data) {
        if (harnessSocket) harnessSocket.send(JSON.stringify({ targetId, data }));
    }

    function sendToHarness(data) {
        deliver('harness', data);
    }

    function toast(message, tone = 'info') {
        sendToHarness({ type: 'DEV_TOAST', message, tone });
    }

    function actorName(clientId) {
        if (!clientId || clientId === 'harness') return 'Sandbox';
        if (clientId === 'board') return 'Board';
        return mockRoom.players[clientId]?.name || mockRoom.party.members[clientId]?.name || clientId;
    }

    // ---------------------------------------------------------------
    // Timeline (state inspector)
    // ---------------------------------------------------------------

    function recordHistory(kind, { label, actor, payload, error } = {}, { onlyIfChanged = false } = {}) {
        const entry = history.record({
            kind,
            label,
            actor: actor ? actorName(actor) : null,
            payload,
            engine,
            room: mockRoom,
            error,
            onlyIfChanged,
        });
        if (entry) sendToHarness({ type: 'DEV_HISTORY_ENTRY', entry });
    }

    function sendHistory(notice) {
        sendToHarness({ type: 'DEV_HISTORY', entries: history.all(), notice });
    }

    function noteEngineOutput() {
        if (engineDepth > 0 || asyncCheckPending) return;
        asyncCheckPending = true;
        setImmediate(() => {
            asyncCheckPending = false;
            recordHistory('timer', { label: 'Timer / async update' }, { onlyIfChanged: true });
        });
    }

    /**
     * Calls an engine hook the way the platform does: a throw is logged and
     * the room carries on. With `entry`, the result goes on the timeline.
     */
    function callEngine(hook, args = [], entry = null) {
        let error = null;
        if (engine && typeof engine[hook] === 'function') {
            engineDepth += 1;
            try {
                engine[hook](...args);
            } catch (caught) {
                error = caught;
                console.error(`⚠️ ${hook} error:`, caught);
            } finally {
                engineDepth -= 1;
            }
        }
        if (entry) recordHistory(entry.kind, { ...entry, error });
        return error;
    }

    // ---------------------------------------------------------------
    // Messages to screens (through the simulated network)
    // ---------------------------------------------------------------

    function decoratePayload(payload, clientId) {
        return { ...payload, clientId };
    }

    function sendToBoard(payload) {
        const data = decoratePayload(payload, 'board');
        network.toClient('board', () => deliver('board', data));
    }

    function sendToPlayer(clientId, payload) {
        if (clientId === 'board') {
            sendToBoard(payload);
            return;
        }

        if (mockRoom.players[clientId]) {
            const data = decoratePayload(payload, clientId);
            network.toClient(clientId, () => deliver(clientId, data));
        }
    }

    function broadcast(payload) {
        sendToBoard(payload);
        Object.keys(mockRoom.players).forEach((playerId) => sendToPlayer(playerId, payload));
    }

    // Mirrors the platform's snapshot: getBoardState/getPlayerState when the
    // engine has them, raw state otherwise, sent as game:sync_state. `force`
    // sends one before Start too (rewinds and hot reloads).
    function sendStateSnapshot(clientId, isBoard, { force = false } = {}) {
        if (!engine || (!engine.hasStarted && !force)) return;
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

    function sendSnapshotsToEveryone(options) {
        sendStateSnapshot('board', true, options);
        Object.keys(mockRoom.players).forEach((playerId) => sendStateSnapshot(playerId, false, options));
    }

    function broadcastState() {
        broadcast({ type: 'room:update', room: getRoomState() });
        sendToHarness({ type: 'DEV_ROOM', room: getRoomState() });
    }

    function sendNetworkState() {
        sendToHarness({ type: 'DEV_NETWORK', network: network.describe() });
    }

    // ---------------------------------------------------------------
    // Game over, results and the party
    // ---------------------------------------------------------------

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

    // ---------------------------------------------------------------
    // The engine
    // ---------------------------------------------------------------

    const fromEngine = (send) => (...args) => {
        if (silenced) return;
        send(...args);
        noteEngineOutput();
    };

    function initializeEngine({ record = true } = {}) {
        // A reset retires the old engine the way the platform does, so its
        // timers don't keep firing into the new game.
        callEngine('destroy');

        engine = new EngineClass({
            boardId: 'board',
            broadcastRoomUpdate: fromEngine((payload) => broadcast(payload)),
            sendMessageToPlayer: fromEngine((id, payload) => sendToPlayer(id, payload)),
            sendMessageToBoard: fromEngine((payload) => sendToBoard(payload)),
            reportGameOver: (results) => {
                const problem = recordGameOver(results);
                if (problem) {
                    console.warn(`⚠️ gameOver() rejected: ${problem}`);
                    sendToHarness({ type: 'DEV_WARNING', message: `gameOver() rejected: ${problem}` });
                }
            },
        });

        callEngine('onInit', [], record ? { kind: 'init', label: 'onInit()' } : null);
    }

    // A fresh engine with everyone seated, as when a game is picked.
    function freshEngineWithPlayers() {
        initializeEngine({ record: false });
        Object.values(mockRoom.players).forEach((player) => {
            callEngine('onPlayerJoin', [player.id, player.name, false]);
        });
    }

    // Rewinds to a timeline entry: its state, its phase, and whether the game
    // had started or ended. Later entries are dropped. Timers the engine
    // started aren't rewound.
    function rewindTo(id) {
        const entry = history.get(id);
        if (!entry) return;
        if (!entry.stateOk) {
            toast(`#${id} can't be restored: its state wasn't plain JSON.`, 'error');
            return;
        }

        engine.state = JSON.parse(entry.stateJson);
        engine.hasStarted = entry.hasStarted;
        // BaseGameEngine keeps isGameOver in this field.
        if ('gameOverReported' in engine) engine.gameOverReported = entry.isGameOver;
        Object.assign(mockRoom, entry.room);

        const dropped = history.truncateAfter(id);
        console.log(`\n[⏪ Sandbox] Rewound to #${id} (${entry.label})${dropped ? `; dropped ${dropped} later entries` : ''}`);
        broadcastState();
        sendSnapshotsToEveryone({ force: true });
        sendToHarness({ type: 'DEV_RESULTS', room: getRoomState() });
        sendHistory(`Rewound to #${id}${dropped ? ` · ${dropped} later ${dropped === 1 ? 'entry' : 'entries'} dropped` : ''}`);
    }

    // What one screen would receive at a timeline entry: getBoardState() or
    // getPlayerState(id), run against that entry's state.
    function computeView(id, view) {
        const entry = id ? history.get(id) : history.latest();
        if (!entry) return { error: 'That entry is gone.' };
        const liveState = engine.state;
        silenced = true;
        try {
            engine.state = JSON.parse(entry.stateJson);
            let value = engine.state;
            if (view === 'board' && typeof engine.getBoardState === 'function') {
                value = engine.getBoardState();
            } else if (view.startsWith('player:') && typeof engine.getPlayerState === 'function') {
                value = engine.getPlayerState(view.slice('player:'.length));
            }
            return { json: JSON.stringify(value === undefined ? null : value) };
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        } finally {
            engine.state = liveState;
            silenced = false;
        }
    }

    // ---------------------------------------------------------------
    // Hot reload
    // ---------------------------------------------------------------

    // Swaps in the edited engine and keeps the game going: a new instance gets
    // onInit and everyone's onPlayerJoin (its output discarded), then the old
    // state, the way the platform restores a checkpoint.
    async function hotReloadEngine() {
        let NextEngine;
        try {
            NextEngine = await reloadSandboxEngine(cwd, { preferSource: isDev });
            if (typeof NextEngine !== 'function') throw new Error('The engine has no default-exported class.');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`\n❌ Engine reload failed; still running the previous engine.\n${message}`);
            toast(`Engine reload failed: ${message}`, 'error');
            return;
        }

        let savedState = engine.state;
        try {
            savedState = JSON.parse(JSON.stringify(engine.state));
        } catch {
            // Not JSON: carry the object over as it is.
        }
        const saved = { state: savedState, hasStarted: engine.hasStarted, isGameOver: Boolean(engine.isGameOver) };

        EngineClass = NextEngine;
        silenced = true;
        try {
            freshEngineWithPlayers();
        } finally {
            silenced = false;
        }
        engine.state = saved.state;
        engine.hasStarted = saved.hasStarted;
        if ('gameOverReported' in engine) engine.gameOverReported = saved.isGameOver;

        sendSnapshotsToEveryone({ force: true });
        recordHistory('reload', { label: '♻ Engine reloaded' });
        console.log('\n[♻ Sandbox] Engine reloaded; game state kept.');
        toast('♻ Engine reloaded. Game state kept.');
    }

    let reloadChain = Promise.resolve();
    const queueHotReload = () => {
        reloadChain = reloadChain.then(hotReloadEngine);
    };

    function reloadScreens() {
        console.log('\n[♻ Sandbox] New build: reloading the screens.');
        sendToHarness({ type: 'DEV_FORCE_RELOAD' });
        toast('♻ New build loaded. Game state kept.');
    }

    // ---------------------------------------------------------------
    // Simulated disconnects
    // ---------------------------------------------------------------

    function disconnectPlayer(clientId) {
        const player = mockRoom.players[clientId];
        if (!player || !network.disconnect(clientId)) return;
        player.connected = false;
        console.log(`\n[📴 Sandbox] ${player.name} disconnected`);
        callEngine('onDisconnect', [clientId, { isBoard: false, timestamp: Date.now() }], { kind: 'disconnect', label: '📴 onDisconnect()', actor: clientId });
        broadcastState();
        sendNetworkState();
    }

    // As on the platform: room:reconnected, onReconnect, a fresh snapshot,
    // then whatever the phone tried to send while it was away.
    function reconnectPlayer(clientId) {
        const player = mockRoom.players[clientId];
        const heldMessages = network.reconnect(clientId);
        if (!player || !heldMessages) return;
        player.connected = true;
        console.log(`\n[📶 Sandbox] ${player.name} reconnected${heldMessages.length ? `, resending ${heldMessages.length} queued action(s)` : ''}`);
        sendToPlayer(clientId, { type: 'room:reconnected', room: getRoomState() });
        callEngine('onReconnect', [clientId, { isBoard: false, timestamp: Date.now() }], { kind: 'reconnect', label: '📶 onReconnect()', actor: clientId });
        sendStateSnapshot(clientId, false);
        broadcastState();
        heldMessages.forEach((send) => network.fromClient(clientId, send));
        sendNetworkState();
    }

    // ---------------------------------------------------------------
    // Messages from screens
    // ---------------------------------------------------------------

    function handleClientMessage(senderId, data) {
        const actionType = data.type;
        const payload = data.payload || data;

        const isBoard = senderId === 'board';
        const isVip = mockRoom.players[senderId]?.isVip || false;

        switch (actionType) {
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
                    callEngine('onReconnect', [senderId, { isBoard: false, timestamp: Date.now() }], { kind: 'reconnect', label: '🔄 onReconnect() (reload)', actor: senderId });
                    sendStateSnapshot(senderId, false);
                    break;
                }

                const isFirst = Object.keys(mockRoom.players).length === 0;
                mockRoom.players[senderId] = { id: senderId, name: playerName, isVip: isFirst, connected: true };
                // Each sandbox player is a fixed iframe, so a returning
                // player always keeps their ID, as party members do.
                mockRoom.party.members[senderId] = { id: senderId, name: playerName, seated: true };
                callEngine('onPlayerJoin', [senderId, playerName, mockRoom.gameStarted], {
                    kind: 'join',
                    label: `onPlayerJoin()${mockRoom.gameStarted ? ' (late)' : ''}`,
                    actor: senderId,
                });

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
                callEngine('onReconnect', [senderId, { isBoard, timestamp: Date.now() }]);
                sendStateSnapshot(senderId, isBoard);
                break;

            case 'room:start':
                if (!isBoard && !isVip && senderId !== 'harness') {
                    sendToPlayer(senderId, { type: 'system:error', message: 'Only the VIP or Board can start the game.' });
                    return;
                }

                markPlaying();
                callEngine('onGameStart', [], { kind: 'start', label: '▶ onGameStart()', actor: senderId });

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
                callEngine('onPlayerLeave', [senderId], { kind: 'leave', label: 'onPlayerLeave()', actor: senderId });
                broadcastState();
                break;
            }

            // Results screen controls (the harness plays the board/VIP).
            case 'room:play_again': {
                if (mockRoom.phase !== 'results') break;
                if (typeof engine.onPlayAgain === 'function') {
                    callEngine(typeof engine.beginPlayAgain === 'function' ? 'beginPlayAgain' : 'onPlayAgain');
                    console.log('\n[🔁 Sandbox] Play again: onPlayAgain() on the same engine');
                    markPlaying();
                    recordHistory('start', { label: '🔁 onPlayAgain()', actor: senderId });
                } else {
                    console.log('\n[🔁 Sandbox] Play again: no onPlayAgain(), so a fresh engine');
                    freshEngineWithPlayers();
                    markPlaying();
                    callEngine('onGameStart', [], { kind: 'start', label: '🔁 Play again: new engine, onGameStart()', actor: senderId });
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
                recordHistory('init', { label: '🏠 Back to lobby: new engine', actor: senderId });
                broadcastState();
                sendToHarness({ type: 'DEV_RESULTS', room: getRoomState() });
                break;

            default: {
                const requestedType = actionType === 'game:action' ? (payload?.action || actionType) : actionType;
                // Like the platform: bare names get the game: prefix, and
                // reserved namespaces never reach the engine.
                if (typeof requestedType !== 'string' || /^(room|system|connection|webrtc|platform):/.test(requestedType)) break;
                const resolvedActionType = requestedType.startsWith('game:') ? requestedType : `game:${requestedType}`;
                const enrichedMeta = { playerId: senderId, isBoard, isVip, timestamp: Date.now() };

                callEngine('processAction', [resolvedActionType, payload, enrichedMeta], {
                    kind: 'action',
                    label: resolvedActionType,
                    actor: senderId,
                    payload,
                });
                break;
            }
        }
    }

    function resetSandbox() {
        console.log(`\n[🔄 Sandbox] Resetting Server State and Client Iframes...`);
        mockRoom.gameStarted = false;
        mockRoom.players = {};
        mockRoom.phase = 'lobby';
        mockRoom.results = null;
        mockRoom.party = newParty();
        network.reset();
        history.clear();
        initializeEngine();
        sendHistory();
        sendNetworkState();
        sendToHarness({ type: 'DEV_FORCE_RELOAD' });
    }

    function handleHarnessMessage(data) {
        const payload = data.payload || {};

        switch (data.type) {
            case 'DEV_HELLO':
                sendHistory();
                sendNetworkState();
                sendToHarness({ type: 'DEV_ROOM', room: getRoomState() });
                break;

            case 'DEV_RESET':
                resetSandbox();
                break;

            case 'DEV_SET_LAG':
                network.setLag(payload.clientId || null, payload.preset || null);
                sendNetworkState();
                break;

            case 'DEV_DISCONNECT':
                disconnectPlayer(payload.clientId);
                break;

            case 'DEV_RECONNECT':
                reconnectPlayer(payload.clientId);
                break;

            case 'DEV_TIME_TRAVEL':
                rewindTo(payload.id);
                break;

            case 'DEV_VIEW':
                sendToHarness({ type: 'DEV_VIEW_RESULT', id: payload.id, view: payload.view, ...computeView(payload.id, String(payload.view || 'engine')) });
                break;

            default:
                // Start, Play again and Pick another game: the harness acts
                // as the board.
                handleClientMessage('harness', data);
                break;
        }
    }

    initializeEngine();

    const server = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(generateHarnessHtml({ gameName, playersCount: numPlayers, previewPort, isDev, hotReload }));
            return;
        }

        res.writeHead(404);
        res.end();
    });

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        harnessSocket = ws;

        ws.on('message', (message) => {
            let parsed;
            try {
                parsed = JSON.parse(message);
            } catch {
                return;
            }
            const { senderId, data } = parsed || {};
            if (!data || typeof data.type !== 'string') return;

            if (senderId === 'harness') {
                handleHarnessMessage(data);
                return;
            }
            network.fromClient(senderId, () => handleClientMessage(senderId, data));
        });

        ws.on('close', () => {
            if (harnessSocket === ws) {
                harnessSocket = null;
            }

            callEngine('onDisconnect');
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

    // -dev reloads the engine from src/ (Vite already hot-reloads the apps).
    // Otherwise a new build in dist/ swaps the engine and reloads the screens.
    const useSource = isDev && fs.existsSync(path.join(cwd, 'src', 'engine', 'engine.js'));
    const stopWatching = hotReload
        ? watchForChanges({
            cwd,
            useSource,
            onEngineChange: queueHotReload,
            onAppChange: isDev ? () => {} : reloadScreens,
        })
        : () => {};
    if (hotReload) {
        console.log(useSource
            ? '♻  Hot reload: engine edits in src/ apply without losing the game.'
            : '♻  Hot reload: run `npm run build` in another terminal to load a new build without losing the game.');
    }

    await new Promise((resolve) => {
        let shuttingDown = false;

        const shutdown = () => {
            if (shuttingDown) return;
            shuttingDown = true;

            stopWatching();
            network.reset();
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
