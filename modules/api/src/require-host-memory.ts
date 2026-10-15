import type { HostMemory } from '@heynixie/memory';
import { buildHostMemory } from '@heynixie/memory';
import type { ReadHostMemory } from './types';

// Returns the memory store as the host commands reach it, or throws the procedure's typed
// MEMORY_NOT_STARTED while the start sequence has not filled it.
export function requireHostMemory(
  readMemory: ReadHostMemory,
  buildNotStarted: () => Error,
): HostMemory {
  const store = readMemory();

  if (store === null) {
    throw buildNotStarted();
  }

  return buildHostMemory(store);
}
