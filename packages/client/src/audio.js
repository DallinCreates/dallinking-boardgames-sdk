import { platformSettings, effectiveVolume } from './settings.js';

// The game's sound, mixed through the platform's per-device settings:
//
//   sound effect ─┐
//   sound effect ─┼─ sfx gain ───┐
//                 │              ├─ master gain (mute) ─ speakers
//   music track ──┴─ music gain ─┘
//
// Web Audio when the browser has it. Sounds are fetched and decoded (the CDN
// serves releases with CORS, which an opaque-origin iframe needs). If that
// fails, a plain <audio> element plays the file at the computed volume.

const hasWindow = typeof window !== 'undefined';
const AudioContextClass = hasWindow ? window.AudioContext || window.webkitAudioContext : null;

const clamp01 = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

function createAudio() {
  const registered = new Map(); // name -> url
  const buffers = new Map(); // absolute url -> Promise<AudioBuffer | null>
  let context = null;
  let master = null;
  let channels = null; // { music, sfx } gain nodes
  let music = null; // the current track

  const resolveUrl = (sound) => {
    const src = registered.get(sound) || sound;
    if (!hasWindow) return src;
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return src;
    }
  };

  function getContext() {
    if (context || !AudioContextClass) return context;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      master.connect(context.destination);
      channels = { music: context.createGain(), sfx: context.createGain() };
      channels.music.connect(master);
      channels.sfx.connect(master);
      applySettings();
    } catch {
      context = null;
    }
    return context;
  }

  function setGain(node, value) {
    // A short ramp instead of a jump, so slider moves don't click.
    node.gain.setTargetAtTime(value, context.currentTime, 0.015);
  }

  // Tracks that couldn't be routed through Web Audio set their own volume.
  // (iOS ignores element.volume but honors element.muted.)
  function applyElementVolume(track) {
    const settings = platformSettings.get();
    track.element.volume = clamp01(track.volume * effectiveVolume(settings, 'music'), 0);
    track.element.muted = settings.muted;
  }

  function applySettings() {
    const settings = platformSettings.get();
    if (context) {
      setGain(master, settings.muted ? 0 : settings.masterVolume);
      setGain(channels.music, settings.musicVolume);
      setGain(channels.sfx, settings.sfxVolume);
    }
    if (music && !music.gain) applyElementVolume(music);
  }

  platformSettings.subscribe(applySettings);

  function loadBuffer(url) {
    if (!buffers.has(url)) {
      const ctx = getContext();
      const pending = !ctx
        ? Promise.resolve(null)
        : fetch(url)
          .then((response) => {
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return response.arrayBuffer();
          })
          // The callback form: older Safari has no promise-returning decodeAudioData.
          .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
          .catch((error) => {
            console.warn(`[boardgame-client] Couldn't load sound ${url}; using a plain <audio> element.`, error);
            return null;
          });
      buffers.set(url, pending);
    }
    return buffers.get(url);
  }

  // Browsers keep audio suspended until the user interacts with the page.
  function unlock() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
    if (music && music.wantsToPlay && music.element.paused) music.element.play().catch(() => {});
  }

  if (hasWindow) {
    ['pointerdown', 'keydown', 'touchend'].forEach((type) => {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    });
  }

  async function playSfx(sound, { volume = 1, rate = 1 } = {}) {
    if (!sound) return;
    const settings = platformSettings.get();
    if (effectiveVolume(settings, 'sfx') === 0) return;

    const url = resolveUrl(sound);
    getContext();
    unlock();
    const buffer = await loadBuffer(url);

    if (buffer && context) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Number(rate) > 0 ? Number(rate) : 1;
      const gain = context.createGain();
      gain.gain.value = clamp01(volume);
      source.connect(gain);
      gain.connect(channels.sfx);
      source.start();
      return;
    }

    const element = new Audio(url);
    element.volume = clamp01(clamp01(volume) * effectiveVolume(platformSettings.get(), 'sfx'), 0);
    element.play().catch(() => {});
  }

  function startTrack(url, { loop, volume, fadeMs, routed }) {
    const element = new Audio();
    element.loop = loop;
    element.preload = 'auto';
    const track = { url, element, volume, gain: null, wantsToPlay: true };

    const ctx = routed ? getContext() : null;
    if (ctx) {
      element.crossOrigin = 'anonymous';
      try {
        const source = ctx.createMediaElementSource(element);
        track.gain = ctx.createGain();
        track.gain.gain.value = 0;
        source.connect(track.gain);
        track.gain.connect(channels.music);
        track.gain.gain.setTargetAtTime(volume, ctx.currentTime, Math.max(0.01, fadeMs / 3000));
      } catch {
        track.gain = null;
      }
    }

    if (track.gain) {
      // Without CORS the file won't load in crossOrigin mode; retry it as a
      // plain element.
      element.addEventListener('error', () => {
        if (music !== track) return;
        element.removeAttribute('src');
        music = startTrack(url, { loop, volume, fadeMs, routed: false });
      }, { once: true });
    } else {
      applyElementVolume(track);
    }

    element.src = url;
    element.play().catch(() => {
      // Autoplay blocked: unlock() starts it on the first tap.
    });
    return track;
  }

  function playMusic(src, { loop = true, volume = 1, fadeMs = 400 } = {}) {
    if (!src) return;
    const url = resolveUrl(src);
    const level = clamp01(volume);

    if (music && music.url === url) {
      music.volume = level;
      music.wantsToPlay = true;
      if (music.gain) setGain(music.gain, level);
      else applyElementVolume(music);
      if (music.element.paused) music.element.play().catch(() => {});
      return;
    }

    stopMusic({ fadeMs });
    music = startTrack(url, { loop, volume: level, fadeMs, routed: true });
  }

  function stopMusic({ fadeMs = 400 } = {}) {
    const track = music;
    if (!track) return;
    music = null;
    track.wantsToPlay = false;

    if (track.gain && context && fadeMs > 0) {
      track.gain.gain.setTargetAtTime(0, context.currentTime, fadeMs / 3000);
      setTimeout(() => track.element.pause(), fadeMs);
      return;
    }
    track.element.pause();
  }

  return {
    /** Name your sounds once, then play them by name: { buzz: './sounds/buzz.mp3' }. */
    registerSounds(sounds) {
      Object.entries(sounds || {}).forEach(([name, url]) => {
        if (typeof url === 'string' && url) registered.set(name, url);
      });
    },
    /** Fetches and decodes sounds ahead of time, so the first play has no delay. */
    preload(sounds) {
      const list = sounds == null ? [...registered.keys()] : [].concat(sounds);
      return Promise.all(list.map((sound) => loadBuffer(resolveUrl(sound)))).then(() => undefined);
    },
    /** Plays a one-shot sound effect on this screen only, at the player's sound-effects volume. */
    playSfx,
    /** Starts a looping background track at the player's music volume. Replaces the current one. */
    playMusic,
    stopMusic,
    /** The track playing now, or null. */
    currentMusic: () => (music ? music.url : null),
    /** Resumes audio after a user gesture. Called automatically on taps and key presses. */
    unlock,
  };
}

export const audio = createAudio();
