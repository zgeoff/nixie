import type { Transaction } from 'kysely';
import { LeaseLostError } from './lease-lost-error';
import type { Lease, TasksTables } from './types';

// The caller must run this inside its own write transaction, before its writes. BEGIN IMMEDIATE
// then serializes the check against every claim.
export async function requireLease(
  tx: Transaction<unknown>,
  lease: Lease,
  now: number,
): Promise<void> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select('generation')
    .where('kind', '=', lease.kind)
    .where('work_id', '=', lease.workID)
    .where('holder', '=', lease.holder)
    .where('generation', '=', lease.generation)
    .where('expires_at', '>', now)
    .executeTakeFirst();

  if (row === undefined) {
    throw new LeaseLostError(lease);
  }
}
