// The happy-dom preload replaces WebSocket with one that takes no headers option, and nothing else
// reaches Bun's own class afterwards, so this preload, listed before it, keeps a reference.
export const nativeWebSocket = globalThis.WebSocket;
