export interface KeyedLock {
  // runs `run` once every earlier holder of the key is done, and keeps later ones waiting until it
  // settles
  readonly withLock: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}

// One lock per key, in memory: the holders of a key run one at a time, in the order they asked.
export function createKeyedLock(): KeyedLock {
  const tails = new Map<string, Promise<void>>();

  return {
    withLock: async (key, run) => {
      const previous = tails.get(key);
      const done = Promise.withResolvers<void>();
      const tail = waitInTurn(previous, done.promise);

      tails.set(key, tail);

      await previous;

      try {
        return await run();
      } finally {
        done.resolve();

        if (tails.get(key) === tail) {
          tails.delete(key);
        }
      }
    },
  };
}

async function waitInTurn(previous: Promise<void> | undefined, own: Promise<void>): Promise<void> {
  await previous;
  await own;
}
