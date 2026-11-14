export class ConsolidationChangeClosedError extends Error {
  override readonly name = 'ConsolidationChangeClosedError';

  readonly code = 'CHANGE_CLOSED';

  constructor(changeID: string, status: string) {
    super(`consolidation change ${changeID} is ${status}, so it takes no comment`);
  }
}
