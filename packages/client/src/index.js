import { useState, useEffect, useMemo, useCallback } from 'react';

const SOCKET_MESSAGE_SOURCE = 'socket';

function unwrapGameMessage(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (data.source === SOCKET_MESSAGE_SOURCE && data.message) {
    return data.message;
  }

  return data;
}

function normalizeOutboundGameMessage(data) {
  const payload = unwrapGameMessage(data);

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.type === 'string' && payload.type.startsWith('game:')) {
    return {
      type: payload.type,
      payload: payload.payload || {},
      meta: payload.meta || {},
    };
  }

  if (typeof payload.action === 'string') {
    return {
      type: 'game:action',
      payload: { action: payload.action, ...(payload.payload || {}) },
      meta: payload.meta || {},
    };
  }

  return null;
}

/**
 * Creates a bridge in the iframe to communicate with the parent container.
 */
export function createIframeGameBridge({ onIncomingMessage, targetOrigin = '*' }) {
  const handleIncoming = (event) => {
    const data = unwrapGameMessage(event.data);
    if (!data) {
      return;
    }

    onIncomingMessage(data);
  };

  const startListening = () => {
    window.addEventListener('message', handleIncoming);
    return () => window.removeEventListener('message', handleIncoming);
  };

  const sendToParent = (message) => {
    if (window.parent && typeof window.parent.postMessage === 'function') {
      window.parent.postMessage({ source: SOCKET_MESSAGE_SOURCE, message }, targetOrigin);
    }
  };

  const sendActionToParent = (payload, meta = {}) => {
    sendToParent({ type: 'game:action', payload, meta });
  };

  return {
    sendToParent,
    sendActionToParent,
    startListening,
  };
}

/**
 * React hook to easily wire up an iframe board game to the parent container.
 * 
 * @param {Object} options - Options
 * @param {Object} [options.initialState={}] - The initial fallback game state.
 * @param {string} [options.targetOrigin='*'] - The allowed postMessage origin.
 * @returns {Object} { state, roomPlayers, boardId, clientId, statusMessage, sendAction, send }
 */
export function useBoardgame({ initialState = {}, targetOrigin = '*' } = {}) {
  const [state, setState] = useState(initialState);
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Initializing game bridge...');

  const bridge = useMemo(
    () =>
      createIframeGameBridge({
        targetOrigin,
        onIncomingMessage: (msg) => {
          // Handle full game state snapshots from the engine
          if (msg.type === 'game:state') {
            setState(msg.state || {});
            setStatusMessage('Sync complete.');
          }

          // Handle incremental updates
          if (msg.type === 'game:update') {
            setState((prev) => ({ ...prev, ...msg }));
            setStatusMessage('State updated.');
          }

          // Handle room level details
          if (msg.type === 'room:update') {
            setRoomPlayers(msg.room?.players || []);
            setBoardId(msg.room?.boardId || null);
          }

          if (msg.type === 'room:game-started') {
            setStatusMessage('Game started!');
          }

          if (msg.type === 'room:closed') {
            setStatusMessage('Host ended the game.');
          }
          
          if (msg.type === 'connection:ready') {
            setClientId(msg.clientId);
          }
        },
      }),
    [targetOrigin]
  );

  useEffect(() => {
    return bridge.startListening();
  }, [bridge]);

  const send = useCallback(
    (message) => {
      bridge.sendToParent(message);
    },
    [bridge]
  );

  const sendAction = useCallback(
    (action, payload = {}, meta = {}) => {
      bridge.sendActionToParent({ action, ...payload }, meta);
    },
    [bridge]
  );

  return {
    state,
    roomPlayers,
    boardId,
    clientId,
    statusMessage,
    sendAction,
    send,
  };
}

export default {
  createIframeGameBridge,
  useBoardgame,
};
