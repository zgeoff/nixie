import type { Transaction } from 'kysely';
import type { MemoryTables } from '../types';

// The threads of the writes that merged into a proposal, which also hear its settlement.
export async function readMergedThreads(
  tx: Transaction<unknown>,
  proposalID: string,
): Promise<readonly string[]> {
  const merges = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposal_merges')
    .select('thread')
    .where('proposal_id', '=', proposalID)
    .execute();

  return [...new Set(merges.flatMap((merge) => (merge.thread === null ? [] : [merge.thread])))];
}
