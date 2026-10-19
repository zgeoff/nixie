import { once } from 'node:events';
import type { Server as NetServer, Socket } from 'node:net';
import { createConnection, createServer } from 'node:net';
import type { McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';

export interface StubHTTPToolServer {
  readonly config: McpHttpServerConfig;

  // how many connections the route has reset so far
  readonly resets: () => number;

  // resets each connection that arrives from now on, as a route with no listener behind it does
  readonly dropConnections: () => void;

  // relays each connection that arrives from now on to the tool server, and resolves at once, so a
  // test passes it as the guest's pause before its reconnect
  readonly acceptConnections: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

interface RouteState {
  isDropping: boolean;
  resets: number;
  readonly sockets: Set<Socket>;
}

// Starts nixie's tool server as the guest reaches it in production: a Streamable HTTP MCP server
// named nixie, with one tool, note_read, behind a loopback route the guest connects to. The route
// relays each connection to the server, or resets it at once while the test drops connections.
export async function startStubHTTPToolServer(): Promise<StubHTTPToolServer> {
  const handler = createMcpHandler(buildNoteServer);

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => handler.fetch(request),
  });

  const state: RouteState = { isDropping: false, resets: 0, sockets: new Set() };

  const route = createServer((client) => {
    startRelay(client, server.port ?? 0, state);
  });

  route.listen(0, '127.0.0.1');

  await once(route, 'listening');

  return {
    config: { type: 'http', url: `http://127.0.0.1:${getPort(route)}/mcp`, alwaysLoad: true },
    resets: () => state.resets,
    dropConnections: () => {
      state.isDropping = true;
    },
    acceptConnections: () => {
      state.isDropping = false;

      return Promise.resolve();
    },
    stop: async () => {
      for (const socket of state.sockets) {
        socket.destroy();
      }

      route.close();

      await once(route, 'close');

      await handler.close();
      await server.stop(true);
    },
  };
}

// oxlint-disable-next-line typescript/no-deprecated -- the high-level McpServer needs a zod schema per tool, and the stub lists one plain schema as nixie's endpoint does
function buildNoteServer(): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'note_read',
        description: 'Reads a note by its name.',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      },
    ],
  }));

  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text', text: 'the note groceries' }],
  }));

  return server;
}

function startRelay(client: Socket, port: number, state: RouteState): void {
  if (state.isDropping) {
    state.resets += 1;

    client.destroy();

    return;
  }

  const upstream = createConnection({ host: '127.0.0.1', port });

  for (const socket of [client, upstream]) {
    state.sockets.add(socket);

    socket.once('close', () => {
      state.sockets.delete(socket);
    });

    socket.on('error', () => {
      client.destroy();
      upstream.destroy();
    });
  }

  client.pipe(upstream).pipe(client);
}

function getPort(route: NetServer): number {
  const address = route.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the stub tool route has no TCP address');
  }

  return address.port;
}
