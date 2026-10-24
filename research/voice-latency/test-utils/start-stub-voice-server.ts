import type { OpenSocket } from '../open-vendor-socket.ts';

// A local WebSocket server that stands in for a voice vendor: it records each client message and
// the authorization header, and answers the client's first message with the scripted events.
export function startStubVoiceServer(script: Record<string, unknown>[]): {
  authorizations: string[];
  openSocket: OpenSocket;
  received: unknown[];
  stop: () => void;
} {
  const authorizations: string[] = [];
  const received: unknown[] = [];
  const server = Bun.serve({
    fetch: (request, upgrading) => {
      authorizations.push(request.headers.get('authorization') ?? '');
      return upgrading.upgrade(request) ? undefined : new Response('expected a WebSocket upgrade', { status: 426 });
    },
    port: 0,
    websocket: {
      message: (socket, message) => {
        received.push(JSON.parse(String(message)));
        if (received.length === 1) {
          for (const event of script) {
            socket.send(JSON.stringify(event));
          }
        }
      },
    },
  });
  return {
    authorizations,
    // The vendor URL is ignored: every client socket opens the local server.
    openSocket: (_url, headers) => new WebSocket(`ws://localhost:${server.port}`, { headers }),
    received,
    stop: () => {
      void server.stop(true);
    },
  };
}
