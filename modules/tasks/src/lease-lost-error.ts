import type { Lease } from './types';

export class LeaseLostError extends Error {
  override readonly name = 'LeaseLostError';

  constructor(lease: Lease) {
    super(`lease lost on ${lease.kind} ${lease.workID} at generation ${lease.generation}`);
  }
}
