export type ProviderReply = (
  | { readonly kind: 'success'; readonly result: Readonly<Record<string, unknown>> }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'destinations_changed'; readonly reason: string }
  | { readonly kind: 'drop' }
) & { readonly gate?: Promise<void> };

// What a read-only check of the provider finds.
export type ProviderCheckReply =
  | { readonly kind: 'found'; readonly result: Readonly<Record<string, unknown>> }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

export interface ProviderCall {
  readonly idempotencyKey: string | null;
  readonly body: unknown;
}

export interface ProviderDouble {
  readonly url: string;
  readonly calls: readonly ProviderCall[];
  readonly checkCalls: readonly ProviderCall[];

  readonly addReplies: (...replies: readonly ProviderReply[]) => void;
  readonly addCheckReplies: (...replies: readonly ProviderCheckReply[]) => void;

  // the time after which a checked send must not start; none until a test sets one
  readonly setDeadline: (deadlineAt: number | null) => void;
  readonly stop: () => Promise<void>;
}

export function startProviderDouble(): ProviderDouble {
  const calls: ProviderCall[] = [];
  const checkCalls: ProviderCall[] = [];
  const script: ProviderReply[] = [];
  const checkScript: ProviderCheckReply[] = [];
  const deadline: { at: number | null } = { at: null };

  const answerRequest = async (request: Request) => {
    if (request.method === 'GET' && new URL(request.url).pathname === '/deadline') {
      return Response.json({ deadlineAt: deadline.at });
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/check') {
      checkCalls.push({
        idempotencyKey: request.headers.get('idempotency-key'),
        body: await request.json(),
      });

      return renderCheckReply(checkScript.shift() ?? { kind: 'inconclusive' });
    }

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
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    checkCalls,
    addReplies: (...replies) => {
      script.push(...replies);
    },
    addCheckReplies: (...replies) => {
      checkScript.push(...replies);
    },
    setDeadline: (deadlineAt) => {
      deadline.at = deadlineAt;
    },
    stop: async () => {
      await server.stop(true);
    },
  };
}

function renderCheckReply(reply: ProviderCheckReply): Response {
  if (reply.kind === 'found') {
    return Response.json({ result: reply.result });
  }

  return Response.json({}, { status: reply.kind === 'not_found' ? 404 : 503 });
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

  if (reply.kind === 'destinations_changed') {
    return Response.json({ reason: reply.reason }, { status: 409 });
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
