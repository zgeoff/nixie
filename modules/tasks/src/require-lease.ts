import type { Transaction } from 'kysely';
import { LeaseLostError } from './lease-lost-error';
import type { Lease, TasksTables } from './types';

// Throws LeaseLostError unless the lease still stands as claimed: same holder, same generation and
// not yet expired. A write that work makes calls it first inside its own transaction, which BEGIN
// IMMEDIATE serializes against every claim, so a runner whose lease lapsed commits nothing.
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
