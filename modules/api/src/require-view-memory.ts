import type { ReadViewMemory, ViewMemoryStore } from './types';

// Returns the memory store as the memory view reaches it, or throws the procedure's typed
// MEMORY_NOT_STARTED while the start sequence has not filled it.
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
