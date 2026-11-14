export type DeliveryLock = <T>(fn: () => Promise<T>) => Promise<T>;

export function makeDeliveryLock(): DeliveryLock {
  const tail: { last: Promise<void> } = { last: Promise.resolve() };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = tail.last;
    const done = Promise.withResolvers<void>();

    tail.last = done.promise;

    try {
      await previous;

      return await fn();
    } finally {
      done.resolve();
    }
  };
}
