import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';

// The proposals that a write of any of these threads merged into.
export async function readMergedProposalIDs(
  db: Kysely<unknown>,
  threads: readonly string[],
): Promise<ReadonlySet<string>> {
  if (threads.length === 0) {
    return new Set();
  }

  const merges = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposal_merges')
    .select('proposal_id')
    .distinct()
    .where('thread', 'in', [...threads])
    .execute();

  return new Set(merges.map((merge) => merge.proposal_id));
}
