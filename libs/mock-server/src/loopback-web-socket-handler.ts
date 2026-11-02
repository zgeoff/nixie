import { ws } from 'msw';

// MSW intercepts every WebSocket and refuses one that no handler matches, so this handler lets a
// loopback connection through to its server, as the last request handler does for HTTP.
export const loopbackWebSocketHandler = ws
  .link(/^wss?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//u)
  .addEventListener('connection', (connection) => {
    connection.server.connect();
  });
