export interface APIGate {
  // runs one request through next while the gate is open, and answers an API call with 503 once it
  // closes; the health endpoints always pass
  readonly run: (
    request: Request,
    next: (request: Request) => Promise<Response>,
  ) => Promise<Response>;

  // refuses every later API call, then waits for the requests in flight to answer
  readonly close: () => Promise<void>;
}

// Builds the gate in front of the HTTP server that a reset closes before it removes anything, so
// a device's call during the reset is refused instead of committing a write the reset then deletes.
export function buildAPIGate(): APIGate {
  const state = { isClosed: false, inFlight: 0 };
  const idle = { waiters: [] as (() => void)[] };

  return {
    run: async (request, next) => {
      if (state.isClosed && new URL(request.url).pathname.startsWith('/rpc')) {
        return new Response('nixie is resetting', { status: 503 });
      }
      state.inFlight += 1;
      try {
        return await next(request);
      } finally {
        state.inFlight -= 1;
        if (state.inFlight === 0) {
          for (const wake of idle.waiters.splice(0)) {
            wake();
          }
        }
      }
    },
    close: async () => {
      state.isClosed = true;
      if (state.inFlight > 0) {
        const drained = Promise.withResolvers<void>();

        idle.waiters.push(drained.resolve);
        await drained.promise;
      }
    },
  };
}
