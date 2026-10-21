import type { MemoryState } from './types';

export class MemoryStateError extends Error {
  override readonly name = 'MemoryStateError';

  readonly code = 'WRONG_STATE';

  constructor(itemID: string, operation: string, state: MemoryState) {
    super(`memory item ${itemID} is ${state}, so ${operation} does not apply`);
  }
}
