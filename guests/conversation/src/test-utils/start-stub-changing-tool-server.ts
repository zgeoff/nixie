import type { McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { Server, createMcpHandler, isJSONRPCRequest } from '@modelcontextprotocol/server';

// The form of a tool that the model sees: its description and its input schema.
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

  // the JSON-RPC method of each request the server received, in order
  readonly methods: readonly string[];

  // each tool call the server received, in order
  readonly calls: readonly StubToolCall[];

  // lists note_read in this form on every tools/list from now on
  readonly changeTool: (form: StubToolForm) => void;

  // sends notifications/tools/list_changed on each open listen stream that asked for it, and
  // resolves once the client lists the tools again
  readonly notifyToolsChanged: () => Promise<void>;

  // resolves once the model calls note_wait, which then holds until release
  readonly waitForHeldCall: () => Promise<void>;
  readonly release: () => void;
  readonly stop: () => Promise<void>;
}

interface ServerState {
  form: StubToolForm;

  // the wait of the last notice, until the client lists the tools after it
  relisted: PromiseWithResolvers<void> | null;
}

// Starts a Streamable HTTP MCP server named nixie, built per request as nixie's run endpoint is, and
// declaring listChanged as that endpoint does. It lists note_read in the form the test last set,
// and note_wait, which holds its call open so a test can change note_read in the middle of a turn.
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

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // a listen stream stays open for the whole turn, past Bun's 10 s default
    idleTimeout: 0,
    fetch: async (request) => {
      const received = await readMethods(request);

      methods.push(...received);

      const response = await handler.fetch(request);

      const relisted = received.includes('tools/list') ? state.relisted : null;

      if (relisted === null || response.body === null) {
        return response;
      }

      state.relisted = null;

      // the client has the new list once it has read the whole answer
      const body = response.body.pipeThrough(
        new TransformStream({
          flush: () => {
            relisted.resolve();
          },
        }),
      );

      return new Response(body, { status: response.status, headers: response.headers });
    },
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

// the method of each JSON-RPC request in a POST body, which may hold one message or a batch
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
