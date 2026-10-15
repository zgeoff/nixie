// The consolidation change no longer waits for the owner's answer: it was approved, rejected or
// lapsed, its lapse time passed, or its first input was forgotten, so it takes no comment.
export class ConsolidationChangeClosedError extends Error {
  override readonly name = 'ConsolidationChangeClosedError';

  readonly code = 'CHANGE_CLOSED';

  constructor(changeID: string, status: string) {
    super(`consolidation change ${changeID} is ${status}, so it takes no comment`);
  }
}
