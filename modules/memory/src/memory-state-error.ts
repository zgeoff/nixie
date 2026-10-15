import type { MemoryState } from './types';

// The operation does not apply to an item in its current state, such as a restore of an active
// item or a pin of a retired one.
export class MemoryStateError extends Error {
  override readonly name = 'MemoryStateError';

  readonly code = 'WRONG_STATE';

  constructor(itemID: string, operation: string, state: MemoryState) {
    super(`memory item ${itemID} is ${state}, so ${operation} does not apply`);
  }
}
