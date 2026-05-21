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

export interface EngineDependencies {
  boardId: string;
  broadcastRoomUpdate: (payload: any) => void;
  sendMessageToPlayer: (playerId: string, payload: any) => void;
  sendMessageToBoard: (payload: any) => void;
}

/**
 * The core engine class for dallinking-boardgames-sdk.
 * Developers must extend this class to build their authoritative game logic.
 */
export abstract class BaseGameEngine {
  public boardId: string;
  public broadcastRoomUpdate: (payload: any) => void;
  public sendMessageToPlayer: (playerId: string, payload: any) => void;
  public sendMessageToBoard: (payload: any) => void;
  
  public state: Record<string, any>;
  public settings: Record<string, any>;
  public hasStarted: boolean;

  constructor(deps: EngineDependencies) {
    this.boardId = deps.boardId;
    this.broadcastRoomUpdate = deps.broadcastRoomUpdate;
    this.sendMessageToPlayer = deps.sendMessageToPlayer;
    this.sendMessageToBoard = deps.sendMessageToBoard;
    
    this.state = {};
    this.settings = {};
    this.hasStarted = false;
  }

  /**
   * Triggered during "room:create".
   * Used to initialize base state before players join.
   */
  public onInit(): void {}

  /**
   * Triggered during "room:join" ONLY if the game has already started.
   */
  public onPlayerJoin(playerId: string, name: string, isLateJoin: boolean): void {}

  /**
   * Triggered during "room:leave" ONLY if the game has already started.
   */
  public onPlayerLeave(playerId: string): void {}

  /**
   * Triggered during "room:start". Called exactly once per game.
   */
  public onGameStart(): void {
    this.hasStarted = true;
  }

  /**
   * Triggered during "room:settings".
   * Automatically merges new settings and broadcasts the update.
   */
  public updateSettings(newSettings: Record<string, any>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.broadcastRoomUpdate({ type: "game:settings-updated", settings: this.settings });
  }

  /**
   * Triggered for any incoming message starting with "game:*".
   * This is the main router for developer game logic.
   * * @param actionType The specific action string (e.g., "game:set-clue")
   * @param payload The data sent by the client
   * @param meta System-injected metadata (playerId, isBoard, isVip, etc.)
   */
  public abstract processAction(actionType: string, payload: any, meta: ActionMeta): void;

  /**
   * Triggered when the room is closed or the board disconnects.
   * Used to clean up intervals, timeouts, or memory.
   */
  public destroy(): void {}
}