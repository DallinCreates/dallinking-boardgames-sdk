// Per-device settings the platform owns: sound and vibration. Players and the
// host change them in the platform's game menu, and the platform sends them
// to the game as "platform:settings". Games never store their own volume or
// mute state; they play through `audio`, which applies these.

const canVibrateHere = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  muted: false,
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
  haptics: true,
  // Whether this device can vibrate at all. Framed games can't tell, so the
  // platform reports it.
  canVibrate: false,
});

const clamp01 = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

export function normalizePlatformSettings(raw, base = DEFAULT_PLATFORM_SETTINGS) {
  const next = raw && typeof raw === 'object' ? raw : {};
  return Object.freeze({
    muted: typeof next.muted === 'boolean' ? next.muted : base.muted,
    masterVolume: clamp01(next.masterVolume, base.masterVolume),
    musicVolume: clamp01(next.musicVolume, base.musicVolume),
    sfxVolume: clamp01(next.sfxVolume, base.sfxVolume),
    haptics: typeof next.haptics === 'boolean' ? next.haptics : base.haptics,
    canVibrate: typeof next.canVibrate === 'boolean' ? next.canVibrate : base.canVibrate,
  });
}

/** The volume a channel ('music' or 'sfx') actually plays at, 0-1. */
export function effectiveVolume(settings, channel) {
  if (settings.muted) return 0;
  return settings.masterVolume * (channel === 'music' ? settings.musicVolume : settings.sfxVolume);
}

function createPlatformSettingsStore() {
  // Opened outside the platform (player.html on its own), the page is its own
  // top frame and can vibrate directly.
  let current = Object.freeze({ ...DEFAULT_PLATFORM_SETTINGS, canVibrate: canVibrateHere() });
  let received = false;
  const listeners = new Set();

  return {
    /** The current settings. The object is replaced, never mutated, on change. */
    get: () => current,
    /** True once the platform has sent settings (older platforms never do). */
    isFromPlatform: () => received,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // The bridge calls this with each "platform:settings" message.
    apply(raw) {
      current = normalizePlatformSettings(raw, current);
      received = true;
      listeners.forEach((listener) => {
        try {
          listener(current);
        } catch (error) {
          console.error('[boardgame-client] settings listener failed:', error);
        }
      });
    },
  };
}

export const platformSettings = createPlatformSettingsStore();
