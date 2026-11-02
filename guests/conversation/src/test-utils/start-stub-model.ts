import { z } from 'zod';

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
  readonly isEndless?: boolean;
  readonly isOutputCapped?: boolean;
  readonly thinking?: {
    readonly summary: string;
    readonly signature: string;
    readonly thinkingTokens: number;
  };
};

type ScriptedReply =
  | ScriptedMessage
  | {
      readonly refusal: string;
    }
  | {
      readonly authFailure: string;
    }
  | {
      readonly notFound: string;
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

interface StubModelRequest {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: StubModelBody | null;
}

export interface StubModel {
  readonly url: string;
  readonly requests: readonly StubModelRequest[];

  readonly addReplies: (...replies: readonly ScriptedReply[]) => void;
  readonly setCharactersPerToken: (rate: number) => void;
  readonly stop: () => Promise<void>;
}

interface StubScript {
  readonly replies: ScriptedReply[];
  charactersPerToken: number | null;
}

export function startStubModel(): StubModel {
  const requests: StubModelRequest[] = [];
  const script: StubScript = { replies: [], charactersPerToken: null };

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
      script.replies.push(...replies);
    },
    setCharactersPerToken: (rate) => {
      script.charactersPerToken = rate;
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

function renderResponse(request: StubModelRequest, script: StubScript): Response {
  if (request.path === '/v1/messages/count_tokens') {
    return Response.json({ input_tokens: buildTokenCount(request, script.charactersPerToken) });
  }

  if (request.path !== '/v1/messages' || request.body === null) {
    return new Response('not found', { status: 404 });
  }

  const reply = script.replies.shift() ?? { refusal: 'the stub model has no reply left' };

  if ('refusal' in reply) {
    return renderRefusal(reply.refusal);
  }

  if ('authFailure' in reply) {
    return renderAuthFailure(reply.authFailure);
  }

  if ('notFound' in reply) {
    return renderNotFound(reply.notFound);
  }

  const model = request.body.model ?? 'stub';

  return request.body.stream === true ? renderStream(reply, model) : renderWhole(reply, model);
}

function buildTokenCount(request: StubModelRequest, charactersPerToken: number | null): number {
  if (charactersPerToken === null) {
    return 10;
  }

  return Math.ceil(JSON.stringify(request.body?.messages ?? []).length / charactersPerToken);
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

function renderNotFound(message: string): Response {
  return Response.json(
    { type: 'error', error: { type: 'not_found_error', message } },
    { status: 404 },
  );
}

function renderStream(reply: ScriptedMessage, model: string): Response {
  const block = buildBlock(reply);
  const isTool = 'toolUse' in reply;
  const thinkingEvents = buildThinkingStreamEvents(reply.thinking);
  const index = thinkingEvents.length === 0 ? 0 : 1;

  const opening = [
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
  ];

  const closing = [
    { type: 'content_block_stop', index },
    {
      type: 'message_delta',
      delta: { stop_reason: pickStopReason(reply), stop_sequence: null },

      usage: {
        output_tokens: 5,
        ...(reply.thinking === undefined
          ? {}
          : { output_tokens_details: { thinking_tokens: reply.thinking.thinkingTokens } }),
      },
    },
    { type: 'message_stop' },
  ];

  const headers = { 'content-type': 'text/event-stream' };

  if (reply.isEndless !== true) {
    return new Response(renderEvents([...opening, ...closing]), { headers });
  }

  return new Response(
    new ReadableStream({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode(renderEvents(opening)));
      },
    }),
    { headers },
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

function pickStopReason(reply: ScriptedMessage): string {
  if (reply.isOutputCapped === true) {
    return 'max_tokens';
  }

  return 'toolUse' in reply ? 'tool_use' : 'end_turn';
}

function renderEvents(events: readonly StreamEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
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
    stop_reason: pickStopReason(reply),
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
