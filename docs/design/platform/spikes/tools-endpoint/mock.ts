// oxlint-disable one-var, sort-vars -- spike code, grouped for reading rather than sorted
// A local stand-in for the Messages API. It scripts 2 replies: a tool_use block that calls the
// target tool, then, once a tool_result arrives, a short text reply. It records every request so the
// run can show what the CLI sent to the model.

export interface MockRequest {
  body: Record<string, unknown> | undefined;
  method: string;
  path: string;
}

export interface Mock {
  requests: MockRequest[];
  setTarget: (suffix: string, input: Record<string, unknown>) => void;
  stop: () => void;
  url: string;
}

interface ApiMessage {
  content: unknown;
  role: string;
}

interface Target {
  input: Record<string, unknown>;
  suffix: string;
}

interface ApiTool {
  name: string;
}

function encodeEvent(event: Record<string, unknown>): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

function hasToolResult(messages: ApiMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || !Array.isArray(last.content)) {
    return false;
  }
  return last.content.some(
    (block: unknown) =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: string }).type === 'tool_result',
  );
}

function buildBlock(body: Record<string, unknown>, target: Target): Record<string, unknown> {
  const messages = (body.messages ?? []) as ApiMessage[],
    tools = (body.tools ?? []) as ApiTool[],
    tool = tools.find((candidate) => candidate.name.endsWith(`__${target.suffix}`));
  if (hasToolResult(messages) || !tool) {
    return { text: tool ? 'done' : 'no target tool in the request', type: 'text' };
  }
  return {
    id: `toolu_${crypto.randomUUID().slice(0, 8)}`,
    input: target.input,
    name: tool.name,
    type: 'tool_use',
  };
}

function renderStream(block: Record<string, unknown>, model: string): Response {
  const isTool = block.type === 'tool_use',
    start = isTool ? { ...block, input: {} } : { text: '', type: 'text' },
    delta = isTool
      ? { partial_json: JSON.stringify(block.input), type: 'input_json_delta' }
      : { text: block.text, type: 'text_delta' },
    events = [
      {
        message: {
          content: [],
          id: `msg_${crypto.randomUUID().slice(0, 8)}`,
          model,
          role: 'assistant',
          stop_reason: null,
          stop_sequence: null,
          type: 'message',
          usage: { input_tokens: 10, output_tokens: 1 },
        },
        type: 'message_start',
      },
      { content_block: start, index: 0, type: 'content_block_start' },
      { delta, index: 0, type: 'content_block_delta' },
      { index: 0, type: 'content_block_stop' },
      {
        delta: { stop_reason: isTool ? 'tool_use' : 'end_turn', stop_sequence: null },
        type: 'message_delta',
        usage: { output_tokens: 5 },
      },
      { type: 'message_stop' },
    ];
  return new Response(events.map((event) => encodeEvent(event)).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

function renderJson(block: Record<string, unknown>, model: string): Response {
  return Response.json({
    content: [block],
    id: `msg_${crypto.randomUUID().slice(0, 8)}`,
    model,
    role: 'assistant',
    stop_reason: block.type === 'tool_use' ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    type: 'message',
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

export function startMock(): Mock {
  const requests: MockRequest[] = [],
    target = { input: {} as Record<string, unknown>, suffix: '' },
    server = Bun.serve({
      async fetch(request) {
        const pathname = new URL(request.url).pathname,
          text = request.method === 'POST' ? await request.text() : '',
          body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
        requests.push({ body, method: request.method, path: pathname });
        if (pathname === '/v1/messages/count_tokens') {
          return Response.json({ input_tokens: 10 });
        }
        if (pathname !== '/v1/messages' || !body) {
          return new Response('not found\n', { status: 404 });
        }
        const block = buildBlock(body, target),
          model = String(body.model ?? 'mock');
        return body.stream ? renderStream(block, model) : renderJson(block, model);
      },
      hostname: '127.0.0.1',
      port: 0,
    });
  return {
    requests,
    setTarget(suffix, input) {
      target.suffix = suffix;
      target.input = input;
    },
    stop() {
      void server.stop(true);
    },
    url: `http://127.0.0.1:${server.port}`,
  };
}
