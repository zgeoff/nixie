import type { Projection } from '@heynixie/log';
import { parseProposalRecord } from './parse-proposal-record';
import type { MemoryTables } from './types';

// One row per memory proposal, with its review reason and its status. A proposal waits as pending
// until your approval consumes it, your rejection closes it, or it lapses. Its text stays sealed
// under the item's key, so a forget of the item leaves the proposal unreadable too.
export const memoryProposalsProjection: Projection = {
  table: 'memory_proposals',
  keyColumn: 'proposal_id',
  fold: async (tx, record) => {
    const parsed = parseProposalRecord(record);

    // a merge adds a source to its proposal, which the merges projection holds
    if (parsed === null || parsed.kind === 'memory.proposal_merged') {
      return [];
    }
    const db = tx.$extendTables<MemoryTables>();

    if (parsed.kind === 'memory.proposed') {
      await db
        .insertInto('memory_proposals')
        .values({
          proposal_id: parsed.proposalID,
          item_id: parsed.itemID,
          is_new_item: parsed.isNewItem ? 1 : 0,
          operation: parsed.operation,
          target_version: parsed.targetVersion,
          is_pinned: parsed.isPinned ? 1 : 0,
          review_reason: parsed.reviewReason,
          status: 'pending',
          action_hash: parsed.actionHash,
          sealed: parsed.sealed,
          evidence: parsed.evidence === null ? null : JSON.stringify(parsed.evidence),
          origin: parsed.origin,
          source: parsed.source,
          task_id: parsed.taskID,
          thread: record.thread,
          cap_group: parsed.capGroup,
          checks: parsed.checks === null ? null : JSON.stringify(parsed.checks),
          model: parsed.model,
          notice_key: parsed.noticeKey,
          created_sequence: record.sequence,
          created_at: record.recordedAt.getTime(),
          lapse_at: parsed.lapseAt,
          resolved_sequence: null,
        })
        .execute();
      return [parsed.proposalID];
    }
    await db
      .updateTable('memory_proposals')
      .set({ status: statusAfter[parsed.kind], resolved_sequence: record.sequence })
      .where('proposal_id', '=', parsed.proposalID)
      .execute();
    return [parsed.proposalID];
  },
};

const statusAfter = {
  'memory.approval_recorded': 'consumed',
  'memory.proposal_rejected': 'rejected',
  'memory.proposal_lapsed': 'lapsed',
} as const;
