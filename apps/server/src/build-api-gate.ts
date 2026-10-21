export interface APIGate {
  readonly run: (
    request: Request,
    next: (request: Request) => Promise<Response>,
  ) => Promise<Response>;

  readonly close: () => Promise<void>;
}

interface APICalls {
  isClosed: boolean;
  inFlight: number;
  readonly waiters: (() => void)[];
}

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
