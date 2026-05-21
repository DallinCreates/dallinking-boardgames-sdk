export const GAME_STATUS = {
  LOBBY: 'lobby',
  ASSIGNING_ROLES: 'assigning_roles',
  PLAYING: 'playing',
  GAME_OVER: 'game_over',
} as const;

export const MESSAGE_TYPE = {
  ROOM_UPDATE: 'room:update',
  ROOM_GAME_STARTED: 'room:game-started',
  ROOM_CLOSED: 'room:closed',
  GAME_UPDATE: 'game:update',
  GAME_ERROR: 'game:error',
} as const;