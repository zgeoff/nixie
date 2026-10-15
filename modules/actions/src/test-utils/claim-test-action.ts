import type { Lease, TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { claimAction } from '../claim-action';

export interface TestActionClaim {
  readonly holder: string;
  readonly leaseMs: number;
}

// Claims the next due action for the holder, as an action runner does once a step queued one.
export async function claimTestAction(
  context: TasksContext,
  request: TestActionClaim,
): Promise<Lease> {
  const lease = await claimAction(context, request);

  // the caller queued an action that is due, so the claim takes it
  invariant(lease);

  return lease;
}
