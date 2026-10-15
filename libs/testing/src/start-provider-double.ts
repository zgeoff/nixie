// One answer the provider double gives a call: success with a result, a refusal that can clear, a
// refusal with no effect, or a connection dropped after the provider took the call. A gate holds
// the answer until it resolves.
export type ProviderReply = (
  | { readonly kind: 'success'; readonly result: Readonly<Record<string, unknown>> }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'drop' }
) & { readonly gate?: Promise<void> };

// One call the provider received, with the idempotency key it carried, or null for none.
export interface ProviderCall {
  readonly idempotencyKey: string | null;
  readonly body: unknown;
}

export interface ProviderDouble {
  readonly url: string;
  readonly calls: readonly ProviderCall[];

  // appends answers to the script, which the double gives in order, one per call
  readonly addReplies: (...replies: readonly ProviderReply[]) => void;
  readonly stop: () => Promise<void>;
}

// Starts the provider double for the test connector: a local HTTP service that records every call
// to POST /send with its Idempotency-Key header, then answers 200, 429, 422 or a closed connection.
// A call past the script's end gets a refusal, so a test that scripts too few fails, never hangs.
export function startProviderDouble(): ProviderDouble {
  const calls: ProviderCall[] = [];
  const script: ProviderReply[] = [];

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') {
        return new Response('not found', { status: 404 });
      }

      const body: unknown = await request.json();

      calls.push({ idempotencyKey: request.headers.get('idempotency-key'), body });

      const reply = script.shift() ?? {
        kind: 'refused',
        reason: 'the provider double has no reply left',
      };

      await reply.gate;

      return renderReply(reply);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    addReplies: (...replies) => {
      script.push(...replies);
    },
    stop: async () => {
      await server.stop(true);
    },
  };
}

function renderReply(reply: ProviderReply): Response {
  if (reply.kind === 'success') {
    return Response.json({ result: reply.result });
  }

  if (reply.kind === 'refused_retryable') {
    const headers: Record<string, string> =
      reply.retryAfterMs === undefined ? {} : { 'retry-after-ms': String(reply.retryAfterMs) };

    return Response.json({ reason: reply.reason }, { status: 429, headers });
  }

  if (reply.kind === 'refused') {
    return Response.json({ reason: reply.reason }, { status: 422 });
  }

  return new Response(
    new ReadableStream({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('{"result":'));
        controller.error(new Error('the provider double dropped the connection'));
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}
