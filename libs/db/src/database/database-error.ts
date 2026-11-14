export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';

  readonly code: string | undefined;

  constructor(message: string, code: string | undefined) {
    super(message);

    this.code = code;
  }
}
