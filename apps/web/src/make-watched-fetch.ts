export interface WatchedFetchOptions {
  // How long an event stream may go without a byte before the client treats it as dead.
  readonly idleMs: number;
  readonly fetch?: (request: Request, init?: RequestInit) => Promise<Response>;
}

// Builds a fetch that fails an event stream once it goes quiet. The API writes keepalives into a
// quiet stream, so a stream with no byte for several keepalive periods died on the way without
// the browser seeing it close.
export function makeWatchedFetch(options: WatchedFetchOptions) {
  const send = options.fetch ?? ((request, init) => fetch(request, init));

  return async (request: Request, init?: RequestInit): Promise<Response> => {
    const response = await send(request, init);

    if (
      response.body === null ||
      !(response.headers.get('content-type') ?? '').startsWith('text/event-stream')
    ) {
      return response;
    }

    return new Response(startBodyWatch(response.body, options.idleMs), {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}

// Passes the body through, and fails it once no chunk arrives within the idle period.
function startBodyWatch(
  body: ReadableStream<Uint8Array>,
  idleMs: number,
): ReadableStream<Uint8Array> {
  const watch: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined };
  const resetIdleTimer = (controller: TransformStreamDefaultController<Uint8Array>): void => {
    clearTimeout(watch.timer);
    watch.timer = setTimeout(() => {
      controller.error(new Error(`the event stream sent nothing for ${idleMs} ms`));
    }, idleMs);
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      flush: () => {
        clearTimeout(watch.timer);
      },
      start: resetIdleTimer,
      transform: (chunk, controller) => {
        resetIdleTimer(controller);
        controller.enqueue(chunk);
      },
    }),
  );
}
