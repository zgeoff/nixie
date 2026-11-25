import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type {
  FakeATCCall,
  FakeATCEvent,
  FakeATCFailure,
  FakeATCSession,
  FakeATCState,
} from './fake-atc-state';
import { runFakeATCTool } from './run-fake-atc-tool';

export interface FakeATCGatewayOptions {
  // the gateway's MCP server version
  readonly version?: string;
  readonly token?: string;
  readonly now?: () => number;
}

export interface FakeATCGateway {
  // the MCP endpoint
  readonly url: string;
  readonly token: string;
  readonly calls: readonly FakeATCCall[];
  readonly sessions: Map<string, FakeATCSession>;

  // adds a session that runs outside nixie, such as one the user started on a configured target
  readonly addSession: (seed: Partial<FakeATCSession> & { readonly id: string }) => FakeATCSession;

  // appends events to the trail
  readonly emit: (...events: readonly FakeATCEvent[]) => void;

  // the next call of the tool answers this failure, once
  readonly failNext: (tool: string, failure: FakeATCFailure) => void;
  readonly stop: () => Promise<void>;
}

// A fake atc-gateway: a real MCP server on a loopback port, with the tools the atc adapter calls,
// over in-memory sessions and an event trail. It reports its version as the real gateway does.
export function startFakeATCGateway(options: FakeATCGatewayOptions = {}): FakeATCGateway {
  const token = options.token ?? 'atcs_test_token';
  const version = options.version ?? 'atc-gateway/7.12.3';

  const state: FakeATCState = {
    sessions: new Map(),
    trail: [],
    calls: [],
    answersByKey: new Map(),
    failures: new Map(),
    messages: new Map(),
    nextID: 0,
    now: options.now ?? Date.now,
  };

  const handler = createMcpHandler(() => createServer(state, version));
  const answerRequest = makeRequestAnswerer(state, token, handler);

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    idleTimeout: 0,
    fetch: answerRequest,
  });

  return {
    url: `http://127.0.0.1:${String(server.port)}/mcp`,
    token,
    calls: state.calls,
    sessions: state.sessions,
    addSession: (seed) => {
      const session: FakeATCSession = {
        name: seed.id,
        cwd: `/work/${seed.id}`,
        daemon: 'cloud',
        targetID: 'cloud',
        state: 'running',
        harness: 'running',
        createdAt: state.now(),
        prompt: null,
        pending: null,
        result: null,
        hasTranscript: true,
        rows: [],
        ...seed,
      };

      state.sessions.set(session.id, session);

      return session;
    },
    emit: (...events) => {
      state.trail.push(...events);
    },
    failNext: (tool, failure) => {
      state.failures.set(tool, [...(state.failures.get(tool) ?? []), failure]);
    },
    stop: async () => {
      await handler.close();
      await server.stop(true);
    },
  };
}

const toolNames = [
  'atc_events_read',
  'atc_session_spawn',
  'atc_sessions_list',
  'atc_session_get',
  'atc_transcript_read',
  'atc_terminal_type',
  'atc_message_send',
  'atc_session_stop',
];

// oxlint-disable-next-line typescript/no-deprecated -- the same low-level server the tool endpoint uses
function createServer(state: FakeATCState, version: string): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'atc', version },
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler('tools/list', () => ({
    tools: toolNames.map((name) => ({ name, inputSchema: { type: 'object' as const } })),
  }));

  server.setRequestHandler('tools/call', async (request) => {
    const result = await runFakeATCTool(state, request.params.name, request.params.arguments ?? {});

    return 'code' in result
      ? {
          isError: true,
          content: [{ type: 'text' as const, text: result.code }],
          structuredContent: { code: result.code },
        }
      : {
          content: [{ type: 'text' as const, text: JSON.stringify(result.data) }],
          structuredContent: { ...result.data },
        };
  });

  return server;
}

function makeRequestAnswerer(
  state: FakeATCState,
  token: string,
  handler: ReturnType<typeof createMcpHandler>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.headers.get('authorization') !== `Bearer ${token}`) {
      return new Response('unauthorized', { status: 401 });
    }

    const status = await readHTTPFailure(state, request);

    return status === null ? handler.fetch(request) : new Response('failed', { status });
  };
}

const callBodySchema = z.object({ params: z.object({ name: z.string() }) });

// The HTTP status that an armed failure answers in place of the tool call this request carries.
async function readHTTPFailure(state: FakeATCState, request: Request): Promise<number | null> {
  if (request.method !== 'POST') {
    return null;
  }

  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);

  const parsed = callBodySchema.safeParse(body);
  const failures = parsed.success ? state.failures.get(parsed.data.params.name) : undefined;

  if (failures?.[0]?.kind !== 'http') {
    return null;
  }

  const failure = failures.shift();

  return failure?.kind === 'http' ? failure.status : null;
}
