import type { WatchConnection } from '@heynixie/connectors';
import { findSessionToken } from '../session/find-session-token';
import { readSessionIdentity } from '../session/read-session-identity';
import type { APIContext } from '../types';
import { watchRoutePath } from './build-watch-stream-url';
import { watchSessionEnd } from './watch-session-end';

export interface WatchSocketData {
  readonly identityID: string;
  connection: WatchConnection | null;
  stopWatching: (() => void) | null;
  isClosed: boolean;
}

export interface WatchRoute {
  readonly isWatchRequest: (request: Request) => boolean;

  // Spends the ticket and upgrades the request to a watch socket. It returns undefined once the
  // request is upgraded, as Bun's server asks, and a refusal with no body for any other outcome.
  readonly upgrade: (
    request: Request,
    server: Bun.Server<WatchSocketData>,
  ) => Promise<Response | undefined>;
  readonly websocket: Bun.WebSocketHandler<WatchSocketData>;
}

// The route of a watch socket. It sits beside the oRPC app, because a browser's WebSocket cannot send
// the client header, and each call proves itself with a one-use ticket and the session cookie.
export function createWatchRoute(context: APIContext): WatchRoute {
  return {
    isWatchRequest: (request) => new URL(request.url).pathname === watchRoutePath,
    upgrade: (request, server) => upgradeWatch(context, request, server),
    websocket: {
      maxPayloadLength: 1024 * 1024,
      open: (socket) => {
        void openWatch(context, socket);
      },
      message: (socket, message) => {
        if (typeof message === 'string') {
          socket.close(1003, 'binary messages only');

          return;
        }

        socket.data.connection?.receive(new Uint8Array(message));
      },
      close: (socket) => {
        closeWatch(socket.data);
      },
    },
  };
}

// The ticket goes first: it is spent whatever else is wrong with the request, so a failed attempt
// never leaves a ticket to try again. Only the session cookie counts, and its session must be the
// one the ticket was minted for, so a ticket carried anywhere else wakes nothing.
async function upgradeWatch(
  context: APIContext,
  request: Request,
  server: Bun.Server<WatchSocketData>,
): Promise<Response | undefined> {
  const watch = context.computerWatch;

  const ticket = new URL(request.url).searchParams.get('ticket');

  const ticketOwner = ticket === null || watch === undefined ? null : watch.tickets.redeem(ticket);

  if (watch === undefined || ticketOwner === null) {
    return buildRefusal();
  }

  const credential = findSessionToken(request.headers);

  const sessionID =
    credential.tokenSource === 'cookie'
      ? await readSessionIdentity(context, credential.sessionToken)
      : null;

  if (sessionID !== ticketOwner) {
    watch.logger('computer.watch_refused', { route: watchRoutePath, reason: 'session' });

    return buildRefusal();
  }

  const data: WatchSocketData = {
    identityID: sessionID,
    connection: null,
    stopWatching: null,
    isClosed: false,
  };

  return server.upgrade(request, { data }) ? undefined : new Response(null, { status: 400 });
}

function buildRefusal(): Response {
  return new Response(null, { status: 401 });
}

// The session watcher starts first, so a revocation during the wake ends the watch as well.
async function openWatch(
  context: APIContext,
  socket: Bun.ServerWebSocket<WatchSocketData>,
): Promise<void> {
  const openWatchOnComputer = context.computerWatch?.readWatch();

  if (openWatchOnComputer === null || openWatchOnComputer === undefined) {
    socket.close(1011, 'no computer');

    return;
  }

  const stopWatching = await watchSessionEnd(context, socket.data.identityID, () => {
    closeWatch(socket.data);

    socket.close(1008, 'session ended');
  });

  if (socket.data.isClosed) {
    stopWatching();

    return;
  }

  socket.data.stopWatching = stopWatching;

  socket.data.connection = openWatchOnComputer({
    send: (bytes) => {
      socket.sendBinary(bytes);
    },
    close: () => {
      socket.close(1000, 'the desktop stream ended');
    },
  });
}

function closeWatch(data: WatchSocketData): void {
  data.isClosed = true;
  data.stopWatching?.();
  data.connection?.end();
}
