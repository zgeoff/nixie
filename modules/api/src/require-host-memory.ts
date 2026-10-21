import type { HostMemory } from '@heynixie/memory';
import { buildHostMemory } from '@heynixie/memory';
import type { ReadHostMemory } from './types';

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
