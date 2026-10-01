/**
 * Effects an engine can play on individual screens: a sound on one phone,
 * a vibration for whoever's turn it is. They travel as an ordinary game:fx
 * message, and @dallincreates/boardgame-client plays them at the player's own
 * volume and vibration settings, so your apps don't need to handle them.
 */
export const GAME_FX_MESSAGE = 'game:fx';

export type HapticPatternName = 'tap' | 'success' | 'error' | 'turn' | 'warning';

/** A named pattern, a duration in ms, or a navigator.vibrate() pattern: [on, off, on, ...]. */
export type HapticPattern = HapticPatternName | number | number[];

/**
 * Who an effect is for:
 * - 'all': the board and every player
 * - 'players': every player, not the board
 * - 'board': the shared screen
 * - a playerId, or an array of them
 */
export type EffectTarget = 'all' | 'players' | 'board' | string | string[];

export interface GameEffect {
  /** A sound registered in the app (<BoardgameProvider sounds={...}>), or a URL relative to the app. */
  sound?: string;
  /** 0-1, scaled by the player's sound-effects volume. Default 1. */
  volume?: number;
  /** Vibration, on phones only. */
  haptic?: HapticPattern;
}

export interface EffectMessage {
  type: typeof GAME_FX_MESSAGE;
  payload: GameEffect & { only?: 'players' };
}

/** Builds the game:fx message, leaving out unset fields. */
export function buildEffectMessage(effect: GameEffect, only?: 'players'): EffectMessage {
  const payload: EffectMessage['payload'] = {};
  if (typeof effect.sound === 'string' && effect.sound) payload.sound = effect.sound;
  if (typeof effect.volume === 'number') payload.volume = effect.volume;
  if (effect.haptic !== undefined && effect.haptic !== null) payload.haptic = effect.haptic;
  if (only) payload.only = only;
  return { type: GAME_FX_MESSAGE, payload };
}
