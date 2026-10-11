import type { Cleanup } from './types';

// Builds the list of stops that a server stop runs, the last registered first, so each part stops
// after the parts that use it. A part that fails to stop never keeps the rest running.
export function buildCleanup(): Cleanup {
  const stopping = new AbortController();
  const stops: (() => Promise<void> | void)[] = [];
  const stopped: { pending: Promise<void> | null } = { pending: null };

  return {
    signal: stopping.signal,
    defer: async (stop) => {
      if (stopping.signal.aborted) {
        await stop();
      } else {
        stops.push(stop);
      }
    },
    stop: () => {
      stopping.abort(new Error('nixie is stopping'));
      stopped.pending ??= runStops(stops);
      return stopped.pending;
    },
  };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the cleanup's own list
async function runStops(stops: (() => Promise<void> | void)[]): Promise<void> {
  const errors: unknown[] = [];

  for (const stop of stops.toReversed()) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each part stops after the parts that use it
      await stop();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'a part failed to stop');
  }
}
