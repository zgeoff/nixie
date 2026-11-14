export class InvalidCursorError extends Error {
  override readonly name = 'InvalidCursorError';

  readonly code = 'INVALID_CURSOR';

  constructor(cursor: string) {
    super(`the recall cursor ${JSON.stringify(cursor)} is not one a page returned`);
  }
}
