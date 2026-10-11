import type { Lease } from './types';

// The lease expired or another runner claimed the work since, so this runner must commit nothing.
export class LeaseLostError extends Error {
  override readonly name = 'LeaseLostError';

  constructor(lease: Lease) {
    super(`lease lost on ${lease.kind} ${lease.workID} at generation ${lease.generation}`);
  }
}
