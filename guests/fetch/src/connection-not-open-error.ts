export class ConnectionNotOpenError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });

    this.name = 'ConnectionNotOpenError';
  }
}
