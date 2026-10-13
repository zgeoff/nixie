// One reply the stub model gives: a text block that ends the turn, or a tool_use block that asks
// for a tool by its name as the model sees it, such as mcp__nixie__note_read. The usage defaults to
// 10 input tokens and no cache tokens, and a test sets more to fill the context the CLI counts.
type ScriptedReply = (
  | { readonly text: string }
  | {
      readonly toolUse: {
        readonly name: string;
        readonly input: Readonly<Record<string, unknown>>;
      };
    }
) & {
  readonly inputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
};

// One request the stub model received, with its body parsed.
interface StubModelRequest {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: StubModelBody | null;
}

interface StubModelBody {
  readonly model?: string;
  readonly stream?: boolean;
  readonly messages?: readonly { readonly role: string; readonly content: unknown }[];
  readonly tools?: readonly { readonly name: string }[];
  readonly system?: unknown;
}

export interface StubModel {
  readonly url: string;
  readonly requests: readonly StubModelRequest[];

  // appends replies to the script, which the stub answers in order, one per request
  readonly addReplies: (...replies: readonly ScriptedReply[]) => void;
  readonly stop: () => Promise<void>;
}

// Starts a local stand-in for the Messages API that answers each /v1/messages request with the next
// scripted reply, and records every request. A request past the script's end gets a 400 the CLI
// does not retry, so a test that scripts too few replies fails rather than hangs.
export function startStubModel(): StubModel {
  const requests: StubModelRequest[] = [];
  const script: ScriptedReply[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      const recorded = await readRequest(request);

      requests.push(recorded);
      return renderResponse(recorded, script);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    addReplies: (...replies) => {
      script.push(...replies);
    },
    stop: async () => {
      await server.stop(true);
    },
  };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
async function readRequest(request: Request): Promise<StubModelRequest> {
  const text = request.method === 'POST' ? await request.text() : '';

  return {
    path: new URL(request.url).pathname,
    headers: Object.fromEntries(request.headers),

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the CLI's own request body
    body: text === '' ? null : (JSON.parse(text) as StubModelBody),
  };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the stub's own script
function renderResponse(request: StubModelRequest, script: ScriptedReply[]): Response {
  if (request.path === '/v1/messages/count_tokens') {
    return Response.json({ input_tokens: 10 });
  }
  if (request.path !== '/v1/messages' || request.body === null) {
    return new Response('not found', { status: 404 });
  }
  const reply = script.shift();

  if (reply === undefined) {
    return Response.json(
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'the stub model has no reply left' },
      },
      { status: 400 },
    );
  }
  const model = request.body.model ?? 'stub';

  return request.body.stream === true ? renderStream(reply, model) : renderWhole(reply, model);
}

function renderWhole(reply: ScriptedReply, model: string): Response {
  const block = buildBlock(reply);

  return Response.json({
    id: `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [block],
    stop_reason: 'toolUse' in reply ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: buildUsage(reply, 5),
  });
}

function buildUsage(reply: ScriptedReply, outputTokens: number): Record<string, number> {
  return {
    input_tokens: reply.inputTokens ?? 10,
    ...(reply.cacheReadTokens === undefined
      ? {}
      : { cache_read_input_tokens: reply.cacheReadTokens }),
    ...(reply.cacheWriteTokens === undefined
      ? {}
      : { cache_creation_input_tokens: reply.cacheWriteTokens }),
    output_tokens: outputTokens,
  };
}

function renderStream(reply: ScriptedReply, model: string): Response {
  const block = buildBlock(reply);
  const isTool = 'toolUse' in reply;
  const events = [
    {
      type: 'message_start',
      message: {
        id: `msg_${crypto.randomUUID()}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: buildUsage(reply, 1),
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: isTool ? { ...block, input: {} } : { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: isTool
        ? { type: 'input_json_delta', partial_json: JSON.stringify(reply.toolUse.input) }
        : { type: 'text_delta', text: reply.text },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: isTool ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ];

  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

function buildBlock(reply: ScriptedReply): Readonly<Record<string, unknown>> {
  if ('toolUse' in reply) {
    return {
      type: 'tool_use',
      id: `toolu_${crypto.randomUUID().replaceAll('-', '')}`,
      name: reply.toolUse.name,
      input: reply.toolUse.input,
    };
  }
  return { type: 'text', text: reply.text };
}
