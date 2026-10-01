import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useSyncExternalStore,
} from 'react';
import { audio } from './audio.js';
import { haptics, HAPTIC_PATTERNS, normalizeHapticPattern } from './haptics.js';
import { platformSettings, DEFAULT_PLATFORM_SETTINGS, effectiveVolume } from './settings.js';

export { audio, haptics, HAPTIC_PATTERNS, normalizeHapticPattern, platformSettings, DEFAULT_PLATFORM_SETTINGS, effectiveVolume };

export const SOCKET_MESSAGE_SOURCE = 'socket';

/** Engine-sent effects (sound, vibration) for one screen. See BaseGameEngine.sendEffect. */
export const GAME_FX_TYPE = 'game:fx';

export function unwrapGameMessage(data) {
  let parsedData = data;

  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  if (!parsedData || typeof parsedData !== 'object') {
    return null;
  }

  if (parsedData.source === SOCKET_MESSAGE_SOURCE && parsedData.message) {
    return parsedData.message;
  }

  return parsedData;
}

// Plays a game:fx payload on this screen. Haptics are for phones; the board
// only plays sounds.
function runGameEffect(payload, { isBoard }) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.only === 'players' && isBoard) return;
  if (payload.only === 'board' && !isBoard) return;

  if (typeof payload.sound === 'string' && payload.sound) {
    audio.playSfx(payload.sound, { volume: payload.volume });
  }
  if (payload.haptic != null && !isBoard) {
    haptics.vibrate(payload.haptic);
  }
}

/**
 * CHILD IFRAME BRIDGE
 * Sits inside the game. Filters out unnecessary server noise but passes
 * game payloads and crucial state syncs securely to the game engine.
 * Platform messages (settings) are handled here and never reach the game.
 */
export function createIframeGameBridge({ onIncomingMessage, targetOrigin = '*' }) {
  let isBoard = false;

  const handleIncoming = (event) => {
    const msg = unwrapGameMessage(event.data);
    if (!msg || !msg.type) return;

    if (msg.type.startsWith('platform:')) {
      if (event.source === window.parent && msg.type === 'platform:settings') {
        platformSettings.apply(msg.payload);
      }
      return;
    }

    if (msg.type.startsWith('room:') && msg.type !== 'room:update' && msg.type !== 'room:reconnected') {
      return;
    }

    if ((msg.type === 'room:update' || msg.type === 'room:reconnected') && msg.room) {
      isBoard = Boolean(msg.clientId) && msg.clientId === msg.room.boardId;
    }

    if (msg.type === GAME_FX_TYPE) {
      runGameEffect(msg.payload, { isBoard });
    }

    onIncomingMessage(msg);
  };

  const sendToParent = ({ type, payload = {}, meta = {} }) => {
    if (window.parent && typeof window.parent.postMessage === 'function') {
      window.parent.postMessage(
        { source: SOCKET_MESSAGE_SOURCE, message: { type, payload, meta } },
        targetOrigin
      );
    }
  };

  const startListening = () => {
    window.addEventListener('message', handleIncoming);
    const disconnectHaptics = haptics.connect(sendToParent);
    sendToParent({ type: 'system:ready' });

    return () => {
      window.removeEventListener('message', handleIncoming);
      disconnectHaptics();
    };
  };

  return {
    sendToParent,
    startListening,
  };
}

// ------------------------------------------------------------------
// REACT CONTEXT & PROVIDER
// ------------------------------------------------------------------

export const BoardgameContext = createContext(null);

/**
 * @param {Object} props
 * @param {Object<string, string>} [props.sounds] - Sound names to URLs, playable by name
 *   from audio.playSfx() and the engine's playSound().
 */
export function BoardgameProvider({ children, targetOrigin = '*', sounds }) {
  const listenersRef = useRef(new Set());

  const bridge = useMemo(() => {
    return createIframeGameBridge({
      targetOrigin,
      onIncomingMessage: (msg) => {
        listenersRef.current.forEach((listener) => listener(msg));
      },
    });
  }, [targetOrigin]);

  useEffect(() => {
    return bridge.startListening();
  }, [bridge]);

  useEffect(() => {
    if (sounds) audio.registerSounds(sounds);
  }, [sounds]);

  const send = useCallback(
    ({ type, payload = {}, meta = {} }) => {
      bridge.sendToParent({ type, payload, meta });
    },
    [bridge]
  );

  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const contextValue = useMemo(() => ({ send, subscribe }), [send, subscribe]);

  return (
    <BoardgameContext.Provider value={contextValue}>
      {children}
    </BoardgameContext.Provider>
  );
}

/**
 * React hook to access the game bridge.
 * Must be used inside a <BoardgameProvider>.
 * * @param {Object} options
 * @param {Function} [options.onMessage] - Callback to handle incoming messages
 */
export function useBoardgame({ onMessage } = {}) {
  const context = useContext(BoardgameContext);

  if (!context) {
    throw new Error('useBoardgame must be used within a <BoardgameProvider>');
  }

  const { send, subscribe } = context;
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const handleMessage = (msg) => {
      if (typeof onMessageRef.current === 'function') {
        onMessageRef.current(msg);
      }
    };

    return subscribe(handleMessage);
  }, [subscribe]);

  return { send, audio, haptics };
}

/** This device's sound and vibration settings, from the platform. Re-renders on change. */
export function usePlatformSettings() {
  return useSyncExternalStore(platformSettings.subscribe, platformSettings.get, platformSettings.get);
}

export default {
  createIframeGameBridge,
  BoardgameProvider,
  useBoardgame,
  usePlatformSettings,
  audio,
  haptics,
  platformSettings,
};
