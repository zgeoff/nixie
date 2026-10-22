import { z } from 'zod';

export interface ScriptedUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation?: {
    readonly ephemeral_5m_input_tokens: number;
    readonly ephemeral_1h_input_tokens: number;
  };
}

type ScriptedMessage = (
  | { readonly text: string }
  | {
      readonly toolUse: {
        readonly name: string;
        readonly input: Readonly<Record<string, unknown>>;
      };
    }
) & {
  readonly gate?: Promise<void>;

  readonly inputTokens?: number;

  readonly usage?: ScriptedUsage;
};

interface ScriptedRefusal {
  readonly refusal: string;
  readonly gate?: Promise<void>;
}

interface ScriptedAuthFailure {
  readonly authFailure: string;
  readonly gate?: Promise<void>;
}

export type ScriptedReply = ScriptedMessage | ScriptedRefusal | ScriptedAuthFailure;

const scriptedMessageSchema = z.looseObject({ role: z.string(), content: z.unknown() });
const scriptedToolSchema = z.looseObject({ name: z.string() });

const scriptedModelBodySchema = z.looseObject({
  model: z.string().exactOptional(),
  stream: z.boolean().exactOptional(),
  system: z.unknown().exactOptional(),
  messages: scriptedMessageSchema.array().exactOptional(),
  tools: scriptedToolSchema.array().exactOptional(),
});

type ScriptedModelBody = z.infer<typeof scriptedModelBodySchema>;

export interface ScriptedModelRequest {
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ScriptedModelBody | null;
}

export interface ScriptedModel {
  readonly url: string;
  readonly requests: readonly ScriptedModelRequest[];

  readonly addReplies: (...replies: readonly ScriptedReply[]) => void;
  readonly stop: () => Promise<void>;
}

export function startScriptedModel(): ScriptedModel {
  const requests: ScriptedModelRequest[] = [];
  const script: ScriptedReply[] = [];

  const answerRequest = async (request: Request) => {
    const recorded = await readRequest(request);

    requests.push(recorded);

    const response = renderResponse(recorded, script);

    await response.gate;

    return response.response;
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

async function readRequest(request: Request): Promise<ScriptedModelRequest> {
  const text = request.method === 'POST' ? await request.text() : '';

  return {
    path: new URL(request.url).pathname,
    headers: Object.fromEntries(request.headers),
    body: text === '' ? null : scriptedModelBodySchema.parse(JSON.parse(text)),
  };
}

interface RenderedResponse {
  readonly response: Response;
  readonly gate?: Promise<void>;
}

function renderResponse(request: ScriptedModelRequest, script: ScriptedReply[]): RenderedResponse {
  if (request.path === '/v1/messages/count_tokens') {
    return { response: Response.json({ input_tokens: 10 }) };
  }

  if (request.path !== '/v1/messages' || request.body === null) {
    return { response: new Response('not found', { status: 404 }) };
  }

  const reply = script.shift();

  if (reply === undefined) {
    return { response: renderRefusal('the scripted model has no reply left') };
  }

  const model = request.body.model ?? 'stub';
  const response = buildReplyResponse(reply, model, request.body.stream === true);

  return reply.gate === undefined ? { response } : { response, gate: reply.gate };
}

function renderRefusal(message: string): Response {
  return Response.json(
    { type: 'error', error: { type: 'invalid_request_error', message } },
    { status: 400 },
  );
}

function buildReplyResponse(reply: ScriptedReply, model: string, isStream: boolean): Response {
  if ('refusal' in reply) {
    return renderRefusal(reply.refusal);
  }

  if ('authFailure' in reply) {
    return renderAuthFailure(reply.authFailure);
  }

  return isStream ? renderStream(reply, model) : renderWhole(reply, model);
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
  const usage = buildUsage(reply);

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
        usage: { ...usage, output_tokens: 1 },
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
      usage: { output_tokens: usage.output_tokens },
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

function buildUsage(reply: ScriptedMessage): ScriptedUsage {
  return reply.usage ?? { input_tokens: reply.inputTokens ?? 10, output_tokens: 5 };
}

function renderWhole(reply: ScriptedMessage, model: string): Response {
  const block = buildBlock(reply);

  return Response.json({
    id: `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [block],
    stop_reason: 'toolUse' in reply ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: buildUsage(reply),
  });
}
