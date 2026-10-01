import { harnessClient } from './harness-client.js';
import { LAG_PRESETS } from './network.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// JSON inside <script>: keep "</script>" in a game name from ending the tag.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const STYLES = `
    :root { --bg: #0f172a; --bg-deep: #020617; --panel: #1e293b; --line: #334155; --muted: #64748b; --text: #cbd5e1; --accent: #38bdf8; --warn: #f59e0b; --bad: #ef4444; --good: #22c55e; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: white; overflow: hidden; }
    button, select, input { font: inherit; }

    /* Toolbar */
    .global-toolbar { background: var(--bg-deep); padding: 4px 12px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 12px; z-index: 100; box-shadow: 0 2px 4px rgba(0,0,0,0.3); min-height: 36px; flex-wrap: wrap; }
    .toolbar-side { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .toolbar-group { display: flex; align-items: center; gap: 6px; border-right: 1px solid var(--line); padding-right: 12px; position: relative; }
    .toolbar-group:last-child { border-right: none; padding-right: 0; }
    .toolbar-label { font-size: 10px; text-transform: uppercase; color: var(--muted); font-weight: bold; letter-spacing: 0.5px; }
    .tool-select { background: var(--panel); color: var(--text); border: 1px solid var(--line); padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; outline: none; }
    .tool-select:hover { border-color: #475569; }
    .tool-select:focus { border-color: var(--accent); }
    .tool-btn, .mini-btn { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 4px; font-size: 11px; padding: 2px 8px; cursor: pointer; white-space: nowrap; }
    .tool-btn:hover, .mini-btn:hover { border-color: var(--accent); }
    .tool-btn[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
    .mini-btn:disabled { opacity: 0.4; cursor: default; border-color: var(--line); }
    .mini-btn.alert { border-color: var(--warn); color: var(--warn); }
    .icon-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; transition: all 0.2s; }
    .icon-btn.start { background: var(--good); color: white; }
    .icon-btn.start:hover { background: #16a34a; }
    .icon-btn.reset { background: var(--bad); color: white; font-weight: bold; font-size: 14px; }
    .icon-btn.reset:hover { background: #dc2626; }
    .badge { font-size: 11px; color: var(--muted); white-space: nowrap; }

    /* Sound mixer popover */
    #mixer { display: none; position: absolute; top: calc(100% + 8px); left: 0; z-index: 300; background: #111827; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; width: 240px; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
    #mixer.open { display: block; }
    #mixer label { display: grid; grid-template-columns: 70px 1fr 34px; align-items: center; gap: 8px; font-size: 12px; color: var(--text); margin: 6px 0; }
    #mixer output { font-variant-numeric: tabular-nums; color: var(--muted); text-align: right; }
    #mixer p { margin: 8px 0 0; font-size: 11px; color: var(--muted); line-height: 1.4; }

    /* Workspace & panes */
    .workspace { display: flex; flex: 1; overflow: hidden; }
    .pane { display: flex; flex-direction: column; background: var(--panel); flex: 1; min-width: 0; transition: all 0.3s ease; }
    .board-pane { border-right: 2px solid var(--bg); }
    .pane-header { background: var(--bg); padding: 4px 10px; font-weight: 600; font-size: 12px; color: #94a3b8; display: flex; align-items: center; height: 32px; }
    .tab-row { display: flex; background: var(--bg); }
    .tabs { display: flex; flex: 1; overflow-x: auto; height: 32px; }
    .tab-btn { flex: 1; padding: 4px 8px; font-size: 12px; background: transparent; color: var(--muted); border: none; cursor: pointer; font-weight: 600; border-bottom: 2px solid transparent; white-space: nowrap; }
    .tab-btn:hover { color: white; background: var(--panel); }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); background: var(--panel); }
    .tab-btn.buzz { animation: tab-buzz 0.6s; }
    .tab-tools { display: flex; gap: 4px; padding: 0 6px; align-items: center; background: var(--bg); }

    body[data-layout="board"] .player-pane { display: none; }
    body[data-layout="player"] .board-pane { display: none; }

    /* Iframes */
    .iframe-container { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: var(--bg); overflow: auto; }
    .iframe-wrapper { position: relative; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; max-width: 100%; max-height: 100%; }
    iframe { border: none; background: white; transition: all 0.3s ease; box-sizing: border-box; }
    body[data-device="responsive"] .iframe-wrapper { width: 100%; height: 100%; }
    body[data-device="responsive"] iframe { width: 100%; height: 100%; border-radius: 0; }
    body[data-device="portrait"] .player-wrapper { width: min(375px, calc(100% - 24px)); max-height: calc(100% - 24px); aspect-ratio: 375 / 812; height: auto; }
    body[data-device="landscape"] .player-wrapper { width: min(812px, calc(100% - 24px)); max-height: calc(100% - 24px); aspect-ratio: 812 / 375; height: auto; }
    body[data-device="portrait"] .player-wrapper iframe, body[data-device="landscape"] .player-wrapper iframe { width: 100%; height: 100%; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); border: 8px solid var(--line); }
    body:not([data-device="responsive"]) .board-wrapper { width: 100%; height: 100%; }
    body:not([data-device="responsive"]) .board-wrapper iframe { width: 100%; height: 100%; }

    /* Disconnected screens and vibration */
    /* A banner, not a cover: taps on an offline phone still work and queue. */
    .veil { display: none; position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 24px); padding: 6px 12px; border-radius: 8px; background: rgba(2, 6, 23, 0.9); border: 1px solid var(--warn); color: #fde68a; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; font-weight: 700; text-align: center; pointer-events: none; z-index: 2; }
    .veil small { font-weight: 400; color: var(--text); }
    .iframe-wrapper.offline .veil { display: flex; }
    .iframe-wrapper.offline iframe { filter: grayscale(0.85) brightness(0.8); }
    .iframe-wrapper.buzz { animation: buzz 0.12s linear infinite; }
    @keyframes buzz { 0% { transform: translate(0, 0); } 25% { transform: translate(-2px, 1px); } 50% { transform: translate(2px, -1px); } 75% { transform: translate(-1px, -1px); } 100% { transform: translate(0, 0); } }
    @keyframes tab-buzz { 0%, 100% { background: transparent; } 50% { background: rgba(245, 158, 11, 0.35); } }

    /* State inspector */
    .inspector { display: none; flex-direction: column; width: 440px; max-width: 45vw; min-width: 320px; background: #0b1222; border-left: 2px solid var(--bg); font-size: 12px; }
    body[data-inspector="open"] .inspector { display: flex; }
    .insp-head { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--bg); height: 32px; }
    .insp-head b { font-size: 12px; color: #94a3b8; margin-right: auto; }
    .insp-log { flex: 0 0 38%; overflow-y: auto; border-bottom: 1px solid var(--line); outline: none; }
    .insp-empty { padding: 12px; color: var(--muted); }
    .log-row { display: grid; grid-template-columns: 34px 60px 64px 1fr; gap: 6px; padding: 3px 8px; cursor: pointer; border-left: 3px solid transparent; white-space: nowrap; }
    .log-row:hover { background: rgba(56, 189, 248, 0.06); }
    .log-row.selected { background: rgba(56, 189, 248, 0.14); border-left-color: var(--accent); }
    .log-row.error .log-label { color: #fca5a5; }
    .log-id, .log-time { color: var(--muted); font-variant-numeric: tabular-nums; }
    .log-actor { color: #a5b4fc; overflow: hidden; text-overflow: ellipsis; }
    .log-label { overflow: hidden; text-overflow: ellipsis; color: var(--text); }
    .log-label .pl { color: var(--muted); }
    .log-row.kind-timer .log-label, .log-row.kind-reload .log-label { color: #94a3b8; font-style: italic; }
    .insp-bar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--line); background: var(--bg); }
    .insp-bar select { flex: 1; min-width: 0; }
    .insp-meta { padding: 6px 8px 0; color: #94a3b8; }
    .insp-meta .err { color: #fca5a5; margin-top: 4px; white-space: pre-wrap; }
    .insp-changes { padding: 4px 8px; color: var(--muted); max-height: 96px; overflow-y: auto; }
    .insp-changes div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .insp-changes code { color: #fde68a; }
    .insp-tree { flex: 1; overflow: auto; padding: 4px 8px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; }
    .insp-tree details > summary { cursor: pointer; list-style: none; }
    .insp-tree details > summary::before { content: '▸ '; color: var(--muted); }
    .insp-tree details[open] > summary::before { content: '▾ '; }
    .insp-tree .children { padding-left: 14px; border-left: 1px dotted #263247; margin-left: 4px; }
    .insp-tree .leaf { padding-left: 13px; white-space: pre-wrap; word-break: break-word; }
    .insp-tree .k { color: #93c5fd; }
    .insp-tree .s { color: #86efac; }
    .insp-tree .n { color: #fdba74; }
    .insp-tree .b { color: #c4b5fd; }
    .insp-tree .z { color: var(--muted); }
    .insp-tree .p { color: var(--muted); }
    .insp-tree .changed > summary, .insp-tree .leaf.changed { background: rgba(253, 230, 138, 0.12); border-radius: 3px; }

    /* Results (game over), warnings and toasts */
    #warning { display: none; background: #7f1d1d; color: #fecaca; font-size: 12px; padding: 6px 12px; cursor: pointer; }
    #results { display: none; position: fixed; inset: 40px 0 0 0; background: rgba(2, 6, 23, 0.82); z-index: 200; align-items: center; justify-content: center; }
    #results .card { background: #111827; border: 1px solid var(--line); border-radius: 14px; padding: 20px 24px; width: min(720px, 92vw); max-height: 85vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    #results h2 { margin: 4px 0; font-size: 28px; text-align: center; }
    #results .game { text-align: center; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; }
    #results .summary { text-align: center; color: var(--text); margin: 0 0 12px; }
    #results .row { display: grid; grid-template-columns: 48px 1fr auto; gap: 10px; padding: 6px 10px; margin: 4px 0; border-radius: 8px; background: var(--panel); font-size: 14px; }
    #results .row.dim { opacity: 0.5; }
    #results .sub { font-size: 12px; color: #94a3b8; }
    #results .phones { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; font-size: 13px; color: var(--text); }
    #results .actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
    #results .actions button { padding: 8px 16px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; }
    #results-pill { display: none; position: fixed; right: 16px; bottom: 16px; z-index: 150; background: #111827; color: #facc15; border: 1px solid #facc15; border-radius: 20px; padding: 8px 14px; cursor: pointer; font-weight: 700; }
    #toasts { position: fixed; left: 16px; bottom: 16px; z-index: 400; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
    .toast { background: #111827; border: 1px solid var(--line); border-left: 3px solid var(--accent); color: var(--text); font-size: 12px; padding: 8px 12px; border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); max-width: 420px; }
    .toast.error { border-left-color: var(--bad); color: #fecaca; }
    .toast.haptic { border-left-color: var(--warn); }
`;

const lagOptions = (withDefault) => [
    withDefault ? '<option value="">Same as all</option>' : '',
    ...Object.entries(LAG_PRESETS).map(([name, preset]) => `<option value="${name}">${escapeHtml(preset.label)}</option>`),
].join('');

export function generateHarnessHtml({ gameName, playersCount, previewPort, isDev = false, hotReload = true }) {
    const players = Array.from({ length: playersCount }, (_, i) => ({ id: `player_${i + 1}`, label: `Player ${i + 1}` }));

    const playerTabs = players
        .map((player, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-player="${player.id}">${player.label}<span class="tab-status"></span></button>`)
        .join('');

    const playerFrames = players
        .map((player, i) => `
                    <div id="wrapper_${player.id}" class="iframe-wrapper player-wrapper" style="display: ${i === 0 ? 'flex' : 'none'};">
                        <iframe id="${player.id}" title="${player.label}" data-src="http://localhost:${previewPort}/player.html" allow="autoplay"></iframe>
                        <div class="veil">📴 Disconnected<small class="veil-detail"></small></div>
                    </div>`)
        .join('');

    const config = { gameName, previewPort, players, isDev, hotReload };
    const hotTitle = isDev
        ? 'Engine edits in src/ reload the engine and keep the game. Vite hot-reloads the apps.'
        : 'Run `npm run build` in another terminal: the sandbox loads the new build and keeps the game.';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(gameName)} - Simulator</title>
    <link rel="icon" href="data:,">
    <style>${STYLES}</style>
</head>
<body data-layout="split" data-device="responsive" data-inspector="closed">
    <div id="warning" title="Click to dismiss"></div>
    <div id="results"><div class="card" id="results-card"></div></div>
    <button id="results-pill" data-action="reopen-results">🏆 Results</button>
    <div id="toasts" aria-live="polite"></div>

    <div class="global-toolbar">
        <div class="toolbar-side">
            <div class="toolbar-group">
                <span class="toolbar-label">Layout</span>
                <select class="tool-select" data-control="layout">
                    <option value="split">Split</option>
                    <option value="board">Board</option>
                    <option value="player">Player</option>
                </select>
            </div>

            <div class="toolbar-group">
                <span class="toolbar-label">Device Size</span>
                <select class="tool-select" data-control="device">
                    <option value="responsive">Fluid View</option>
                    <option value="portrait">📱 Portrait</option>
                    <option value="landscape">📟 Landscape</option>
                </select>
            </div>

            <div class="toolbar-group" title="Simulated latency between the players' phones and the room. The board runs the engine in Local hosting, so it has none.">
                <span class="toolbar-label">Network</span>
                <select class="tool-select" data-control="lag-all">${lagOptions(false)}</select>
            </div>

            <div class="toolbar-group">
                <span class="toolbar-label">Sound</span>
                <select class="tool-select" data-control="sound-mode" title="Which screens play sound. The sandbox plays the platform here: each screen gets its own settings.">
                    <option value="focus">Board + shown player</option>
                    <option value="all">Every screen</option>
                    <option value="board">Board only</option>
                    <option value="muted">🔇 Muted</option>
                </select>
                <button class="tool-btn" data-action="toggle-mixer" aria-expanded="false" title="Volume levels sent to the game">🔊 Levels</button>
                <div id="mixer" role="dialog" aria-label="Volume">
                    <label>Master <input type="range" min="0" max="100" data-volume="masterVolume"><output></output></label>
                    <label>Music <input type="range" min="0" max="100" data-volume="musicVolume"><output></output></label>
                    <label>Effects <input type="range" min="0" max="100" data-volume="sfxVolume"><output></output></label>
                    <p>Sent to every screen as <code>platform:settings</code>, as the platform does from its game menu.</p>
                </div>
            </div>
        </div>

        <div class="toolbar-side">
            ${hotReload ? `<span class="badge" title="${escapeHtml(hotTitle)}">♻ Hot reload</span>` : ''}
            <button class="tool-btn" data-action="toggle-inspector" aria-pressed="false" title="State inspector and time travel">🔍 State</button>
            <button class="icon-btn start" data-action="start" title="Start Game">▶</button>
            <button class="icon-btn reset" data-action="reset" title="Reset Environment">↻</button>
        </div>
    </div>

    <div class="workspace">
        <div class="pane board-pane">
            <div class="pane-header">🖥️ Main Board</div>
            <div class="iframe-container">
                <div id="wrapper_board" class="iframe-wrapper board-wrapper">
                    <iframe id="board" title="Board" data-src="http://localhost:${previewPort}/board.html" allow="autoplay"></iframe>
                </div>
            </div>
        </div>

        <div class="pane player-pane">
            <div class="tab-row">
                <div class="tabs" id="tabs">${playerTabs}</div>
                <div class="tab-tools">
                    <select class="tool-select" data-control="lag-player" title="This player's network">${lagOptions(true)}</select>
                    <button class="mini-btn" data-action="toggle-connection" title="Drop this phone's connection, then bring it back">Disconnect</button>
                    <button class="mini-btn" data-action="leave" title="This player leaves the room">Leave</button>
                    <button class="mini-btn" data-action="rejoin" title="This player joins again (same player ID)">Rejoin</button>
                </div>
            </div>
            <div class="iframe-container">${playerFrames}
            </div>
        </div>

        <aside class="inspector" aria-label="State inspector">
            <div class="insp-head">
                <b>State timeline</b>
                <button class="mini-btn" data-action="insp-prev" title="Previous entry">◀</button>
                <button class="mini-btn" data-action="insp-next" title="Next entry">▶</button>
                <button class="mini-btn" data-action="insp-live" title="Follow the latest state">● Live</button>
                <button class="mini-btn alert" data-action="insp-rewind" title="Rewind the engine to this entry and send every screen its state. Later entries are dropped.">⏪ Rewind</button>
            </div>
            <div class="insp-log" id="insp-log" tabindex="0"></div>
            <div class="insp-bar">
                <select class="tool-select" data-control="insp-view" title="Whose view of the state"></select>
                <button class="mini-btn" data-action="insp-copy" title="Copy this state as JSON">Copy</button>
            </div>
            <div class="insp-meta" id="insp-meta"></div>
            <div class="insp-changes" id="insp-changes"></div>
            <div class="insp-tree" id="insp-tree"></div>
        </aside>
    </div>

    <script>(${harnessClient.toString()})(${scriptJson(config)});</script>
</body>
</html>
`;
}
