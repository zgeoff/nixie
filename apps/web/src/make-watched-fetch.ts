import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';

export interface WatchedFetchOptions {
  // How long an event stream may go without a byte before the client treats it as dead.
  readonly idleMs: number;

  readonly fetch?: (request: Request, init?: RequestInit) => Promise<Response>;

  // Calls onTimeout once ms pass, unless the returned stop runs first. The platform timer by default.
  readonly startTimer?: StartTimer;
}

// Builds a fetch that fails an event stream once it goes quiet. The API writes keepalives into a
// quiet stream, so a stream with no byte for several keepalive periods died on the way without
// the browser seeing it close.
export function makeWatchedFetch(options: WatchedFetchOptions) {
  const send = options.fetch ?? ((request, init) => fetch(request, init));
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

// Passes the body through, and fails it once no chunk arrives within the idle period.
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
