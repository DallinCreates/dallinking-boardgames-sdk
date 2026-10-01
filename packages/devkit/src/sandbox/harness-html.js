export function generateHarnessHtml(gameName, playersCount, previewPort) {
    let playerTabs = '';
    let playerIframes = '';

    for (let i = 1; i <= playersCount; i++) {
        playerTabs += `<button class="tab-btn" onclick="showPlayer('player_${i}')">Player ${i}</button>`;
        playerIframes += `
            <div id="wrapper_player_${i}" class="iframe-wrapper player-wrapper" style="display: ${i === 1 ? 'flex' : 'none'};">
                <iframe id="player_${i}" src="http://localhost:${previewPort}/player.html" onload="notifyReady(this)"></iframe>
            </div>`;
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>${gameName} - Simulator</title>
        <style>
            body { margin: 0; font-family: system-ui, sans-serif; display: flex; flex-direction: column; height: 100vh; background: #0f172a; color: white; overflow: hidden; }
            
            /* Ultra-Compact Global Toolbar */
            .global-toolbar { background: #020617; padding: 4px 12px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.3); height: 32px;}
            .toolbar-group { display: flex; align-items: center; gap: 8px; border-right: 1px solid #334155; padding-right: 12px;}
            .toolbar-group:last-child { border-right: none; padding-right: 0;}
            .toolbar-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.5px; }
            
            /* Dropdowns */
            .tool-select { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; outline: none; }
            .tool-select:hover { border-color: #475569; }
            .tool-select:focus { border-color: #38bdf8; }
            
            /* Icon Buttons */
            .icon-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; transition: all 0.2s;}
            .icon-btn.start { background: #22c55e; color: white; }
            .icon-btn.start:hover { background: #16a34a; }
            .icon-btn.reset { background: #ef4444; color: white; font-weight: bold; font-size: 14px;}
            .icon-btn.reset:hover { background: #dc2626; }
            
            /* Workspace & Panes */
            .workspace { display: flex; flex: 1; overflow: hidden; }
            .pane { display: flex; flex-direction: column; background: #1e293b; flex: 1; transition: all 0.3s ease;}
            .board-pane { border-right: 2px solid #0f172a; }
            
            /* Compact Pane Headers & Tabs */
            .pane-header { background: #0f172a; padding: 4px 10px; font-weight: 600; font-size: 12px; color: #94a3b8; display: flex; align-items: center; height: 24px;}
            .tabs { display: flex; background: #0f172a; overflow-x: auto; height: 32px;}
            .tab-btn { flex: 1; padding: 4px 8px; font-size: 12px; background: transparent; color: #64748b; border: none; cursor: pointer; font-weight: 600; border-bottom: 2px solid transparent; }
            .tab-btn:hover { color: white; background: #1e293b; }
            .tab-btn.active { color: #38bdf8; border-bottom-color: #38bdf8; background: #1e293b; }

            /* Layout Logic */
            body[data-layout="split"] .pane { display: flex; }
            body[data-layout="board"] .player-pane { display: none; }
            body[data-layout="player"] .board-pane { display: none; }
            
            /* Iframes */
            .iframe-container { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: #0f172a; overflow: auto;}
            .iframe-wrapper { display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; max-width: 100%; max-height: 100%; }
            iframe { border: none; background: white; transition: all 0.3s ease; box-sizing: border-box; }
            body[data-device="responsive"] .iframe-wrapper { width: 100%; height: 100%; }
            body[data-device="responsive"] iframe { width: 100%; height: 100%; border-radius: 0; }
            body[data-device="portrait"] .iframe-wrapper {
                width: min(375px, calc(100% - 24px));
                max-height: calc(100% - 24px);
                aspect-ratio: 375 / 812;
                height: auto;
            }
            body[data-device="portrait"] iframe {
                width: 100%;
                height: 100%;
                border-radius: 24px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                border: 8px solid #334155;
            }
            body[data-device="landscape"] .iframe-wrapper {
                width: min(812px, calc(100% - 24px));
                max-height: calc(100% - 24px);
                aspect-ratio: 812 / 375;
                height: auto;
            }
            body[data-device="landscape"] iframe {
                width: 100%;
                height: 100%;
                border-radius: 24px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                border: 8px solid #334155;
            }

            /* Results (game over) and warnings */
            .tab-tools { display: flex; gap: 4px; padding: 0 6px; align-items: center; background: #0f172a; }
            .mini-btn { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; border-radius: 4px; font-size: 11px; padding: 2px 8px; cursor: pointer; }
            .mini-btn:hover { border-color: #38bdf8; }
            #warning { display: none; background: #7f1d1d; color: #fecaca; font-size: 12px; padding: 6px 12px; cursor: pointer; }
            #results { display: none; position: fixed; inset: 40px 0 0 0; background: rgba(2, 6, 23, 0.82); z-index: 200; align-items: center; justify-content: center; }
            #results .card { background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 20px 24px; width: min(720px, 92vw); max-height: 85vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
            #results h2 { margin: 4px 0; font-size: 28px; text-align: center; }
            #results .game { text-align: center; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
            #results .summary { text-align: center; color: #cbd5e1; margin: 0 0 12px; }
            #results .row { display: grid; grid-template-columns: 48px 1fr auto; gap: 10px; padding: 6px 10px; margin: 4px 0; border-radius: 8px; background: #1e293b; font-size: 14px; }
            #results .row.dim { opacity: 0.5; }
            #results .sub { font-size: 12px; color: #94a3b8; }
            #results .phones { margin-top: 12px; border-top: 1px solid #334155; padding-top: 10px; font-size: 13px; color: #cbd5e1; }
            #results .actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
            #results .actions button { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; }
            #results-pill { display: none; position: fixed; right: 16px; bottom: 16px; z-index: 150; background: #111827; color: #facc15; border: 1px solid #facc15; border-radius: 20px; padding: 8px 14px; cursor: pointer; font-weight: 700; }
        </style>
    </head>
    <body data-layout="split" data-device="responsive">
        <div id="warning" onclick="this.style.display='none'" title="Click to dismiss"></div>
        <div id="results"><div class="card" id="results-card"></div></div>
        <button id="results-pill" onclick="reopenResults()">🏆 Results</button>
        <div class="global-toolbar">
            <div style="display: flex; gap: 12px;">
                <div class="toolbar-group">
                    <span class="toolbar-label">Layout</span>
                    <select class="tool-select" onchange="setLayout(this.value)">
                        <option value="split">Split</option>
                        <option value="board">Board</option>
                        <option value="player">Player</option>
                    </select>
                </div>

                <div class="toolbar-group">
                    <span class="toolbar-label">Device Size</span>
                    <select class="tool-select" onchange="setDevice(this.value)">
                        <option value="responsive">Fluid View</option>
                        <option value="portrait">📱 Portrait</option>
                        <option value="landscape">📟 Landscape</option>
                    </select>
                </div>
            </div>

            <div class="toolbar-group" style="border: none;">
                <button class="icon-btn start" onclick="startGame()" title="Start Game">▶</button>
                <button class="icon-btn reset" onclick="resetSandbox()" title="Reset Environment">↻</button>
            </div>
        </div>

        <div class="workspace">
            <div class="pane board-pane">
                <div class="pane-header">🖥️ Main Board</div>
                <div class="iframe-container">
                    <div class="iframe-wrapper" style="width: 100%; height: 100%;">
                        <iframe id="board" src="http://localhost:${previewPort}/board.html" onload="notifyReady(this)"></iframe>
                    </div>
                </div>
            </div>

            <div class="pane player-pane">
                <div style="display: flex;">
                    <div class="tabs" id="tabs" style="flex: 1;">
                        ${playerTabs}
                    </div>
                    <div class="tab-tools">
                        <button class="mini-btn" onclick="leavePlayer()" title="This player leaves the room">Leave</button>
                        <button class="mini-btn" onclick="rejoinPlayer()" title="This player joins again (same player ID)">Rejoin</button>
                    </div>
                </div>
                <div class="iframe-container">
                    ${playerIframes}
                </div>
            </div>
        </div>

        <script>
            function setLayout(mode) {
                document.body.setAttribute('data-layout', mode);
            }

            function setDevice(mode) {
                document.body.setAttribute('data-device', mode);
            }

            let currentPlayer = 'player_1';

            function showPlayer(id) {
                currentPlayer = id;
                document.querySelectorAll('.player-wrapper').forEach(f => f.style.display = 'none');
                document.getElementById('wrapper_' + id).style.display = 'flex';
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.innerText.includes(id.split('_')[1])) btn.classList.add('active');
                });
            }
            document.querySelector('.tab-btn').classList.add('active');

            const ws = new WebSocket('ws://' + location.host);
            ws.onopen = () => console.log('Sim harness connected.');

            function startGame() {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ senderId: 'harness', data: { type: 'room:start' } }));
                }
            }

            function resetSandbox() {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ senderId: 'harness', data: { type: 'DEV_RESET' } }));
                }
            }

            // Leave/Rejoin: the player keeps their ID, as party members do.
            function leavePlayer() {
                const iframe = document.getElementById(currentPlayer);
                if (!iframe || iframe.dataset.left) return;
                ws.send(JSON.stringify({ senderId: currentPlayer, data: { type: 'room:leave' } }));
                iframe.dataset.src = iframe.src;
                iframe.dataset.left = '1';
                iframe.src = 'about:blank';
            }

            function rejoinPlayer() {
                const iframe = document.getElementById(currentPlayer);
                if (!iframe || !iframe.dataset.left) return;
                delete iframe.dataset.left;
                iframe.src = iframe.dataset.src;
            }

            function showWarning(message) {
                const el = document.getElementById('warning');
                el.textContent = '⚠️ ' + message + '  (click to dismiss)';
                el.style.display = 'block';
            }

            // --- Results screen (what the platform shows over the game) ---
            let latestRoom = null;
            let resultsTab = 'game';
            let hiddenKey = null;
            let resultsTimer = null;

            const ordinal = (n) => { const t = n % 100; if (t >= 11 && t <= 13) return n + 'th'; return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); };
            const esc = (text) => String(text == null ? '' : text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const label = (entry) => entry.score !== null && entry.score !== undefined ? String(entry.score) : ({ WON: 'Won', LOST: 'Lost', TIE: 'Tie' }[entry.outcome] || '');
            const resultsKey = (room) => room.results ? room.results.gameId + ':' + room.results.endedAt : null;

            function personalHeadline(results, mine) {
                if (!mine) return "didn't finish";
                if (mine.won) return '🏆 You won!';
                if (mine.outcome === 'LOST') return 'You lost';
                if (mine.outcome === 'TIE') return "It's a tie";
                return 'You placed ' + ordinal(mine.rank);
            }

            function renderResults() {
                const room = latestRoom;
                const card = document.getElementById('results-card');
                const r = room.results;
                let html = '<div class="game">' + esc(r.gameName) + '</div><h2>🏆 ' + esc(r.headline) + '</h2>';
                html += r.summary ? '<p class="summary">' + esc(r.summary) + '</p>' : '<p class="summary"></p>';
                html += '<div class="actions" style="margin: 0 0 10px;">'
                    + '<button class="mini-btn" onclick="showGameTab()"' + (resultsTab === 'game' ? ' style="border-color:#38bdf8"' : '') + '>This game</button>'
                    + '<button class="mini-btn" onclick="showTonightTab()"' + (resultsTab === 'tonight' ? ' style="border-color:#38bdf8"' : '') + '>Tonight</button></div>';

                if (resultsTab === 'game') {
                    if (r.teams.length) {
                        r.teams.forEach((team) => {
                            const members = r.standings.filter((s) => s.team === team.name)
                                .map((s) => esc(s.name) + (s.score !== null ? ' ' + s.score : '')).join(' · ');
                            html += '<div class="row"><span>' + ordinal(team.rank) + '</span><span><b style="color:' + esc(team.color || '#e2e8f0') + '">■</b> '
                                + esc(team.name) + (team.won ? ' 🏆' : '') + '<div class="sub">' + members + '</div></span><b>' + esc(label(team)) + '</b></div>';
                        });
                    } else {
                        r.standings.forEach((s) => {
                            html += '<div class="row"><span>' + ordinal(s.rank) + '</span><span>' + esc(s.name) + (s.won ? ' 🏆' : '') + '</span><b>' + esc(label(s)) + '</b></div>';
                        });
                        r.didNotFinish.forEach((p) => { html += '<div class="row dim"><span>—</span><span>' + esc(p.name) + "</span><span>didn't finish</span></div>"; });
                    }
                    html += '<div class="phones"><b>On each phone:</b> ' + room.players.map((p) => esc(p.name) + ': ' + esc(personalHeadline(r, r.byPlayer[p.id]))).join(' · ') + '</div>';
                } else {
                    html += '<div class="sub" style="margin-bottom:6px">' + room.party.gamesPlayed + ' games tonight · ranked by wins, then points</div>';
                    room.party.standings.forEach((row) => {
                        html += '<div class="row' + (row.seated ? '' : ' dim') + '"><span>' + ordinal(row.rank) + '</span><span>' + esc(row.name) + (row.seated ? '' : ' (left)')
                            + '</span><span>' + row.wins + ' W · ' + row.points + ' pts · ' + row.gamesPlayed + ' played</span></div>';
                    });
                }

                html += '<div class="actions">'
                    + '<button style="background:#22c55e;color:white" onclick="playAgain()">▶ Play again</button>'
                    + '<button style="background:#334155;color:white" onclick="pickAnotherGame()">Pick another game</button>'
                    + '<button style="background:transparent;color:#94a3b8" onclick="hideResults()">Hide ⌄</button></div>';
                card.innerHTML = html;
            }

            function updateResults(room) {
                latestRoom = room;
                clearTimeout(resultsTimer);
                const overlay = document.getElementById('results');
                const pill = document.getElementById('results-pill');
                if (room.phase !== 'results' || !room.results) {
                    overlay.style.display = 'none';
                    pill.style.display = 'none';
                    return;
                }
                const key = resultsKey(room);
                const delay = Math.max(0, room.results.showAt - room.results.endedAt);
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

            function showGameTab() { resultsTab = 'game'; renderResults(); }
            function showTonightTab() { resultsTab = 'tonight'; renderResults(); }
            function playAgain() { sendRoom('room:play_again'); }
            function pickAnotherGame() { sendRoom('room:end_game'); }
            function hideResults() {
                hiddenKey = resultsKey(latestRoom);
                document.getElementById('results').style.display = 'none';
                document.getElementById('results-pill').style.display = 'block';
            }
            function reopenResults() { hiddenKey = null; updateResults(latestRoom); }
            function sendRoom(type) { ws.send(JSON.stringify({ senderId: 'harness', data: { type } })); }

            function notifyReady(iframe) {
                // A player who left shows about:blank; that load isn't a join.
                if (iframe.dataset && iframe.dataset.left) return;
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.addEventListener('open', () => notifyReady(iframe));
                    return;
                }

                if (iframe.id === 'board') {
                    ws.send(JSON.stringify({ senderId: 'board', data: { type: 'room:create', payload: { gameId: '${gameName}' } } }));
                } else {
                    const num = iframe.id.split('_')[1];
                    ws.send(JSON.stringify({ senderId: iframe.id, data: { type: 'room:join', payload: { name: 'Player ' + num, code: 'DEV4' } } }));
                }
            }

            ws.onmessage = (event) => {
                const { targetId, data } = JSON.parse(event.data);

                if (targetId === 'harness' && data.type === 'DEV_RESULTS') {
                    updateResults(data.room);
                    return;
                }

                if (targetId === 'harness' && data.type === 'DEV_WARNING') {
                    showWarning(data.message);
                    return;
                }

                if (targetId === 'harness' && data.type === 'DEV_FORCE_RELOAD') {
                    document.querySelectorAll('iframe').forEach(ifr => {
                        ifr.src = ifr.src;
                    });
                    return;
                }

                if (data.type === 'room:created' || data.type === 'room:joined') {
                    ws.send(JSON.stringify({ senderId: targetId, data: { type: 'room:request_full_state' } }));
                }

                const targetIframe = document.getElementById(targetId);
                if (targetIframe) targetIframe.contentWindow.postMessage(data, '*');
            };

            window.addEventListener('message', (e) => {
                let senderId = null;
                for (let i = 0; i < window.frames.length; i++) {
                    if (e.source === window.frames[i]) {
                        senderId = document.querySelectorAll('iframe')[i].id;
                        break;
                    }
                }

                if (!senderId || !e.data || typeof e.data !== 'object') return;
                if (e.data.source === '@devtools-page' || e.data.type?.startsWith('react-') || e.data.type?.startsWith('vite:')) return;

                const actualPayload = (e.data.source === 'socket' && e.data.message) ? e.data.message : e.data;

                if (actualPayload.type) {
                    const payloadString = JSON.stringify({ senderId, data: actualPayload });
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(payloadString);
                    } else if (ws.readyState === WebSocket.CONNECTING) {
                        ws.addEventListener('open', () => ws.send(payloadString), { once: true });
                    }
                }
            });
        </script>
    </body>
    </html>
    `;
}