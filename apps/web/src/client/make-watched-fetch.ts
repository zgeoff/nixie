import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';

export interface WatchedFetchOptions {
  readonly idleMs: number;

  readonly send?: (request: Request, init?: RequestInit) => Promise<Response>;

  // true for a request that opens an event stream, which the server answers with its headers at
  // once, so a request that is still waiting for them after the idle period died on the way
  readonly isStreamRequest?: (request: Request) => boolean;

  readonly startTimer?: StartTimer;
}

// The API writes keepalives into a quiet stream, so a stream with no byte for several keepalive
// periods died on the way, and the browser never sees it close.
export function makeWatchedFetch(options: WatchedFetchOptions) {
  const send = options.send ?? ((request, init) => fetch(request, init));
  const startTimer = options.startTimer ?? startPlatformTimer;
  const isStreamRequest = options.isStreamRequest ?? (() => false);

  return async (request: Request, init?: RequestInit): Promise<Response> => {
    const response = isStreamRequest(request)
      ? await sendWithinIdlePeriod(send, request, init, { idleMs: options.idleMs, startTimer })
      : await send(request, init);

    if (
      response.body === null ||
      !(response.headers.get('content-type') ?? '').startsWith('text/event-stream')
    ) {
      return response;
    }

    return new Response(startBodyWatch(response.body, options.idleMs, startTimer), {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}

interface HeaderWatch {
  readonly idleMs: number;
  readonly startTimer: StartTimer;
}

// Sends the request, and fails it when the response headers take longer than the idle period.
async function sendWithinIdlePeriod(
  send: (request: Request, init?: RequestInit) => Promise<Response>,
  request: Request,
  init: RequestInit | undefined,
  watch: HeaderWatch,
): Promise<Response> {
  // One signal of our own carries both the caller's abort and the timeout. The listener stays after
  // the response arrives, because the caller's abort still has to stop the body.
  const link = new AbortController();

  const callerSignal = init?.signal ?? request.signal;

  const forwardAbort = (): void => {
    link.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted === true) {
    forwardAbort();
  } else {
    callerSignal?.addEventListener('abort', forwardAbort, { once: true });
  }

  const stalled = Promise.withResolvers<never>();

  const stopTimer = watch.startTimer(() => {
    const reason = new Error(`the event stream sent no response for ${watch.idleMs} ms`);

    link.abort(reason);
    stalled.reject(reason);
  }, watch.idleMs);

  try {
    return await Promise.race([send(request, { ...init, signal: link.signal }), stalled.promise]);
  } finally {
    stopTimer();
  }
}

type Bytes = ReadableStream<Uint8Array>;

function startBodyWatch(body: Bytes, idleMs: number, startTimer: StartTimer): Bytes {
  const watch = { stopTimer: () => {} };

  const resetIdleTimer = (controller: TransformStreamDefaultController<Uint8Array>): void => {
    watch.stopTimer();

    watch.stopTimer = startTimer(() => {
      controller.error(new Error(`the event stream sent nothing for ${idleMs} ms`));
    }, idleMs);
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush: () => {
        watch.stopTimer();
      },
      start: resetIdleTimer,
      transform: (chunk, controller) => {
        resetIdleTimer(controller);

        controller.enqueue(chunk);
      },
    }),
  );
}
