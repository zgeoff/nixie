import { nativeWebSocket } from './keep-native-web-socket';

// The imp client opens a reverse forward with a headers option that only Bun's own WebSocket takes,
// so this preload puts Bun's class back in place of happy-dom's.
Object.assign(globalThis, { WebSocket: nativeWebSocket });
