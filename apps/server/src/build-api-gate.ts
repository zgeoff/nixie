export interface APIGate {
  // runs one request through next while the gate is open, and answers an API call with 503 once it
  // closes; the health endpoints always pass, and a close never waits for them
  readonly run: (
    request: Request,
    next: (request: Request) => Promise<Response>,
  ) => Promise<Response>;

  // refuses every later API call, then waits for the API calls in flight to answer
  readonly close: () => Promise<void>;
}

// Builds the gate in front of the HTTP server that a reset closes before it removes anything, so
// a device's call during the reset is refused instead of committing a write the reset then deletes.
export function buildAPIGate(): APIGate {
  const calls: APICalls = { isClosed: false, inFlight: 0, waiters: [] };

  return {
    run: (request, next) => {
      if (!new URL(request.url).pathname.startsWith('/rpc')) {
        return next(request);
      }
      if (calls.isClosed) {
        return Promise.resolve(new Response('nixie is resetting', { status: 503 }));
      }
      return runCounted(calls, () => next(request));
    },
    close: async () => {
      calls.isClosed = true;
      if (calls.inFlight > 0) {
        const drained = Promise.withResolvers<void>();

        calls.waiters.push(drained.resolve);
        await drained.promise;
      }
    },
  };
}

// the API calls in flight, and the closes that wait for none to be left
interface APICalls {
  isClosed: boolean;
  inFlight: number;
  readonly waiters: (() => void)[];
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the gate's own counter
async function runCounted(calls: APICalls, call: () => Promise<Response>): Promise<Response> {
  calls.inFlight += 1;
  try {
    return await call();
  } finally {
    calls.inFlight -= 1;
    if (calls.inFlight === 0) {
      for (const wake of calls.waiters.splice(0)) {
        wake();
      }
    }
  }
}
