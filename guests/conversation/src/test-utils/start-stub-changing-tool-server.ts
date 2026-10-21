import type { McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { Server, createMcpHandler, isJSONRPCRequest } from '@modelcontextprotocol/server';

export interface StubToolForm {
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface StubToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface StubChangingToolServer {
  readonly config: McpHttpServerConfig;

  readonly methods: readonly string[];

  readonly calls: readonly StubToolCall[];

  readonly changeTool: (form: StubToolForm) => void;

  readonly notifyToolsChanged: () => Promise<void>;

  readonly waitForHeldCall: () => Promise<void>;
  readonly release: () => void;
  readonly stop: () => Promise<void>;
}

interface ServerState {
  form: StubToolForm;

  relisted: PromiseWithResolvers<void> | null;
}

export function startStubChangingToolServer(form: StubToolForm): StubChangingToolServer {
  const state: ServerState = { form, relisted: null };
  const methods: string[] = [];
  const calls: StubToolCall[] = [];
  const held = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();

  const handler = createMcpHandler(() =>
    createChangingServer(() => state.form, {
      onCall: (call) => {
        calls.push(call);
      },
      onHold: () => {
        held.resolve();

        return released.promise;
      },
    }),
  );

  const answerRequest = async (request: Request) => {
    const received = await readMethods(request);

    methods.push(...received);

    const response = await handler.fetch(request);

    const relisted = received.includes('tools/list') ? state.relisted : null;

    if (relisted === null || response.body === null) {
      return response;
    }

    state.relisted = null;

    const body = response.body.pipeThrough(
      new TransformStream({
        flush: () => {
          relisted.resolve();
        },
      }),
    );

    return new Response(body, { status: response.status, headers: response.headers });
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // A listen stream stays open for the whole turn, past Bun's default idle timeout of 10 s.
    idleTimeout: 0,
    fetch: answerRequest,
  });

  return {
    config: { type: 'http', url: `http://127.0.0.1:${server.port}/mcp`, alwaysLoad: true },
    methods,
    calls,
    changeTool: (next) => {
      state.form = next;
    },
    notifyToolsChanged: () => {
      const relisted = Promise.withResolvers<void>();

      state.relisted = relisted;

      handler.notify.toolsChanged();

      return relisted.promise;
    },
    waitForHeldCall: () => held.promise,
    release: () => {
      released.resolve();
    },
    stop: async () => {
      released.resolve();

      await handler.close();
      await server.stop(true);
    },
  };
}

interface CallHooks {
  readonly onCall: (call: StubToolCall) => void;
  readonly onHold: () => Promise<void>;
}

// oxlint-disable-next-line typescript/no-deprecated -- the high-level McpServer needs a zod schema per tool, and the stub lists one plain schema as nixie's endpoint does
function createChangingServer(readForm: () => StubToolForm, hooks: CallHooks): Server {
  // oxlint-disable-next-line typescript/no-deprecated -- as above
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler('tools/list', () => {
    const current = readForm();

    return {
      tools: [
        {
          name: 'note_read',
          description: current.description,
          inputSchema: { ...current.inputSchema, type: 'object' as const },
        },
        {
          name: 'note_wait',
          description: 'Waits for a note to change.',
          inputSchema: { type: 'object' as const, properties: {} },
        },
      ],
    };
  });

  server.setRequestHandler('tools/call', async (request) => {
    hooks.onCall({ name: request.params.name, arguments: request.params.arguments ?? {} });

    if (request.params.name === 'note_wait') {
      await hooks.onHold();

      return { content: [{ type: 'text' as const, text: 'the note changed' }] };
    }

    return { content: [{ type: 'text' as const, text: 'the note groceries' }] };
  });

  return server;
}

async function readMethods(request: Request): Promise<string[]> {
  if (request.method !== 'POST') {
    return [];
  }

  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);

  const messages: unknown[] = Array.isArray(body) ? body : [body];

  return messages.flatMap((message) => (isJSONRPCRequest(message) ? [message.method] : []));
}
