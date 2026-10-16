// A local stand-in for the counting proxy and the broker's credential grant. The CLI's base URL
// points here, and the first path segment is the run tag, so http://127.0.0.1:<port>/<tag> is one
// run's base URL. Each request goes on to the model API with the guest's placeholder credential
// replaced by the signed-in Claude login's token, as the grant replaces it in production. For every
// model call the proxy keeps what the CLI asked for, the cache lifetimes in the request and the
// extended cache lifetime beta, beside what the API wrote, from the response's usage.

export interface CallUsage {
  readonly tag: string;
  readonly model: string;
  readonly at: string;

  // the ttl of each cache_control block in the request, "default" for a block that names none
  readonly requestedTTLs: readonly string[];
  readonly hasTTLBeta: boolean;
  readonly input: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
  readonly cacheRead: number;
  readonly output: number;
}

export interface CountProxy {
  readonly url: string;
  readonly calls: CallUsage[];

  // resolves once every response the proxy has passed on has had its usage counted
  readonly waitForCounts: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

const upstream = 'https://api.anthropic.com';
const ttlBeta = 'extended-cache-ttl-2025-04-11';
const oauthBeta = 'oauth-2025-04-20';

// tokenFile is a Claude Code credentials file, read on every request because the login refreshes
// its access token in place
export function startCountProxy(tokenFile: string): CountProxy {
  const calls: CallUsage[] = [];
  const counting = new Set<Promise<void>>();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 255,
    fetch: async (request) => {
      const url = new URL(request.url);
      const [, tag = 'untagged', ...rest] = url.pathname.split('/');
      const path = rest.join('/');
      const headers = await buildUpstreamHeaders(request.headers, tokenFile);
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      const response = await fetch(`${upstream}/${path}${url.search}`, {
        method: request.method,
        headers,
        body,
      });

      if (!path.startsWith('v1/messages') || path.includes('count_tokens')) {
        return response;
      }
      const sent = {
        tag,
        model: 'unknown',
        at: new Date().toISOString(),
        requestedTTLs: [] as string[],
        hasTTLBeta: (request.headers.get('anthropic-beta') ?? '').includes(ttlBeta),
        ...readRequest(body),
      };
      const outHeaders = new Headers(response.headers);

      outHeaders.delete('content-encoding');
      outHeaders.delete('content-length');
      if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        const [toClient, toCount] = (response.body as ReadableStream<Uint8Array>).tee();

        const counted = collectStreamUsage(toCount, sent, calls).finally(() => {
          counting.delete(counted);
        });

        counting.add(counted);
        return new Response(toClient, { status: response.status, headers: outHeaders });
      }
      const text = await response.text();

      if (response.status >= 400) {
        console.error(`model API ${response.status}: ${text.slice(0, 300)}`);
      }
      try {
        updateCalls(calls, sent, JSON.parse(text).usage);
      } catch {
        // an error body holds no usage
      }
      return new Response(text, { status: response.status, headers: outHeaders });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    waitForCounts: async () => {
      await Promise.all(counting);
    },
    stop: () => server.stop(true),
  };
}

// the CLI's headers with the placeholder credential swapped for the login's bearer token, sent
// beside the OAuth beta
async function buildUpstreamHeaders(incoming: Headers, tokenFile: string): Promise<Headers> {
  const headers = new Headers(incoming);
  const credentials = (await Bun.file(tokenFile).json()) as { claudeAiOauth: { accessToken: string } };
  const betas = (headers.get('anthropic-beta') ?? '').split(',').filter((beta) => beta !== '');

  headers.delete('host');
  headers.delete('accept-encoding');
  headers.delete('x-api-key');
  headers.set('authorization', `Bearer ${credentials.claudeAiOauth.accessToken}`);
  headers.set('anthropic-beta', [...new Set([...betas, oauthBeta])].join(','));
  return headers;
}

function readRequest(body: ArrayBuffer | undefined): { model: string; requestedTTLs: string[] } {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;

    return { model: (parsed['model'] as string | undefined) ?? 'unknown', requestedTTLs: collectTTLs(parsed) };
  } catch {
    return { model: 'unknown', requestedTTLs: [] };
  }
}

// every cache_control block anywhere in the request: system blocks, message blocks and tools
function collectTTLs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectTTLs);
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const record = value as Record<string, unknown>;
  const control = record['cache_control'] as { ttl?: string } | undefined;
  const own = control === undefined ? [] : [control.ttl ?? 'default'];

  return [
    ...own,
    ...Object.entries(record).flatMap(([key, child]) => (key === 'cache_control' ? [] : collectTTLs(child))),
  ];
}

// message_start holds the input side of the usage, and the last message_delta the output total
async function collectStreamUsage(
  stream: ReadableStream<Uint8Array>,
  sent: Omit<CallUsage, 'input' | 'cacheWrite5m' | 'cacheWrite1h' | 'cacheRead' | 'output'>,
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
  updateCalls(calls, sent, usage);
}

function updateCalls(
  calls: CallUsage[],
  sent: Omit<CallUsage, 'input' | 'cacheWrite5m' | 'cacheWrite1h' | 'cacheRead' | 'output'>,
  usage: unknown,
): void {
  if (usage === undefined || usage === null || typeof usage !== 'object') {
    return;
  }
  const counts = usage as Record<string, any>;
  const write = (counts.cache_creation_input_tokens as number | undefined) ?? 0;
  const write1h = (counts.cache_creation?.ephemeral_1h_input_tokens as number | undefined) ?? 0;

  calls.push({
    ...sent,
    input: counts.input_tokens ?? 0,
    cacheWrite5m: write - write1h,
    cacheWrite1h: write1h,
    cacheRead: counts.cache_read_input_tokens ?? 0,
    output: counts.output_tokens ?? 0,
  });
}
