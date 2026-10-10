// Another live process holds the writer lock on the data directory, so this one must not write.
export class WriterLockHeldError extends Error {
  override readonly name = 'WriterLockHeldError';

  constructor() {
    super('writer lock held by another process');
  }
}
