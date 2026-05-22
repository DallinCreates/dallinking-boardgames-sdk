import { useEffect, useMemo, useCallback } from 'react';

export const SOCKET_MESSAGE_SOURCE = 'socket';

export function unwrapGameMessage(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (data.source === SOCKET_MESSAGE_SOURCE && data.message) {
    return data.message;
  }

  return data;
}

/**
 * CHILD IFRAME BRIDGE
 * Sits inside the game. Filters out server noise (room:*) and securely 
 * packages outbound data to send back to the parent.
 */
export function createIframeGameBridge({ onIncomingMessage, targetOrigin = '*' }) {
  const handleIncoming = (event) => {
    const msg = unwrapGameMessage(event.data);
    if (!msg || !msg.type) return;

    if (msg.type.startsWith('room:')) {
      return; 
    }

    onIncomingMessage(msg);
  };

  const startListening = () => {
    window.addEventListener('message', handleIncoming);
    return () => window.removeEventListener('message', handleIncoming);
  };

  // Expects exactly the shape of the object being sent
  const sendToParent = ({ type, payload = {}, meta = {} }) => {
    if (window.parent && typeof window.parent.postMessage === 'function') {
      window.parent.postMessage(
        { source: SOCKET_MESSAGE_SOURCE, message: { type, payload, meta } },
        targetOrigin
      );
    }
  };

  return {
    sendToParent,
    startListening,
  };
}

/**
 * React hook to easily wire up an iframe board game to the parent container.
 * 
 * @param {Object} options
 * @param {Function} options.onMessage - Callback to handle incoming messages (game:* and system:*)
 * @param {string} [options.targetOrigin='*'] 
 */
export function useBoardgame({ onMessage, targetOrigin = '*' } = {}) {
  const bridge = useMemo(
    () =>
      createIframeGameBridge({
        targetOrigin,
        onIncomingMessage: (msg) => {
          if (typeof onMessage === 'function') {
            onMessage(msg);
          }
        },
      }),
    [targetOrigin, onMessage]
  );

  useEffect(() => {
    return bridge.startListening();
  }, [bridge]);

  const send = useCallback(
    ({ type, payload = {}, meta = {} }) => {
      bridge.sendToParent({ type, payload, meta });
    },
    [bridge]
  );

  return { send };
}

export default {
  createIframeGameBridge,
  useBoardgame,
};