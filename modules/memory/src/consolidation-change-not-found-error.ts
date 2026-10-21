export class ConsolidationChangeNotFoundError extends Error {
  override readonly name = 'ConsolidationChangeNotFoundError';

  readonly code = 'NOT_FOUND';

  constructor(changeID: string) {
    super(`no consolidation change ${changeID} exists`);
  }
}
