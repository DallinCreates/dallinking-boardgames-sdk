export const SOCKET_MESSAGE_SOURCE: string;

/** The message type engines use for per-screen effects (sound, vibration). */
export const GAME_FX_TYPE: 'game:fx';

export function unwrapGameMessage(data: unknown): any;

export function createIframeGameBridge(options: {
  onIncomingMessage: (message: any) => void;
  targetOrigin?: string;
}): {
  sendToParent: (message: { type: string; payload?: any; meta?: any }) => void;
  startListening: () => () => void;
};

// ------------------------------------------------------------------
// Platform settings
// ------------------------------------------------------------------

/** This device's sound and vibration settings. The platform owns them. */
export interface PlatformSettings {
  muted: boolean;
  /** 0-1 */
  masterVolume: number;
  /** 0-1 */
  musicVolume: number;
  /** 0-1 */
  sfxVolume: number;
  /** The player allows vibration. */
  haptics: boolean;
  /** This device can vibrate at all. */
  canVibrate: boolean;
}

export const DEFAULT_PLATFORM_SETTINGS: Readonly<PlatformSettings>;

export const platformSettings: {
  get(): Readonly<PlatformSettings>;
  /** True once the platform has sent settings (older platforms never do). */
  isFromPlatform(): boolean;
  subscribe(listener: (settings: Readonly<PlatformSettings>) => void): () => void;
};

/** The volume a channel actually plays at, 0-1, after mute and master volume. */
export function effectiveVolume(settings: PlatformSettings, channel: 'music' | 'sfx'): number;

// ------------------------------------------------------------------
// Audio
// ------------------------------------------------------------------

export const audio: {
  /** Name your sounds once, then play them by name: { buzz: './sounds/buzz.mp3' }. */
  registerSounds(sounds: Record<string, string>): void;
  /** Fetches and decodes sounds ahead of time. With no argument, every registered sound. */
  preload(sounds?: string | string[]): Promise<void>;
  /** A one-shot sound effect on this screen only, at the player's sound-effects volume. */
  playSfx(sound: string, options?: { volume?: number; rate?: number }): Promise<void>;
  /** A background track at the player's music volume. Replaces the current one. */
  playMusic(src: string, options?: { loop?: boolean; volume?: number; fadeMs?: number }): void;
  stopMusic(options?: { fadeMs?: number }): void;
  /** The URL of the track playing now, or null. */
  currentMusic(): string | null;
  /** Resumes audio after a user gesture. Called automatically on taps and key presses. */
  unlock(): void;
};

// ------------------------------------------------------------------
// Haptics
// ------------------------------------------------------------------

export type HapticPatternName = 'tap' | 'success' | 'error' | 'turn' | 'warning';
export type HapticPattern = HapticPatternName | number | number[];

export const HAPTIC_PATTERNS: Readonly<Record<HapticPatternName, number[]>>;

/** A safe navigator.vibrate() pattern, or null. */
export function normalizeHapticPattern(pattern: HapticPattern): number[] | null;

export const haptics: {
  /** Vibrates this phone. Returns whether a vibration was requested on a device that can vibrate. */
  vibrate(pattern?: HapticPattern): boolean;
  /** "It's your turn." */
  yourTurn(): boolean;
  /** "Time is running out." */
  timeRunningOut(): boolean;
  /** Whether this device can vibrate and the player allows it. */
  isAvailable(): boolean;
};

// ------------------------------------------------------------------
// React
// ------------------------------------------------------------------

export const BoardgameContext: any;

export function BoardgameProvider(props: {
  children: any;
  targetOrigin?: string;
  /** Sound names to URLs, playable by name from audio.playSfx() and the engine's playSound(). */
  sounds?: Record<string, string>;
}): any;

export function useBoardgame(options?: {
  onMessage?: (message: any) => void;
}): {
  send: (message: { type: string; payload?: any; meta?: any }) => void;
  audio: typeof audio;
  haptics: typeof haptics;
};

/** This device's sound and vibration settings. Re-renders when they change. */
export function usePlatformSettings(): Readonly<PlatformSettings>;

declare const _default: {
  createIframeGameBridge: typeof createIframeGameBridge;
  BoardgameProvider: typeof BoardgameProvider;
  useBoardgame: typeof useBoardgame;
  usePlatformSettings: typeof usePlatformSettings;
  audio: typeof audio;
  haptics: typeof haptics;
  platformSettings: typeof platformSettings;
};

export default _default;
