import { 
  createContext, 
  useContext, 
  useEffect, 
  useMemo, 
  useCallback, 
  useRef 
} from 'react';

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

// ------------------------------------------------------------------
// REACT CONTEXT & PROVIDER
// ------------------------------------------------------------------

export const BoardgameContext = createContext(null);

export function BoardgameProvider({ children, targetOrigin = '*' }) {
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
 * 
 * @param {Object} options
 * @param {Function} [options.onMessage] - Callback to handle incoming messages
 */
export function useBoardgame({ onMessage } = {}) {
  const context = useContext(BoardgameContext);

  if (!context) {
    throw new Error('useBoardgame must be used within a <BoardgameProvider>');
  }

  const { send, subscribe } = context;

  useEffect(() => {
    if (typeof onMessage === 'function') {
      return subscribe(onMessage);
    }
  }, [onMessage, subscribe]);

  return { send };
}

export default {
  createIframeGameBridge,
  BoardgameProvider,
  useBoardgame,
};