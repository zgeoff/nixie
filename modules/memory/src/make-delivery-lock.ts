// A lock that runs one callback at a time, in the order they arrive.
export type DeliveryLock = <T>(fn: () => Promise<T>) => Promise<T>;

// Makes the delivery lock that writes, retire, forget and the last step of a recall share. A recall
// checks an item, decrypts it and records the delivery while it holds the lock, so a forget either
// starts after the delivery is recorded or before the check, which then finds the item gone.
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
