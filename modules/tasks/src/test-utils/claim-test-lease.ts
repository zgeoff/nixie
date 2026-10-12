import invariant from 'tiny-invariant';
import { claimLease } from '../claim-lease';
import type { Lease, LeaseKind, TasksContext } from '../types';

export interface TestLeaseRequest {
  readonly kind: LeaseKind;
  readonly workID: string;
  readonly holder: string;
  readonly durationMs: number;
}

// Claims the lease on a named piece of work that no runner holds, as a runner claims the work it
// found.
export async function claimTestLease(
  context: TasksContext,
  request: TestLeaseRequest,
): Promise<Lease> {
  const lease = await claimLease(context, {
    kind: request.kind,
    holder: request.holder,
    durationMs: request.durationMs,
    findCandidate: () => Promise.resolve(request.workID),
  });

  // no runner holds the work, so the claim takes it
  invariant(lease);
  return lease;
}
