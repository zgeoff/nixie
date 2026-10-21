import type { ReadViewMemory, ViewMemoryStore } from './types';

export function requireViewMemory(
  readMemory: ReadViewMemory,
  buildNotStarted: () => Error,
): ViewMemoryStore {
  const store = readMemory();

  if (store === null) {
    throw buildNotStarted();
  }

  return store;
}
