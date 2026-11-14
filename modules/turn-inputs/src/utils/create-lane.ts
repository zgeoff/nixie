export interface Lane {
  readonly run: <T>(task: () => Promise<T>) => Promise<T>;
}

// One serial lane: each task starts after the one before it ends, whether that one failed or not.
export function createLane(): Lane {
  const state = { tail: Promise.resolve() };

  return {
    run: <T>(task: () => Promise<T>): Promise<T> => {
      const result = runAfter(state.tail, task);

      state.tail = settle(result);

      return result;
    },
  };
}

async function runAfter<T>(before: Promise<void>, task: () => Promise<T>): Promise<T> {
  await before;

  return task();
}

async function settle(result: Promise<unknown>): Promise<void> {
  try {
    await result;
  } catch {}
}
