// src/engine/engine.js: a complete starter game (first to N taps wins).

export const engine = `import { BaseGameEngine } from '@dallincreates/boardgame-server';
import { ACTION, MESSAGE, PHASE, WINNING_SCORE } from '../shared/game.js';

/**
 * Your game's rules. The engine owns all game state; the board and phones
 * only send actions and draw what it broadcasts.
 *
 * How it runs, when each hook fires, and the runtime rules:
 * https://github.com/DallinCreates/dallinking-boardgames-sdk/blob/main/docs/engine.md
 */
export default class Engine extends BaseGameEngine {
  // The room picked this game. Set up state before anyone is introduced.
  // Keep state plain JSON: it's sent to clients and saved in checkpoints.
  onInit() {
    this.state = {
      phase: PHASE.LOBBY,
      players: {}, // playerId -> { name, score, connected, left }
      winnerId: null,
    };
  }

  // Once for every player already seated, then for each new one.
  // isLateJoin is true when they arrive after Start. A player who left and
  // came back has the same playerId, so they keep their score.
  onPlayerJoin(playerId, name, isLateJoin) {
    const existing = this.state.players[playerId];
    if (existing) {
      Object.assign(existing, { name, connected: true, left: false });
    } else {
      this.state.players[playerId] = { name, score: 0, connected: true, left: false };
    }
    this.sync();
  }

  // The host or VIP pressed Start (only possible once the player count fits
  // "players" in game.config.json). Runs once.
  onGameStart() {
    super.onGameStart();
    this.state.phase = PHASE.PLAYING;
    this.sync();
  }

  // Every action the board or a phone sends. meta.playerId, meta.isBoard and
  // meta.isVip are filled in by the platform and can be trusted; payload
  // comes from the client and can't.
  processAction(type, payload, meta) {
    switch (type) {
      case ACTION.SCORE:
        this.score(meta.playerId);
        break;
      default:
        console.warn('Unhandled action:', type);
    }
  }

  score(playerId) {
    const player = this.state.players[playerId];
    if (this.state.phase !== PHASE.PLAYING || this.isGameOver || !player) return;

    player.score += 1;
    if (player.score < WINNING_SCORE) {
      this.sync();
      return;
    }

    this.state.phase = PHASE.GAME_OVER;
    this.state.winnerId = playerId;
    this.sync();

    // Hand the result to the platform: it shows the results screen on every
    // screen, counts the win on the Tonight scoreboard, and offers Play
    // again. The highest score wins.
    const scores = {};
    Object.entries(this.state.players).forEach(([id, { score }]) => {
      scores[id] = score;
    });
    this.gameOver({ players: scores, summary: player.name + ' reached ' + WINNING_SCORE + ' first.' });
  }

  // The host or VIP chose Play again on the results screen. Same engine,
  // same players: reset the round and broadcast. (Leave this out and the
  // platform starts a fresh engine instead.)
  onPlayAgain() {
    Object.values(this.state.players).forEach((player) => {
      player.score = 0;
    });
    this.state.phase = PHASE.PLAYING;
    this.state.winnerId = null;
    this.sync();
  }

  // A connection dropped. The seat is held (up to 10 minutes mid-game), so
  // mark them away instead of removing them.
  onDisconnect(playerId, meta) {
    const player = this.state.players[playerId];
    if (player) player.connected = false;
    this.sync();
  }

  // They're back. The platform sends them a fresh snapshot after this.
  onReconnect(playerId, meta) {
    const player = this.state.players[playerId];
    if (player) player.connected = true;
    this.sync();
  }

  // They left, were kicked, or didn't come back in time. Keep their score:
  // if they rejoin, onPlayerJoin gets the same playerId.
  onPlayerLeave(playerId) {
    const player = this.state.players[playerId];
    if (player) Object.assign(player, { connected: false, left: true });
    this.sync();
  }

  // What a single client gets after reconnecting or pressing Refresh.
  // Both default to this.state. If your game has secrets (hands, roles),
  // return only what this player may see.
  getPlayerState(playerId) {
    return this.state;
  }

  getBoardState() {
    return this.state;
  }

  // The game ended or the room closed. Clear any timers you started.
  destroy() {}

  // Broadcasting game:sync_state updates every screen and also saves a
  // checkpoint, so the game survives the host's tab reloading.
  sync() {
    this.broadcastRoomUpdate({ type: MESSAGE.SYNC_STATE, payload: { state: this.state } });
  }
}
`;
