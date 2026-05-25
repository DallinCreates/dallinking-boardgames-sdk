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

/**
 * CHILD IFRAME BRIDGE
 * Sits inside the game. Filters out unnecessary server noise but passes
 * game payloads and crucial state syncs securely to the game engine.
 */
export function createIframeGameBridge({ onIncomingMessage, targetOrigin = '*' }) {
  const handleIncoming = (event) => {
    const msg = unwrapGameMessage(event.data);
    if (!msg || !msg.type) return;

    if (msg.type.startsWith('room:') && msg.type !== 'room:update' && msg.type !== 'room:reconnected') {
      return; 
    }

    onIncomingMessage(msg);
  };

  const startListening = () => {
    window.addEventListener('message', handleIncoming);
    
    if (window.parent && typeof window.parent.postMessage === 'function') {
      window.parent.postMessage(
        { source: SOCKET_MESSAGE_SOURCE, message: { type: 'system:ready', payload: {}, meta: {} } },
        targetOrigin
      );
    }
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

  return { send };
}

export default {
  createIframeGameBridge,
  BoardgameProvider,
  useBoardgame,
};