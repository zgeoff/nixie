import type { Lease, TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { claimAction } from '../claim-action';

export interface TestActionClaim {
  readonly holder: string;
  readonly leaseMs: number;
}

export async function claimTestAction(
  context: TasksContext,
  request: TestActionClaim,
): Promise<Lease> {
  const lease = await claimAction(context, request);

  invariant(lease);

  return lease;
}
