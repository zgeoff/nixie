import type { MemoryProposals, MemoryStore } from '@heynixie/memory';
import { ControlRequestError } from './control-request-error';

// What the memory host commands reach: the pending proposals, and your own changes to an item.
export type HostMemory = Pick<
  MemoryStore,
  'remember' | 'retire' | 'restore' | 'pin' | 'readHistory'
> & { readonly proposals: MemoryProposals };

// Returns the memory store, or refuses the request while the start sequence has not filled it.
export function requireHostMemory(readMemory: () => HostMemory | null): HostMemory {
  const memory = readMemory();

  if (memory === null) {
    throw new ControlRequestError(503, 'the memory store has not started yet');
  }
  return memory;
}
