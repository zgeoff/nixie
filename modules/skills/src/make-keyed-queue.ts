export type KeyedQueue = <T>(key: string, work: () => Promise<T>) => Promise<T>;

export function makeKeyedQueue(): KeyedQueue {
  const tails = new Map<string, Promise<unknown>>();

  return async (key, work) => {
    const before = tails.get(key) ?? Promise.resolve();
    const done = Promise.withResolvers<void>();
    const tail = Promise.all([before, done.promise]);

    tails.set(key, tail);

    await before;

    try {
      return await work();
    } finally {
      done.resolve();

      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    }
  };
}
