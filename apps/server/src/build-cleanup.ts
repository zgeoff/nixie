import type { Cleanup } from './types';

export function buildCleanup(): Cleanup {
  const stopping = new AbortController();

  const stops: (() => Promise<void> | void)[] = [];
  const stopped: { pending: Promise<void> | null } = { pending: null };

  const reason = new Error('nixie is stopping');

  return {
    signal: stopping.signal,
    abort: () => {
      stopping.abort(reason);
    },
    defer: async (stop) => {
      if (stopped.pending === null) {
        stops.push(stop);
      } else {
        await stop();
      }
    },
    stop: () => {
      stopping.abort(reason);

      stopped.pending ??= runStops(stops);

      return stopped.pending;
    },
  };
}

async function runStops(stops: (() => Promise<void> | void)[]): Promise<void> {
  const errors: unknown[] = [];

  for (const stop of stops.toReversed()) {
    try {
      await stop();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'a part failed to stop');
  }
}
