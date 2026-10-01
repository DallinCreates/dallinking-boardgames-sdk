import { SDK_VERSION } from './version';
import { GAME_OVER_DEFAULT_DELAY_MS, GameOverResults, validateGameOverResults } from './gameOver';

/**
 * System-injected metadata attached to every incoming game action.
 * Your room routing system automatically generates this before calling processAction().
 */
export interface ActionMeta {
  playerId: string;
  isBoard: boolean;
  isVip: boolean;
  timestamp: number;
  [key: string]: any;
}

export interface ConnectionMeta {
  isBoard: boolean;
  timestamp: number;
}

export interface EngineDependencies {
  boardId: string;
  broadcastRoomUpdate: (payload: any) => void;
  sendMessageToPlayer: (playerId: string, payload: any) => void;
  sendMessageToBoard: (payload: any) => void;
  /** Injected by the platform: records results and shows the results screen. */
  reportGameOver?: (results: GameOverResults) => void;
}

/**
 * The core engine class for dallinking-boardgames-sdk.
 * Developers must extend this class to build their authoritative game logic.
 */
export abstract class BaseGameEngine {
  /**
   * The SDK version this engine was bundled with. Inherited by every engine
   * class, so the platform can read it at runtime as `GameClass.sdkVersion`.
   */
  public static readonly sdkVersion: string = SDK_VERSION;

  public boardId: string;
  public broadcastRoomUpdate: (payload: any) => void;
  public sendMessageToPlayer: (playerId: string, payload: any) => void;
  public sendMessageToBoard: (payload: any) => void;
  
  public state: Record<string, any>;
  public hasStarted: boolean;

  private readonly reportGameOver?: (results: GameOverResults) => void;
  private gameOverReported = false;

  constructor(deps: EngineDependencies) {
    this.boardId = deps.boardId;
    this.broadcastRoomUpdate = deps.broadcastRoomUpdate;
    this.sendMessageToPlayer = deps.sendMessageToPlayer;
    this.sendMessageToBoard = deps.sendMessageToBoard;
    this.reportGameOver = deps.reportGameOver;

    this.state = {};
    this.hasStarted = false;
  }

  /** True from gameOver() until the game restarts (Play again). */
  public get isGameOver(): boolean {
    return this.gameOverReported;
  }

  /**
   * Ends the game and hands the results to the platform, which shows the
   * results screen on every device, records the game in the party's Tonight
   * scoreboard, and offers Play again / Pick another game.
   *
   *   this.gameOver({ players: { [annId]: 42, [boId]: 37 } });        // highest score wins
   *   this.gameOver({ players: { [annId]: 'WON', [boId]: 'LOST' } });
   *   this.gameOver({ teams: [{ name: 'Red team', players: [annId, boId], outcome: 'WON' },
   *                           { name: 'Blue team', players: [cyId], outcome: 'LOST' }] });
   *
   * Call it once, after onGameStart. Invalid results are rejected with a
   * console warning and the game carries on. Your engine keeps running
   * afterwards; ignore gameplay actions while isGameOver is true.
   */
  public gameOver(results: GameOverResults): void {
    if (!this.hasStarted) {
      console.warn("gameOver() ignored: the game hasn't started yet.");
      return;
    }
    if (this.gameOverReported) {
      console.warn('gameOver() ignored: it was already called for this game.');
      return;
    }
    const problem = validateGameOverResults(results);
    if (problem) {
      console.warn(`gameOver() ignored: ${problem}`);
      return;
    }
    if (typeof this.reportGameOver !== 'function') {
      console.warn('gameOver() ignored: this platform version has no results screen yet.');
      return;
    }
    this.gameOverReported = true;
    this.reportGameOver({ delayMs: GAME_OVER_DEFAULT_DELAY_MS, ...results });
  }

  /**
   * Optional. Called when the host or VIP chooses Play again, on this same
   * engine instance: keep what you want across rounds, reset the rest, then
   * broadcast. onGameStart is not called again. Leave it undefined to have
   * the platform start a fresh engine instead.
   */
  public onPlayAgain?(): void;

  /**
   * Called by the platform for Play again. Clears isGameOver, then runs
   * onPlayAgain. Don't override this; implement onPlayAgain.
   */
  public beginPlayAgain(): void {
    this.gameOverReported = false;
    if (typeof this.onPlayAgain === 'function') this.onPlayAgain();
  }

  /**
   * Triggered when the party selects this game ("room:select_game"), and
   * again with a fresh engine when a game ends and the party returns to the
   * lobby. Used to initialize base state before players are introduced.
   */
  public abstract onInit(): void

  /**
   * Triggered for every seated player: once for each player already in the
   * party right after onInit (isLateJoin = false), then for each "room:join"
   * that follows (isLateJoin = true if the game has already started).
   *
   * A player who left and rejoins comes back with the same playerId, so this
   * can receive an ID you already saw in onPlayerLeave.
   */
  public abstract onPlayerJoin(playerId: string, name: string, isLateJoin: boolean): void

  /**
   * A player left, was kicked, or didn't reconnect in time. They may rejoin
   * later with the same playerId. Cloud hosting calls this only after Start;
   * Local hosting may call it in the lobby too.
   */
  public abstract onPlayerLeave(playerId: string): void

  /**
   * Triggered during "room:start" (sent by the board or the VIP). Called
   * exactly once per engine instance.
   */
  public onGameStart(): void {
    this.hasStarted = true;
  }

  /**
   * Returns the state payload delivered to the board screen when it
   * reconnects or requests a refresh. Defaults to the full engine state;
   * override it to shape or trim what the board receives.
   */
  public getBoardState(): any {
    return this.state;
  }

  /**
   * Returns the state payload delivered to a specific player when they
   * reconnect or request a refresh. Defaults to the full engine state;
   * override it to hide secrets other players shouldn't see (roles, hands,
   * hidden words, etc).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- overrides use it
  public getPlayerState(playerId: string): any {
    return this.state;
  }

  /**
   * Sends the appropriate snapshot (getPlayerState/getBoardState) to one
   * client as a "game:sync_state" message. The platform calls this
   * automatically when a client reconnects or presses the in-game refresh
   * button; you can also call it yourself after large state transitions.
   */
  public sendStateSnapshot(playerId: string, isBoard = false): void {
    if (isBoard) {
      this.sendMessageToBoard({ type: 'game:sync_state', payload: { state: this.getBoardState() } });
    } else {
      this.sendMessageToPlayer(playerId, { type: 'game:sync_state', payload: { state: this.getPlayerState(playerId) } });
    }
  }

  /**
   * Triggered for any incoming message starting with "game:*".
   * This is the main router for developer game logic.
   * @param actionType The specific action string (e.g., "game:set-clue")
   * @param payload The data sent by the client
   * @param meta System-injected metadata (playerId, isBoard, isVip, etc.)
   */
  public abstract processAction(actionType: string, payload: any, meta: ActionMeta): void;

  public abstract onReconnect(playerId: string, meta: ActionMeta): void;

  public abstract onDisconnect(playerId: string, meta: ConnectionMeta): void;
  /**
   * Triggered when the room is closed or the board disconnects.
   * Used to clean up intervals, timeouts, or memory.
   */
  public destroy(): void {}
}