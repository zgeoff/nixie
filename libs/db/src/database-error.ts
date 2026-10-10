// An error that SQLite raised in the worker, carried across to the main thread with its result
// code, such as SQLITE_BUSY or SQLITE_CONSTRAINT_UNIQUE.
export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';

  readonly code: string | undefined;

  constructor(message: string, code: string | undefined) {
    super(message);
    this.code = code;
  }
}
