export class WriterLockHeldError extends Error {
  override readonly name = 'WriterLockHeldError';

  constructor() {
    super('writer lock held by another process');
  }
}
