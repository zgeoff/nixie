export interface APIGate {
  readonly run: (
    request: Request,
    next: (request: Request) => Promise<Response>,
  ) => Promise<Response>;

  readonly runCall: <T>(call: () => Promise<T>, onClosed: () => Promise<T>) => Promise<T>;

  readonly close: () => Promise<void>;
}

interface APICalls {
  isClosed: boolean;
  inFlight: number;
  readonly waiters: (() => void)[];
}

export function buildAPIGate(): APIGate {
  const calls: APICalls = { isClosed: false, inFlight: 0, waiters: [] };

  const runCall = <T>(call: () => Promise<T>, onClosed: () => Promise<T>): Promise<T> =>
    calls.isClosed ? onClosed() : runCounted(calls, call);

  return {
    run: (request, next) => {
      if (!new URL(request.url).pathname.startsWith('/rpc')) {
        return next(request);
      }

      return runCall(
        () => next(request),
        () => Promise.resolve(new Response('nixie is resetting', { status: 503 })),
      );
    },
    runCall,
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

async function runCounted<T>(calls: APICalls, call: () => Promise<T>): Promise<T> {
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
