import type { Projection } from '@heynixie/log';
import { parseProposalRecord } from './parse-proposal-record';
import type { MemoryTables } from './types';

// One row per write that merged into a pending proposal, with who proposed the change again, so a
// proposal lists every source that proposed it.
export const memoryProposalMergesProjection: Projection = {
  table: 'memory_proposal_merges',
  keyColumn: 'merge_id',
  fold: async (tx, record) => {
    const parsed = parseProposalRecord(record);

    if (parsed?.kind !== 'memory.proposal_merged') {
      return [];
    }

    await tx
      .$extendTables<MemoryTables>()
      .insertInto('memory_proposal_merges')
      .values({
        merge_id: parsed.mergeID,
        proposal_id: parsed.proposalID,
        origin: parsed.origin,
        task_id: parsed.taskID,
        thread: record.thread,
        model: parsed.model,
        sequence: record.sequence,
        recorded_at: record.recordedAt.getTime(),
      })
      .execute();

    return [parsed.mergeID];
  },
};
