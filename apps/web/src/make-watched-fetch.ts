import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';

export interface WatchedFetchOptions {
  readonly idleMs: number;

  readonly send?: (request: Request, init?: RequestInit) => Promise<Response>;

  readonly startTimer?: StartTimer;
}

// The API writes keepalives into a quiet stream, so a stream with no byte for several keepalive
// periods died on the way, and the browser never sees it close.
export function makeWatchedFetch(options: WatchedFetchOptions) {
  const send = options.send ?? ((request, init) => fetch(request, init));
  const startTimer = options.startTimer ?? startPlatformTimer;

  return async (request: Request, init?: RequestInit): Promise<Response> => {
    const response = await send(request, init);

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
