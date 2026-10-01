/* eslint-env browser */

// The sandbox page's script. It runs in the browser, not Node: harness-html.js
// inlines it with harnessClient.toString(), so it must not use anything from
// this module's scope.
//
// The page plays the platform: it relays messages between the screens
// (iframes) and the sandbox runtime, sends each screen its sound settings,
// shows vibrations, and hosts the network controls and the state inspector.
export function harnessClient(config) {
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));
    const esc = (text) => String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const store = {
        read(key, fallback) {
            try {
                const raw = localStorage.getItem('boardgame-sandbox.' + key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        },
        write(key, value) {
            try {
                localStorage.setItem('boardgame-sandbox.' + key, JSON.stringify(value));
            } catch {
                // Storage unavailable: settings last for this page only.
            }
        },
    };

    const frames = () => $$('iframe');
    const frameById = (id) => document.getElementById(id);
    const playerName = (id) => (config.players.find((p) => p.id === id) || {}).label || id;

    let currentPlayer = config.players[0] ? config.players[0].id : null;
    let latestRoom = null;
    let network = { playerPreset: 'off', overrides: {}, offline: [], held: {} };
    // Actions a disconnected phone tried to send (the runtime holds them).
    const queuedWhileOffline = {};

    // ---------------------------------------------------------------
    // Connection to the sandbox runtime
    // ---------------------------------------------------------------

    const ws = new WebSocket('ws://' + location.host);

    function sendRaw(senderId, data) {
        const text = JSON.stringify({ senderId, data });
        if (ws.readyState === WebSocket.OPEN) ws.send(text);
        else if (ws.readyState === WebSocket.CONNECTING) ws.addEventListener('open', () => ws.send(text), { once: true });
    }

    const sendDev = (type, payload) => sendRaw('harness', { type, payload });

    ws.addEventListener('open', () => sendDev('DEV_HELLO'));

    // ---------------------------------------------------------------
    // Toasts and warnings
    // ---------------------------------------------------------------

    function toast(message, tone) {
        const el = document.createElement('div');
        el.className = 'toast' + (tone ? ' ' + tone : '');
        el.textContent = message;
        $('#toasts').appendChild(el);
        setTimeout(() => el.remove(), tone === 'error' ? 8000 : 3500);
    }

    function showWarning(message) {
        const el = $('#warning');
        el.textContent = '⚠️ ' + message + '  (click to dismiss)';
        el.style.display = 'block';
    }

    $('#warning').addEventListener('click', (event) => {
        event.currentTarget.style.display = 'none';
    });

    // ---------------------------------------------------------------
    // Sound settings: the sandbox plays the platform's game menu
    // ---------------------------------------------------------------

    const sound = Object.assign(
        { mode: 'focus', masterVolume: 100, musicVolume: 80, sfxVolume: 100 },
        store.read('sound', {})
    );

    function settingsFor(id) {
        const audible = sound.mode === 'all'
            || (sound.mode === 'board' && id === 'board')
            || (sound.mode === 'focus' && (id === 'board' || id === currentPlayer));
        return {
            muted: !audible,
            masterVolume: sound.masterVolume / 100,
            musicVolume: sound.musicVolume / 100,
            sfxVolume: sound.sfxVolume / 100,
            haptics: true,
            // The sandbox shows vibrations on the phones' frames.
            canVibrate: id !== 'board',
        };
    }

    function postToFrame(iframe, message) {
        if (iframe && iframe.contentWindow && !iframe.dataset.left) iframe.contentWindow.postMessage(message, '*');
    }

    function postSettings(iframe) {
        postToFrame(iframe, { source: 'socket', message: { type: 'platform:settings', payload: settingsFor(iframe.id) } });
    }

    function postSettingsToAll() {
        store.write('sound', sound);
        frames().forEach(postSettings);
    }

    $('[data-control="sound-mode"]').value = sound.mode;
    $$('[data-volume]').forEach((input) => {
        const key = input.dataset.volume;
        const output = input.nextElementSibling;
        input.value = sound[key];
        output.textContent = sound[key];
        input.addEventListener('input', () => {
            sound[key] = Number(input.value);
            output.textContent = input.value;
            postSettingsToAll();
        });
    });

    // ---------------------------------------------------------------
    // Vibration
    // ---------------------------------------------------------------

    function showHaptic(id, pattern) {
        const steps = Array.isArray(pattern) ? pattern.map(Number).filter((n) => n >= 0) : [];
        if (!steps.length) return;
        const wrapper = document.getElementById('wrapper_' + id);
        const duration = Math.min(3000, steps.reduce((sum, ms) => sum + ms, 0));
        if (wrapper) {
            wrapper.classList.add('buzz');
            clearTimeout(wrapper.buzzTimer);
            wrapper.buzzTimer = setTimeout(() => wrapper.classList.remove('buzz'), Math.max(150, duration));
        }
        const tab = document.querySelector('.tab-btn[data-player="' + id + '"]');
        if (tab) {
            tab.classList.remove('buzz');
            void tab.offsetWidth;
            tab.classList.add('buzz');
        }
        toast('📳 ' + playerName(id) + ' vibrates [' + steps.join(', ') + ']', 'haptic');
    }

    // ---------------------------------------------------------------
    // Screens: loading, joining, relaying
    // ---------------------------------------------------------------

    function notifyReady(iframe) {
        // A player who left shows about:blank; that load isn't a join.
        if (iframe.dataset.left) return;
        if (iframe.id === 'board') {
            sendRaw('board', { type: 'room:create', payload: { gameId: config.gameName } });
        } else {
            const num = iframe.id.split('_')[1];
            sendRaw(iframe.id, { type: 'room:join', payload: { name: 'Player ' + num, code: 'DEV4' } });
        }
    }

    // Attach before loading so no load event is missed.
    frames().forEach((iframe) => {
        iframe.addEventListener('load', () => notifyReady(iframe));
        iframe.src = iframe.dataset.src;
    });

    function reloadFrames() {
        frames().forEach((iframe) => {
            if (iframe.dataset.left) return;
            iframe.src = iframe.dataset.src;
        });
    }

    window.addEventListener('message', (event) => {
        const iframe = frames().find((frame) => frame.contentWindow === event.source);
        if (!iframe || !event.data || typeof event.data !== 'object') return;
        if (event.data.source === '@devtools-page' || (typeof event.data.type === 'string' && /^(react-|vite:)/.test(event.data.type))) return;

        const message = (event.data.source === 'socket' && event.data.message) ? event.data.message : event.data;
        if (!message || typeof message.type !== 'string') return;
        const senderId = iframe.id;

        // The game's SDK is listening: send its settings, as the platform does.
        if (message.type === 'system:ready') {
            postSettings(iframe);
            return;
        }

        if (message.type.startsWith('platform:')) {
            if (message.type === 'platform:haptic') showHaptic(senderId, message.payload && message.payload.pattern);
            return;
        }

        if (network.offline.includes(senderId)) {
            queuedWhileOffline[senderId] = (queuedWhileOffline[senderId] || 0) + 1;
            renderNetwork();
        }
        sendRaw(senderId, message);
    });

    // ---------------------------------------------------------------
    // Layout, players and toolbar
    // ---------------------------------------------------------------

    function showPlayer(id) {
        currentPlayer = id;
        $$('.player-wrapper').forEach((wrapper) => {
            wrapper.style.display = wrapper.id === 'wrapper_' + id ? 'flex' : 'none';
        });
        $$('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.player === id));
        renderNetwork();
        // "Board + shown player" follows the tab.
        if (sound.mode === 'focus') postSettingsToAll();
    }

    function leavePlayer() {
        const iframe = frameById(currentPlayer);
        if (!iframe || iframe.dataset.left || network.offline.includes(currentPlayer)) return;
        sendRaw(currentPlayer, { type: 'room:leave' });
        iframe.dataset.left = '1';
        iframe.src = 'about:blank';
    }

    function rejoinPlayer() {
        const iframe = frameById(currentPlayer);
        if (!iframe || !iframe.dataset.left) return;
        delete iframe.dataset.left;
        iframe.src = iframe.dataset.src;
    }

    function toggleConnection() {
        if (!currentPlayer || frameById(currentPlayer).dataset.left) return;
        if (network.offline.includes(currentPlayer)) {
            sendDev('DEV_RECONNECT', { clientId: currentPlayer });
        } else {
            sendDev('DEV_DISCONNECT', { clientId: currentPlayer });
        }
    }

    function effectivePreset(id) {
        return network.overrides[id] || network.playerPreset;
    }

    function renderNetwork() {
        $('[data-control="lag-all"]').value = network.playerPreset;
        $('[data-control="lag-player"]').value = network.overrides[currentPlayer] || '';

        config.players.forEach(({ id }) => {
            const offline = network.offline.includes(id);
            if (!offline) delete queuedWhileOffline[id];
            const wrapper = document.getElementById('wrapper_' + id);
            wrapper.classList.toggle('offline', offline);
            const queued = queuedWhileOffline[id] || 0;
            wrapper.querySelector('.veil-detail').textContent = queued
                ? queued + (queued === 1 ? ' action' : ' actions') + ' queued, sent on reconnect'
                : 'Messages to this phone are lost until it reconnects';

            const status = document.querySelector('.tab-btn[data-player="' + id + '"] .tab-status');
            const lagged = effectivePreset(id) !== 'off';
            status.textContent = (offline ? ' 📴' : '') + (lagged ? ' 🐢' : '');
        });

        const iframe = frameById(currentPlayer);
        const left = Boolean(iframe && iframe.dataset.left);
        const offline = network.offline.includes(currentPlayer);
        const connectionBtn = $('[data-action="toggle-connection"]');
        connectionBtn.textContent = offline ? 'Reconnect' : 'Disconnect';
        connectionBtn.classList.toggle('alert', offline);
        connectionBtn.disabled = left;
        $('[data-action="leave"]').disabled = left || offline;
        $('[data-action="rejoin"]').disabled = !left;
    }

    function toggleMixer(force) {
        const mixer = $('#mixer');
        const open = typeof force === 'boolean' ? force : !mixer.classList.contains('open');
        mixer.classList.toggle('open', open);
        $('[data-action="toggle-mixer"]').setAttribute('aria-expanded', String(open));
    }

    document.addEventListener('click', (event) => {
        if (!event.target.closest('#mixer') && !event.target.closest('[data-action="toggle-mixer"]')) toggleMixer(false);
    });

    function toggleInspector(force) {
        const open = typeof force === 'boolean' ? force : document.body.dataset.inspector !== 'open';
        document.body.dataset.inspector = open ? 'open' : 'closed';
        $('[data-action="toggle-inspector"]').setAttribute('aria-pressed', String(open));
        store.write('inspector', open);
        if (open) renderInspector();
    }

    // ---------------------------------------------------------------
    // Results screen (what the platform shows over the game)
    // ---------------------------------------------------------------

    let resultsTab = 'game';
    let hiddenKey = null;
    let resultsTimer = null;

    const ordinal = (n) => {
        const t = n % 100;
        if (t >= 11 && t <= 13) return n + 'th';
        return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    };
    const resultLabel = (entry) => (entry.score !== null && entry.score !== undefined ? String(entry.score) : ({ WON: 'Won', LOST: 'Lost', TIE: 'Tie' }[entry.outcome] || ''));
    const resultsKey = (room) => (room && room.results ? room.results.gameId + ':' + room.results.endedAt : null);

    function personalHeadline(mine) {
        if (!mine) return "didn't finish";
        if (mine.won) return '🏆 You won!';
        if (mine.outcome === 'LOST') return 'You lost';
        if (mine.outcome === 'TIE') return "It's a tie";
        return 'You placed ' + ordinal(mine.rank);
    }

    function renderResults() {
        const room = latestRoom;
        const r = room.results;
        let html = '<div class="game">' + esc(r.gameName) + '</div><h2>🏆 ' + esc(r.headline) + '</h2>';
        html += '<p class="summary">' + esc(r.summary || '') + '</p>';
        html += '<div class="actions" style="margin: 0 0 10px;">'
            + '<button class="mini-btn" data-action="results-game"' + (resultsTab === 'game' ? ' style="border-color:#38bdf8"' : '') + '>This game</button>'
            + '<button class="mini-btn" data-action="results-tonight"' + (resultsTab === 'tonight' ? ' style="border-color:#38bdf8"' : '') + '>Tonight</button></div>';

        if (resultsTab === 'game') {
            if (r.teams.length) {
                r.teams.forEach((team) => {
                    const members = r.standings.filter((s) => s.team === team.name)
                        .map((s) => esc(s.name) + (s.score !== null ? ' ' + s.score : '')).join(' · ');
                    html += '<div class="row"><span>' + ordinal(team.rank) + '</span><span><b style="color:' + esc(team.color || '#e2e8f0') + '">■</b> '
                        + esc(team.name) + (team.won ? ' 🏆' : '') + '<div class="sub">' + members + '</div></span><b>' + esc(resultLabel(team)) + '</b></div>';
                });
            } else {
                r.standings.forEach((s) => {
                    html += '<div class="row"><span>' + ordinal(s.rank) + '</span><span>' + esc(s.name) + (s.won ? ' 🏆' : '') + '</span><b>' + esc(resultLabel(s)) + '</b></div>';
                });
                r.didNotFinish.forEach((p) => {
                    html += '<div class="row dim"><span>—</span><span>' + esc(p.name) + "</span><span>didn't finish</span></div>";
                });
            }
            html += '<div class="phones"><b>On each phone:</b> ' + room.players.map((p) => esc(p.name) + ': ' + esc(personalHeadline(r.byPlayer[p.id]))).join(' · ') + '</div>';
        } else {
            html += '<div class="sub" style="margin-bottom:6px">' + room.party.gamesPlayed + ' games tonight · ranked by wins, then points</div>';
            room.party.standings.forEach((row) => {
                html += '<div class="row' + (row.seated ? '' : ' dim') + '"><span>' + ordinal(row.rank) + '</span><span>' + esc(row.name) + (row.seated ? '' : ' (left)')
                    + '</span><span>' + row.wins + ' W · ' + row.points + ' pts · ' + row.gamesPlayed + ' played</span></div>';
            });
        }

        html += '<div class="actions">'
            + '<button style="background:#22c55e;color:white" data-action="play-again">▶ Play again</button>'
            + '<button style="background:#334155;color:white" data-action="pick-another">Pick another game</button>'
            + '<button style="background:transparent;color:#94a3b8" data-action="hide-results">Hide ⌄</button></div>';
        $('#results-card').innerHTML = html;
    }

    function updateResults(room) {
        latestRoom = room;
        clearTimeout(resultsTimer);
        const overlay = $('#results');
        const pill = $('#results-pill');
        if (room.phase !== 'results' || !room.results) {
            overlay.style.display = 'none';
            pill.style.display = 'none';
            return;
        }
        const key = resultsKey(room);
        const delay = Math.max(0, Math.min(room.results.showAt - Date.now(), room.results.showAt - room.results.endedAt));
        resultsTimer = setTimeout(() => {
            if (hiddenKey === key) {
                pill.style.display = 'block';
                return;
            }
            renderResults();
            overlay.style.display = 'flex';
            pill.style.display = 'none';
        }, delay);
    }

    function hideResults() {
        hiddenKey = resultsKey(latestRoom);
        $('#results').style.display = 'none';
        $('#results-pill').style.display = 'block';
    }

    // ---------------------------------------------------------------
    // State inspector and time travel
    // ---------------------------------------------------------------

    const insp = {
        entries: [],
        selectedId: null,
        live: true,
        view: 'engine',
        parsed: new Map(), // entry id -> parsed state
        views: new Map(), // 'id|view' -> { json } or { error }
        open: new Set(store.read('openPaths', [])),
        closed: new Set(),
        shown: undefined, // the value in the tree, for Copy
    };

    const timeOf = (at) => {
        const d = new Date(at);
        const pad = (n, w) => String(n).padStart(w || 2, '0');
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    };

    function parsedState(entry) {
        if (!insp.parsed.has(entry.id)) {
            let value;
            try {
                value = JSON.parse(entry.stateJson);
            } catch {
                value = null;
            }
            insp.parsed.set(entry.id, value);
        }
        return insp.parsed.get(entry.id);
    }

    const indexOf = (id) => insp.entries.findIndex((entry) => entry.id === id);
    const selectedEntry = () => insp.entries[indexOf(insp.selectedId)] || null;

    function select(id, { live = false } = {}) {
        insp.selectedId = id;
        insp.live = live;
        renderInspector();
        const row = document.querySelector('.log-row[data-id="' + id + '"]');
        if (row) row.scrollIntoView({ block: 'nearest' });
    }

    function step(delta) {
        const index = indexOf(insp.selectedId);
        const next = insp.entries[Math.max(0, Math.min(insp.entries.length - 1, index + delta))];
        if (next) select(next.id, { live: next === insp.entries[insp.entries.length - 1] });
    }

    function pathLabel(path) {
        return path.map((key, i) => (/^\d+$/.test(key) ? '[' + key + ']' : (i ? '.' : '') + key)).join('') || '(root)';
    }

    function shortValue(value) {
        if (value === undefined) return '∅';
        const text = JSON.stringify(value);
        return text.length > 40 ? text.slice(0, 37) + '…' : text;
    }

    // Changed leaves between two states, plus every ancestor of a change (for
    // highlighting), keyed by JSON path.
    function diff(before, after) {
        const marked = new Set();
        const leaves = [];
        const walk = (a, b, path) => {
            if (a === b) return false;
            const aObj = a !== null && typeof a === 'object';
            const bObj = b !== null && typeof b === 'object';
            if (aObj && bObj && Array.isArray(a) === Array.isArray(b)) {
                let changed = false;
                new Set(Object.keys(a).concat(Object.keys(b))).forEach((key) => {
                    if (walk(a[key], b[key], path.concat(key))) changed = true;
                });
                if (changed) marked.add(JSON.stringify(path));
                return changed;
            }
            if (JSON.stringify(a) === JSON.stringify(b)) return false;
            marked.add(JSON.stringify(path));
            leaves.push({ path, before: a, after: b });
            return true;
        };
        walk(before, after, []);
        return { marked, leaves };
    }

    function isOpen(pathKey, depth) {
        if (insp.open.has(pathKey)) return true;
        if (insp.closed.has(pathKey)) return false;
        return depth < 2;
    }

    function renderNode(value, path, key, marked) {
        const pathKey = JSON.stringify(path);
        const label = key === null ? '' : '<span class="k">' + esc(key) + '</span>: ';
        const changed = marked.has(pathKey) ? ' changed' : '';

        if (value !== null && typeof value === 'object') {
            const isArray = Array.isArray(value);
            const keys = Object.keys(value);
            const summary = isArray ? 'Array(' + value.length + ')' : '{' + keys.length + (keys.length === 1 ? ' key' : ' keys') + '}';
            if (!keys.length) return '<div class="leaf' + changed + '">' + label + '<span class="p">' + (isArray ? '[]' : '{}') + '</span></div>';
            const open = isOpen(pathKey, path.length);
            // Children render when opened, so large states stay fast.
            const children = open ? keys.map((k) => renderNode(value[k], path.concat(k), k, marked)).join('') : '';
            return '<details data-path="' + esc(pathKey) + '"' + (open ? ' open' : '') + ' class="' + changed.trim() + '"><summary>' + label
                + '<span class="p">' + summary + '</span></summary><div class="children">' + children + '</div></details>';
        }

        let cls = 'z';
        let text = 'null';
        if (typeof value === 'string') {
            cls = 's';
            text = JSON.stringify(value.length > 300 ? value.slice(0, 300) + '…' : value);
        } else if (typeof value === 'number') {
            cls = 'n';
            text = String(value);
        } else if (typeof value === 'boolean') {
            cls = 'b';
            text = String(value);
        }
        return '<div class="leaf' + changed + '">' + label + '<span class="' + cls + '">' + esc(text) + '</span></div>';
    }

    function valueAt(root, path) {
        return path.reduce((node, key) => (node == null ? undefined : node[key]), root);
    }

    let treeRoot = null;
    let treeMarked = new Set();

    function renderTree(value, marked) {
        treeRoot = value;
        treeMarked = marked;
        insp.shown = value;
        $('#insp-tree').innerHTML = renderNode(value, [], null, marked);
    }

    // Opening a collapsed node renders its children (toggle doesn't bubble,
    // so listen in the capture phase).
    $('#insp-tree').addEventListener('toggle', (event) => {
        const details = event.target;
        if (!details.dataset || !details.dataset.path) return;
        const pathKey = details.dataset.path;
        if (details.open) {
            insp.open.add(pathKey);
            insp.closed.delete(pathKey);
            const container = details.querySelector(':scope > .children');
            if (container && !container.childElementCount) {
                const path = JSON.parse(pathKey);
                const value = valueAt(treeRoot, path);
                container.innerHTML = Object.keys(value || {}).map((k) => renderNode(value[k], path.concat(k), k, treeMarked)).join('');
            }
        } else {
            insp.open.delete(pathKey);
            insp.closed.add(pathKey);
        }
        store.write('openPaths', Array.from(insp.open).slice(-200));
    }, true);

    function renderViewOptions() {
        const selectEl = $('[data-control="insp-view"]');
        const players = (latestRoom && latestRoom.players) || [];
        const options = [['engine', 'this.state (engine)'], ['board', 'Board sees: getBoardState()']]
            .concat(players.map((p) => ['player:' + p.id, p.name + ' sees: getPlayerState()']));
        if (!options.some(([value]) => value === insp.view)) insp.view = 'engine';
        selectEl.innerHTML = options.map(([value, label]) => '<option value="' + esc(value) + '">' + esc(label) + '</option>').join('');
        selectEl.value = insp.view;
    }

    function renderLog() {
        const log = $('#insp-log');
        if (!insp.entries.length) {
            log.innerHTML = '<div class="insp-empty">Nothing yet. Every action, join, start and timer update lands here.</div>';
            return;
        }
        log.innerHTML = insp.entries.map((entry) => {
            const payload = entry.payloadJson && entry.payloadJson !== '{}' ? ' <span class="pl">' + esc(entry.payloadJson.length > 60 ? entry.payloadJson.slice(0, 57) + '…' : entry.payloadJson) + '</span>' : '';
            return '<div class="log-row kind-' + esc(entry.kind) + (entry.id === insp.selectedId ? ' selected' : '') + (entry.error ? ' error' : '') + '" data-id="' + entry.id + '">'
                + '<span class="log-id">#' + entry.id + '</span><span class="log-time">' + timeOf(entry.at) + '</span>'
                + '<span class="log-actor">' + esc(entry.actor || '') + '</span>'
                + '<span class="log-label">' + (entry.error ? '⚠ ' : '') + esc(entry.label) + payload + '</span></div>';
        }).join('');
    }

    function renderSelection() {
        const entry = selectedEntry();
        const meta = $('#insp-meta');
        const changes = $('#insp-changes');
        const latest = insp.entries[insp.entries.length - 1];

        $('[data-action="insp-live"]').classList.toggle('alert', !insp.live);
        $('[data-action="insp-live"]').textContent = insp.live ? '● Live' : '○ Live';
        $('[data-action="insp-rewind"]').disabled = !entry || entry === latest;

        if (!entry) {
            meta.innerHTML = '';
            changes.innerHTML = '';
            renderTree(null, new Set());
            return;
        }

        meta.innerHTML = '<b>#' + entry.id + '</b> · ' + esc(entry.label) + (entry.actor ? ' · ' + esc(entry.actor) : '') + ' · ' + timeOf(entry.at)
            + ' · phase <code>' + esc(entry.room.phase) + '</code>' + (entry.isGameOver ? ' · game over' : '')
            + (entry.error ? '<div class="err">Threw: ' + esc(entry.error) + '</div>' : '')
            + (entry.stateOk ? '' : '<div class="err">this.state isn\'t plain JSON here, so it can\'t be restored.</div>');

        if (insp.view === 'engine') {
            const index = indexOf(entry.id);
            const previous = index > 0 ? insp.entries[index - 1] : null;
            const state = parsedState(entry);
            const result = previous ? diff(parsedState(previous), state) : { marked: new Set(), leaves: [] };
            changes.innerHTML = !previous
                ? ''
                : result.leaves.length === 0
                    ? '<div>No state change.</div>'
                    : result.leaves.slice(0, 20).map((c) => '<div><code>' + esc(pathLabel(c.path)) + '</code>: ' + esc(shortValue(c.before)) + ' → ' + esc(shortValue(c.after)) + '</div>').join('')
                        + (result.leaves.length > 20 ? '<div>…and ' + (result.leaves.length - 20) + ' more</div>' : '');
            renderTree(state, result.marked);
            return;
        }

        changes.innerHTML = '';
        const cached = insp.views.get(entry.id + '|' + insp.view);
        if (!cached) {
            $('#insp-tree').innerHTML = '<span class="p">Asking the engine…</span>';
            sendDev('DEV_VIEW', { id: entry.id, view: insp.view });
            return;
        }
        if (cached.error) {
            $('#insp-tree').innerHTML = '<span class="err" style="color:#fca5a5">' + esc(insp.view.startsWith('board') ? 'getBoardState' : 'getPlayerState') + ' threw: ' + esc(cached.error) + '</span>';
            return;
        }
        renderTree(JSON.parse(cached.json), new Set());
    }

    function renderInspector() {
        if (document.body.dataset.inspector !== 'open') return;
        renderLog();
        renderSelection();
    }

    function setEntries(entries) {
        insp.entries = entries;
        insp.parsed.clear();
        insp.views.clear();
        const latest = entries[entries.length - 1];
        if (insp.live || indexOf(insp.selectedId) === -1) {
            insp.selectedId = latest ? latest.id : null;
            insp.live = true;
        }
        renderInspector();
    }

    function addEntry(entry) {
        insp.entries.push(entry);
        if (insp.entries.length > 500) {
            const dropped = insp.entries.shift();
            insp.parsed.delete(dropped.id);
        }
        if (insp.live) insp.selectedId = entry.id;
        renderInspector();
        if (insp.live) {
            const log = $('#insp-log');
            log.scrollTop = log.scrollHeight;
        }
    }

    $('#insp-log').addEventListener('click', (event) => {
        const row = event.target.closest('.log-row');
        if (!row) return;
        const id = Number(row.dataset.id);
        select(id, { live: id === insp.entries[insp.entries.length - 1].id });
    });

    $('#insp-log').addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            step(event.key === 'ArrowUp' ? -1 : 1);
        }
    });

    function copyShown() {
        const text = JSON.stringify(insp.shown, null, 2);
        navigator.clipboard.writeText(text).then(
            () => toast('Copied the state as JSON.'),
            () => toast("Couldn't copy to the clipboard.", 'error')
        );
    }

    // ---------------------------------------------------------------
    // Controls
    // ---------------------------------------------------------------

    const actions = {
        start: () => sendDev('room:start'),
        reset: () => sendDev('DEV_RESET'),
        leave: leavePlayer,
        rejoin: rejoinPlayer,
        'toggle-connection': toggleConnection,
        'toggle-mixer': () => toggleMixer(),
        'toggle-inspector': () => toggleInspector(),
        'reopen-results': () => {
            hiddenKey = null;
            updateResults(latestRoom);
        },
        'results-game': () => {
            resultsTab = 'game';
            renderResults();
        },
        'results-tonight': () => {
            resultsTab = 'tonight';
            renderResults();
        },
        'play-again': () => sendDev('room:play_again'),
        'pick-another': () => sendDev('room:end_game'),
        'hide-results': hideResults,
        'insp-prev': () => step(-1),
        'insp-next': () => step(1),
        'insp-live': () => {
            const latest = insp.entries[insp.entries.length - 1];
            if (latest) select(latest.id, { live: true });
        },
        'insp-rewind': () => {
            const entry = selectedEntry();
            if (entry) sendDev('DEV_TIME_TRAVEL', { id: entry.id });
        },
        'insp-copy': copyShown,
    };

    document.addEventListener('click', (event) => {
        const tab = event.target.closest('.tab-btn[data-player]');
        if (tab) {
            showPlayer(tab.dataset.player);
            return;
        }
        const button = event.target.closest('[data-action]');
        if (button && !button.disabled && actions[button.dataset.action]) actions[button.dataset.action]();
    });

    const controls = {
        layout: (value) => {
            document.body.dataset.layout = value;
        },
        device: (value) => {
            document.body.dataset.device = value;
        },
        'lag-all': (value) => sendDev('DEV_SET_LAG', { clientId: null, preset: value }),
        'lag-player': (value) => sendDev('DEV_SET_LAG', { clientId: currentPlayer, preset: value || null }),
        'sound-mode': (value) => {
            sound.mode = value;
            postSettingsToAll();
        },
        'insp-view': (value) => {
            insp.view = value;
            renderSelection();
        },
    };

    document.addEventListener('change', (event) => {
        const control = event.target.closest('[data-control]');
        if (control && controls[control.dataset.control]) controls[control.dataset.control](control.value);
    });

    // ---------------------------------------------------------------
    // Messages from the sandbox runtime
    // ---------------------------------------------------------------

    const harnessHandlers = {
        DEV_RESULTS: (data) => updateResults(data.room),
        DEV_ROOM: (data) => {
            latestRoom = data.room;
            renderViewOptions();
        },
        DEV_WARNING: (data) => showWarning(data.message),
        DEV_TOAST: (data) => toast(data.message, data.tone === 'error' ? 'error' : ''),
        DEV_FORCE_RELOAD: reloadFrames,
        DEV_NETWORK: (data) => {
            network = data.network;
            renderNetwork();
        },
        DEV_HISTORY: (data) => {
            setEntries(data.entries || []);
            if (data.notice) toast('⏪ ' + data.notice);
        },
        DEV_HISTORY_ENTRY: (data) => addEntry(data.entry),
        DEV_VIEW_RESULT: (data) => {
            insp.views.set(data.id + '|' + data.view, data.error ? { error: data.error } : { json: data.json });
            const entry = selectedEntry();
            if (entry && entry.id === data.id && insp.view === data.view) renderSelection();
        },
    };

    ws.addEventListener('message', (event) => {
        const { targetId, data } = JSON.parse(event.data);

        if (targetId === 'harness') {
            if (harnessHandlers[data.type]) harnessHandlers[data.type](data);
            return;
        }

        if (data.type === 'room:created' || data.type === 'room:joined') {
            sendRaw(targetId, { type: 'room:request_full_state' });
        }

        postToFrame(frameById(targetId), data);
    });

    renderNetwork();
    renderViewOptions();
    if (store.read('inspector', false)) toggleInspector(true);
}
