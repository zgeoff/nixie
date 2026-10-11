import type { Transaction } from 'kysely';
import type { Lease, TasksTables } from './types';

// Frees the work for the next claim once its runner has committed. The generation stays, so the
// next claim takes the one after it.
export async function resetLease(tx: Transaction<unknown>, lease: Lease): Promise<void> {
  await tx
    .$extendTables<TasksTables>()
    .updateTable('leases')
    .set({ holder: null, expires_at: null })
    .where('kind', '=', lease.kind)
    .where('work_id', '=', lease.workID)
    .where('generation', '=', lease.generation)
    .execute();
}
