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

export type HTTPClient = (url: string, init: RequestInit) => Promise<Response>;

const completedEvent = z.object({
  type: z.literal('response.completed'),
  response: z.object({ usage: z.unknown() }),
});

// A local stand-in for the counting proxy: it reads HTTP requests only, as the real proxy does,
// forwards each one to `upstream`, the model API's origin, and keeps the usage of each response. It
// refuses a websocket upgrade, so a CLI that tries one shows in `calls` with its `upgrade` header.
export function startCountProxy(upstream: string, httpClient: HTTPClient): CountProxy {
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
    const forward = buildForward(request, upstream);

    if (forward.upgrade) {
      calls.push({ ...forward.call, status: refusedUpgradeStatus, usage: null, error: null });
      return new Response('the counting proxy reads HTTP only', { status: refusedUpgradeStatus });
    }
    const response = await httpClient(forward.target, {
      method: request.method,
      headers: forward.headers,
      body: forward.hasBody ? await request.arrayBuffer() : undefined,
    });
    const reply = { status: response.status, headers: buildClientHeaders(response.headers) };

    const call = { ...forward.call, status: response.status };
    const missingUsage = new Error(
      `the ${response.status} response to ${call.method} ${call.path} held no usage`,
    );

    if (!response.body) {
      recordCall(call, null, response.ok ? missingUsage : null);
      return new Response(null, reply);
    }
    const [toClient, toCount] = response.body.tee();
    const counted = readUsage(toCount)
      .then((usage) => {
        recordCall(call, usage, usage === null && response.ok ? missingUsage : null);
      })
      .catch((error: unknown) => {
        recordCall(call, null, error);
      })
      .finally(() => {
        counting.delete(counted);
      });

    counting.add(counted);
    return new Response(toClient, reply);
  }

  function recordCall(call: Omit<ProxyCall, 'usage' | 'error'>, usage: unknown, error: unknown): void {
    if (error !== null) {
      failures.push(error);
    }
    calls.push({ ...call, usage, error: error === null ? null : String(error) });
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

const refusedUpgradeStatus = 426;

interface Forward {
  readonly call: Pick<ProxyCall, 'method' | 'path' | 'upgrade'>;
  readonly upgrade: boolean;
  readonly target: string;
  readonly headers: Headers;
  readonly hasBody: boolean;
}

// Decides what the proxy does with a request: refuse it as an upgrade, or forward it to
// `upstream` with an uncompressed reply, so the proxy can read the usage as it passes.
function buildForward(request: Request, upstream: string): Forward {
  const url = new URL(request.url);
  const upgrade = request.headers.get('upgrade');
  const headers = new Headers(request.headers);

  headers.delete('host');
  headers.set('accept-encoding', 'identity');
  return {
    call: { method: request.method, path: url.pathname, upgrade },
    upgrade: upgrade !== null,
    target: `${upstream}${url.pathname}${url.search}`,
    headers,
    hasBody: request.method !== 'GET' && request.method !== 'HEAD',
  };
}

// The client gets the body as the proxy read it: decoded, and with a length that no longer holds.
function buildClientHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders);

  headers.delete('content-encoding');
  headers.delete('content-length');
  return headers;
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
