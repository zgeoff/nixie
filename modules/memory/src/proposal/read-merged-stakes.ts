import type { ProposalStake } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { MemoryTables } from '../types';

// The stakes of the writes that merged into a proposal, which also hear its settlement: one per
// thread, at the thread's first merge.
export async function readMergedStakes(
  tx: Transaction<unknown>,
  proposalID: string,
): Promise<readonly ProposalStake[]> {
  const merges = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposal_merges')
    .select(['thread', 'sequence'])
    .where('proposal_id', '=', proposalID)
    .orderBy('sequence', 'asc')
    .execute();

  const stakes = new Map<string, ProposalStake>();

  for (const merge of merges) {
    if (merge.thread !== null && !stakes.has(merge.thread)) {
      stakes.set(merge.thread, { thread: merge.thread, sequence: merge.sequence });
    }
  }

  return [...stakes.values()];
}
