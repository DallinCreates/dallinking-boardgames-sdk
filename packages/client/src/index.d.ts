export const SOCKET_MESSAGE_SOURCE: string;

export function unwrapGameMessage(data: unknown): any;

export function createIframeGameBridge(options: {
  onIncomingMessage: (message: any) => void;
  targetOrigin?: string;
}): {
  sendToParent: (message: { type: string; payload?: any; meta?: any }) => void;
  startListening: () => () => void;
};

export const BoardgameContext: any;

export function BoardgameProvider(props: {
  children: any;
  targetOrigin?: string;
}): any;

export function useBoardgame(options?: {
  onMessage?: (message: any) => void;
}): {
  send: (message: { type: string; payload?: any; meta?: any }) => void;
};

declare const _default: {
  createIframeGameBridge: typeof createIframeGameBridge;
  BoardgameProvider: typeof BoardgameProvider;
  useBoardgame: typeof useBoardgame;
};

export default _default;