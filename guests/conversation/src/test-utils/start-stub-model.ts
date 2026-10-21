import { z } from 'zod';

// The usage defaults to 10 input tokens and no cache tokens, and a test sets more to fill the
// context the CLI counts. A reply with thinking carries a summarized thinking block, with its
// signature, before its text or tool_use block, and reports its thinking tokens in the usage.
type ScriptedMessage = (
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
  readonly thinking?: {
    readonly summary: string;
    readonly signature: string;
    readonly thinkingTokens: number;
  };
};

// One reply the stub model gives: a text block, a tool_use block by the name the model sees, such
// as mcp__nixie__note_read, a 400 with the API's refusal message, or a 401 for a refused credential
// that the CLI does not retry.
type ScriptedReply =
  | ScriptedMessage
  | {
      readonly refusal: string;
    }
  | {
      readonly authFailure: string;
    };

const stubMessageSchema = z.looseObject({ role: z.string(), content: z.unknown() });

const stubToolSchema = z.looseObject({
  name: z.string(),
  description: z.string().exactOptional(),
  input_schema: z.unknown().exactOptional(),
});

const stubModelBodySchema = z.looseObject({
  model: z.string().exactOptional(),
  stream: z.boolean().exactOptional(),
  messages: stubMessageSchema.array().exactOptional(),
  tools: stubToolSchema.array().exactOptional(),
  system: z.unknown().exactOptional(),
});

type StubModelBody = z.infer<typeof stubModelBodySchema>;

// One request the stub model received, with its body parsed.
interface StubModelRequest {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: StubModelBody | null;
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

  const answerRequest = async (request: Request) => {
    const recorded = await readRequest(request);

    requests.push(recorded);

    return renderResponse(recorded, script);
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
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

async function readRequest(request: Request): Promise<StubModelRequest> {
  const text = request.method === 'POST' ? await request.text() : '';

  return {
    path: new URL(request.url).pathname,
    headers: Object.fromEntries(request.headers),
    body: text === '' ? null : stubModelBodySchema.parse(JSON.parse(text)),
  };
}

function renderResponse(request: StubModelRequest, script: ScriptedReply[]): Response {
  if (request.path === '/v1/messages/count_tokens') {
    return Response.json({ input_tokens: 10 });
  }

  if (request.path !== '/v1/messages' || request.body === null) {
    return new Response('not found', { status: 404 });
  }

  const reply = script.shift() ?? { refusal: 'the stub model has no reply left' };

  if ('refusal' in reply) {
    return renderRefusal(reply.refusal);
  }

  if ('authFailure' in reply) {
    return renderAuthFailure(reply.authFailure);
  }

  const model = request.body.model ?? 'stub';

  return request.body.stream === true ? renderStream(reply, model) : renderWhole(reply, model);
}

function renderRefusal(message: string): Response {
  return Response.json(
    { type: 'error', error: { type: 'invalid_request_error', message } },
    { status: 400 },
  );
}

function renderAuthFailure(message: string): Response {
  return Response.json(
    { type: 'error', error: { type: 'authentication_error', message } },
    { status: 401, headers: { 'x-should-retry': 'false' } },
  );
}

function renderStream(reply: ScriptedMessage, model: string): Response {
  const block = buildBlock(reply);
  const isTool = 'toolUse' in reply;
  const thinkingEvents = buildThinkingStreamEvents(reply.thinking);
  const index = thinkingEvents.length === 0 ? 0 : 1;

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
    ...thinkingEvents,
    {
      type: 'content_block_start',
      index,
      content_block: isTool ? { ...block, input: {} } : { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index,
      delta: isTool
        ? { type: 'input_json_delta', partial_json: JSON.stringify(reply.toolUse.input) }
        : { type: 'text_delta', text: reply.text },
    },
    { type: 'content_block_stop', index },
    {
      type: 'message_delta',
      delta: { stop_reason: isTool ? 'tool_use' : 'end_turn', stop_sequence: null },

      // a message_delta reports output tokens alone; the input and cache counts came in message_start
      usage: {
        output_tokens: 5,
        ...(reply.thinking === undefined
          ? {}
          : { output_tokens_details: { thinking_tokens: reply.thinking.thinkingTokens } }),
      },
    },
    { type: 'message_stop' },
  ];

  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

function buildBlock(reply: ScriptedMessage): Readonly<Record<string, unknown>> {
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

interface StreamEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

function buildThinkingStreamEvents(thinking: ScriptedMessage['thinking']): readonly StreamEvent[] {
  if (thinking === undefined) {
    return [];
  }

  return [
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: thinking.summary },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'signature_delta', signature: thinking.signature },
    },
    { type: 'content_block_stop', index: 0 },
  ];
}

function buildUsage(reply: ScriptedMessage, outputTokens: number): Record<string, number> {
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

function renderWhole(reply: ScriptedMessage, model: string): Response {
  const block = buildBlock(reply);
  const thinking = reply.thinking;

  return Response.json({
    id: `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: thinking === undefined ? [block] : [buildThinkingBlock(thinking), block],
    stop_reason: 'toolUse' in reply ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      ...buildUsage(reply, 5),
      ...(thinking === undefined
        ? {}
        : { output_tokens_details: { thinking_tokens: thinking.thinkingTokens } }),
    },
  });
}

type ScriptedThinking = NonNullable<ScriptedMessage['thinking']>;

function buildThinkingBlock(thinking: ScriptedThinking): Readonly<Record<string, unknown>> {
  return { type: 'thinking', thinking: thinking.summary, signature: thinking.signature };
}
