export interface SerialLock {
  readonly withLock: <T>(run: () => Promise<T>) => Promise<T>;
}

// Runs the callbacks one after another, in the order they ask. The consent and client operations
// check a row and then change it, so two of them at once would each pass the same check.
export function makeSerialLock(): SerialLock {
  const state = { tail: Promise.resolve() };

  return {
    withLock: async (run) => {
      const earlier = state.tail;
      const turn = Promise.withResolvers<void>();

      state.tail = turn.promise;

      await earlier;

      try {
        return await run();
      } finally {
        turn.resolve();
      }
    },
  };
}
