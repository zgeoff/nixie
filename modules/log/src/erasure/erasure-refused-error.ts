// `action_not_finished` is a record whose queued action has not run. `already_begun` is a target
// whose erasure is open already, or a record whose erasure ended.
export type ErasureRefusal = 'not_found' | 'stale' | 'action_not_finished' | 'already_begun';

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
