// A local stand-in for the model API and the ChatGPT backend. It keeps the exact body of each
// request the CLI sends, with its size in bytes and the headers minus their credentials, and
// answers a model request with a short streamed reply, so no request leaves the host and nothing
// is spent.
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;

  // the UTF-8 size of the body as the CLI sent it, before a run replaces any path in it
  readonly bodyBytes: number;
  readonly body: string;
}

export interface StubOptions {
  // the first model request gets one call of this MCP tool, so the second request shows the result
  readonly toolCall: { readonly namespace: string; readonly name: string } | null;

  // the answer to the plan login's user settings; null answers 404, as a refusing broker does
  readonly userSettings: Readonly<Record<string, unknown>> | null;
}

export interface StubUpstream {
  readonly url: string;
  readonly requests: RecordedRequest[];
  readonly stop: () => Promise<void>;
}

const secretHeaders = new Set(['authorization', 'chatgpt-account-id', 'cookie']);

export function startStubUpstream(options: StubOptions): StubUpstream {
  const requests: RecordedRequest[] = [];
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerRequest });

  async function answerRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const bytes = request.method === 'POST' ? new Uint8Array(await request.arrayBuffer()) : null;
    const body = bytes === null ? '' : new TextDecoder().decode(bytes);

    requests.push({
      method: request.method,
      path,
      headers: readHeaders(request.headers),
      bodyBytes: bytes?.byteLength ?? 0,
      body,
    });

    if (request.method === 'POST' && path.endsWith('/responses')) {
      const modelCalls = requests.filter((recorded) => recorded.path.endsWith('/responses'));
      const toolCall = modelCalls.length === 1 ? options.toolCall : null;

      return new Response(buildReplyStream(toolCall), {
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    if (path.endsWith('/wham/settings/user') && options.userSettings !== null) {
      return Response.json(options.userSettings);
    }

    return Response.json(
      { error: { message: 'the stub answers model requests only' } },
      { status: 404 },
    );
  }

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    stop: async () => {
      await server.stop(true);
    },
  };
}

// A credential header keeps its name and loses its value, so a run log shows that it was sent.
function readHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].map(([name, value]) => [
      name,
      secretHeaders.has(name) ? `<${String(value.length)} bytes>` : value,
    ]),
  );
}

function buildReplyStream(toolCall: StubOptions['toolCall']): string {
  const item =
    toolCall === null
      ? {
          type: 'message',
          role: 'assistant',
          id: 'msg-stub',
          content: [{ type: 'output_text', text: 'Done.' }],
        }
      : {
          type: 'function_call',
          id: 'fc-stub',
          call_id: 'call-stub',
          namespace: toolCall.namespace,
          name: toolCall.name,
          arguments: '{}',
        };
  const events = [
    { type: 'response.created', response: { id: 'resp-stub' } },
    { type: 'response.output_item.done', item },
    {
      type: 'response.completed',
      response: {
        id: 'resp-stub',
        usage: {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 2,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 12,
        },
      },
    },
  ];

  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}
