import { z } from 'zod';
import { parseJSONOrNull } from '@heynixie/wire';

// One request the CLI sent to the model API, with the usage that the response's last event held.
export interface ProxyCall {
  readonly method: string;
  readonly path: string;
  readonly upgrade: string | null;
  readonly status: number;
  readonly usage: unknown;

  // why the proxy could not read the response's usage, or null when it read it
  readonly error: string | null;
}

export interface CountProxy {
  readonly url: string;
  readonly calls: ProxyCall[];

  // resolves once every response the proxy has passed on has had its usage read, and rejects when
  // any read failed
  readonly waitForCounts: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

const completedEvent = z.object({
  type: z.literal('response.completed'),
  response: z.object({ usage: z.unknown() }),
});

// A local stand-in for the counting proxy: it reads HTTP requests only, as the real proxy does,
// forwards each one to `upstream`, the model API's origin, and keeps the usage of each response. It
// refuses a websocket upgrade, so a CLI that tries one shows in `calls` with its `upgrade` header.
export function startCountProxy(upstream: string): CountProxy {
  const calls: ProxyCall[] = [];
  const counting = new Set<Promise<void>>();
  const failures: unknown[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 255,
    fetch: answerRequest,
  });

  async function answerRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get('upgrade');

    if (upgrade) {
      calls.push({ method: request.method, path: url.pathname, upgrade, status: 426, usage: null, error: null });
      return new Response('the counting proxy reads HTTP only', { status: 426 });
    }
    const headers = new Headers(request.headers);

    headers.delete('host');
    headers.set('accept-encoding', 'identity');
    const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
    const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body,
    });
    const outHeaders = new Headers(response.headers);

    outHeaders.delete('content-encoding');
    outHeaders.delete('content-length');
    if (!response.body) {
      calls.push({ method: request.method, path: url.pathname, upgrade, status: response.status, usage: null, error: null });
      return new Response(null, { status: response.status, headers: outHeaders });
    }
    const [toClient, toCount] = response.body.tee();
    const call = { method: request.method, path: url.pathname, upgrade, status: response.status };
    const counted = readUsage(toCount)
      .then((usage) => {
        calls.push({ ...call, usage, error: null });
      })
      .catch((error: unknown) => {
        failures.push(error);
        calls.push({ ...call, usage: null, error: String(error) });
      })
      .finally(() => {
        counting.delete(counted);
      });

    counting.add(counted);
    return new Response(toClient, { status: response.status, headers: outHeaders });
  }

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    waitForCounts: async () => {
      await Promise.all(counting);
      if (failures.length > 0) {
        throw new AggregateError(failures, `the proxy could not read ${failures.length} usage`);
      }
    },
    stop: async () => {
      await server.stop(true);
    },
  };
}

async function readUsage(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  const text = await new Response(stream).text();
  const usages = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .flatMap((line) => {
      const parsed = completedEvent.safeParse(parseJSONOrNull(line.slice('data: '.length)));
      return parsed.success ? [parsed.data.response.usage] : [];
    });
  return usages.at(-1) ?? null;
}
