export type ErasureRefusal = 'not_found' | 'stale';

// A store's start throws it inside the transaction, so a client action that the caller wrote in the
// same transaction rolls back with the refusal.
export class ErasureRefusedError extends Error {
  override readonly name = 'ErasureRefusedError';

  readonly reason: ErasureRefusal;

  constructor(reason: ErasureRefusal) {
    super(`the erasure is refused as ${reason}`);

    this.reason = reason;
  }
}
