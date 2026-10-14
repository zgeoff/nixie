// A local stand-in for the counting proxy: the CLI's base URL points here, each request goes on to
// the model API, and the usage of every response is kept against the run tag in the URL path. The
// first path segment is the tag, so http://127.0.0.1:<port>/<tag> is one run's base URL.

export interface CallUsage {
  readonly tag: string;
  readonly model: string;
  readonly input: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
  readonly cacheRead: number;
  readonly output: number;
}

export interface CountProxy {
  readonly url: string;
  readonly calls: CallUsage[];
  readonly stop: () => Promise<void>;
}

const upstream = 'https://api.anthropic.com';

export function startCountProxy(): CountProxy {
  const calls: CallUsage[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 255,
    fetch: async (request) => {
      const url = new URL(request.url);
      const [, tag = 'untagged', ...rest] = url.pathname.split('/');
      const path = rest.join('/');
      const headers = new Headers(request.headers);

      headers.delete('host');
      headers.delete('accept-encoding');
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      const response = await fetch(`${upstream}/${path}${url.search}`, {
        method: request.method,
        headers,
        body,
      });

      if (!path.startsWith('v1/messages') || path.includes('count_tokens')) {
        return response;
      }
      const model = readModel(body);
      const outHeaders = new Headers(response.headers);

      outHeaders.delete('content-encoding');
      outHeaders.delete('content-length');
      if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        const [toClient, toCount] = (response.body as ReadableStream<Uint8Array>).tee();

        void collectStreamUsage(toCount, tag, model, calls);
        return new Response(toClient, { status: response.status, headers: outHeaders });
      }
      const text = await response.text();

      try {
        updateCalls(calls, tag, model, JSON.parse(text).usage);
      } catch {
        // an error body holds no usage
      }
      return new Response(text, { status: response.status, headers: outHeaders });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    stop: () => server.stop(true),
  };
}

function readModel(body: ArrayBuffer | undefined): string {
  try {
    return JSON.parse(new TextDecoder().decode(body)).model ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// message_start holds the input side of the usage, and the last message_delta the output total
async function collectStreamUsage(
  stream: ReadableStream<Uint8Array>,
  tag: string,
  model: string,
  calls: CallUsage[],
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: Record<string, unknown> | null = null;

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');

    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      try {
        const event = JSON.parse(line.slice(6));

        if (event.type === 'message_start') {
          usage = { ...event.message.usage };
        } else if (event.type === 'message_delta' && event.usage !== undefined) {
          usage = { ...usage, ...event.usage };
        }
      } catch {
        // not a JSON event
      }
    }
  }
  updateCalls(calls, tag, model, usage);
}

function updateCalls(calls: CallUsage[], tag: string, model: string, usage: unknown): void {
  if (usage === undefined || usage === null || typeof usage !== 'object') {
    return;
  }
  const counts = usage as Record<string, any>;
  const write = (counts.cache_creation_input_tokens as number | undefined) ?? 0;
  const write1h = (counts.cache_creation?.ephemeral_1h_input_tokens as number | undefined) ?? 0;

  calls.push({
    tag,
    model,
    input: counts.input_tokens ?? 0,
    cacheWrite5m: write - write1h,
    cacheWrite1h: write1h,
    cacheRead: counts.cache_read_input_tokens ?? 0,
    output: counts.output_tokens ?? 0,
  });
}
