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
        </style>
    </head>
    <body data-layout="split" data-device="responsive">
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
                <div class="tabs" id="tabs">
                    ${playerTabs}
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

            function showPlayer(id) {
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

            function notifyReady(iframe) {
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