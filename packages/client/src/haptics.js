import { platformSettings } from './settings.js';

// Named patterns, in navigator.vibrate() form: [on, off, on, ...] in ms.
export const HAPTIC_PATTERNS = Object.freeze({
  tap: [15],
  success: [30, 60, 30],
  error: [70, 50, 70, 50, 70],
  turn: [80, 60, 120],
  warning: [200, 100, 200, 100, 200],
});

const MAX_SEGMENT_MS = 1000;
const MAX_SEGMENTS = 10;

/** Turns a name, a duration or an array into a safe vibrate() pattern, or null. */
export function normalizeHapticPattern(pattern) {
  let segments = pattern;
  if (typeof pattern === 'string') segments = HAPTIC_PATTERNS[pattern];
  else if (typeof pattern === 'number') segments = [pattern];
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const clean = segments
    .slice(0, MAX_SEGMENTS)
    .map((ms) => Math.round(Math.min(MAX_SEGMENT_MS, Math.max(0, Number(ms) || 0))));
  return clean.some((ms) => ms > 0) ? clean : null;
}

const isFramed = () => typeof window !== 'undefined' && window.parent && window.parent !== window;

function createHaptics() {
  // Set by the bridge: posts a message to the platform.
  let postToPlatform = null;

  const vibrate = (pattern = 'tap') => {
    const settings = platformSettings.get();
    const clean = normalizeHapticPattern(pattern);
    if (!clean || !settings.haptics) return false;

    // Browsers block vibrate() in cross-origin iframes, so a framed game asks
    // the platform to do it. Platforms too old to send settings don't
    // understand the request either; stay quiet for them.
    if (isFramed()) {
      if (!postToPlatform || !platformSettings.isFromPlatform()) return false;
      postToPlatform({ type: 'platform:haptic', payload: { pattern: clean } });
      return settings.canVibrate;
    }

    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    try {
      return navigator.vibrate(clean);
    } catch {
      return false;
    }
  };

  return {
    /** Vibrates this phone: 'tap', 'success', 'error', 'turn', 'warning', ms, or [on, off, ...]. */
    vibrate,
    /** "It's your turn." */
    yourTurn: () => vibrate('turn'),
    /** "Time is running out." */
    timeRunningOut: () => vibrate('warning'),
    /** Whether this device can vibrate and the player allows it. */
    isAvailable: () => {
      const settings = platformSettings.get();
      return settings.haptics && settings.canVibrate;
    },
    // The bridge connects this when it starts listening.
    connect(post) {
      postToPlatform = post;
      return () => {
        if (postToPlatform === post) postToPlatform = null;
      };
    },
  };
}

export const haptics = createHaptics();
