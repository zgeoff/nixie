import { onTestFinished } from 'bun:test';
import type { Server, ServerWebSocket } from 'bun';
import { createTestCertificate } from './create-test-certificate';

// One WebSocket that a client opened on the site.
export interface TestSocketConnection {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;

  // the text messages the client sent, in order
  readonly received: readonly string[];
  readonly send: (text: string) => void;
  readonly close: () => void;
}

export interface TestSiteSocket {
  // false answers the upgrade request as a failure; true when left out
  readonly shouldUpgrade?: (request: Request) => boolean;
  readonly onOpen?: (connection: TestSocketConnection) => void;
  readonly onMessage?: (connection: TestSocketConnection, text: string) => void;
}

export interface TestSiteOptions {
  readonly names: readonly string[];
  readonly scheme?: 'https' | 'http';

  // Upgrades each request that asks for a WebSocket. Without it the site answers an upgrade
  // request as any other request.
  readonly socket?: TestSiteSocket;

  readonly respond: (request: Request) => Response | Promise<Response>;
}

interface RecordedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

type TestSocketData = RecordedRequest;

export interface TestSite {
  readonly port: number;

  readonly ca: string;

  readonly requests: readonly RecordedRequest[];

  // each WebSocket a client opened, in order
  readonly connections: readonly TestSocketConnection[];
}

export async function startTestSite(options: TestSiteOptions): Promise<TestSite> {
  const certificate = await createTestCertificate(options.names);

  const requests: RecordedRequest[] = [];
  const connections: TestSocketConnection[] = [];

  const received = new WeakMap<object, string[]>();

  const answerRequest = (
    request: Request,
    upgrading: Server<TestSocketData>,
  ): Response | Promise<Response> | undefined => {
    // Bun reuses a Request after the handler runs, so the site copies each request first.
    const copy = { url: request.url, headers: Object.fromEntries(request.headers) };

    requests.push(copy);

    if (options.socket !== undefined && request.headers.get('upgrade') === 'websocket') {
      const shouldUpgrade = options.socket.shouldUpgrade?.(request) ?? true;

      return shouldUpgrade && upgrading.upgrade(request, { data: copy })
        ? undefined
        : new Response('not upgraded', { status: 400 });
    }

    return options.respond(request);
  };

  const toConnection = (socket: ServerWebSocket<TestSocketData>): TestSocketConnection => {
    const texts = received.get(socket) ?? [];

    received.set(socket, texts);

    return {
      url: socket.data.url,
      headers: socket.data.headers,
      received: texts,
      send: (text) => {
        socket.send(text);
      },
      close: () => {
        socket.close();
      },
    };
  };

  const open = new Map<ServerWebSocket<TestSocketData>, TestSocketConnection>();

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    ...(options.scheme === 'http' ? {} : { tls: { cert: certificate.cert, key: certificate.key } }),
    fetch: answerRequest,
    websocket: {
      open: (socket) => {
        const connection = toConnection(socket);

        open.set(socket, connection);
        connections.push(connection);
        options.socket?.onOpen?.(connection);
      },
      message: (socket, message) => {
        const connection = open.get(socket);

        if (connection !== undefined) {
          const text = String(message);

          received.get(socket)?.push(text);
          options.socket?.onMessage?.(connection, text);
        }
      },
      close: (socket) => {
        open.delete(socket);
      },
    },
  });

  onTestFinished(() => server.stop(true));

  return { port: server.port ?? 0, ca: certificate.cert, requests, connections };
}
