import invariant from 'tiny-invariant';
import { claimLease } from '../claim-lease';
import type { Lease, LeaseKind, TasksContext } from '../types';

export interface TestLeaseRequest {
  readonly kind: LeaseKind;
  readonly workID: string;
  readonly holder: string;
  readonly durationMs: number;
}

export async function claimTestLease(
  context: TasksContext,
  request: TestLeaseRequest,
): Promise<Lease> {
  const lease = await claimLease(context, {
    kind: request.kind,
    holder: request.holder,
    durationMs: request.durationMs,
    readCandidate: () => Promise.resolve(request.workID),
  });

  invariant(lease);

  return lease;
}
