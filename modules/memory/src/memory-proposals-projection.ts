import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { getRowSubject } from './get-row-subject';
import type { ProposalRecord } from './parse-proposal-record';
import { parseProposalRecord } from './parse-proposal-record';
import { parseSubjectRecord } from './parse-subject-record';
import type { MemoryTables } from './types';

// One row per memory proposal, with its review reason and its status. A proposal waits as pending
// until your approval consumes it, your rejection closes it, or it lapses. Its text stays sealed
// under the item's key, so a forget of the item leaves the proposal unreadable too.
export const memoryProposalsProjection: Projection = {
  table: 'memory_proposals',
  keyColumn: 'proposal_id',
  fold: async (tx, record) => {
    const marked = parseSubjectRecord(record);

    // a new item's subject mark follows its proposal, and changes only the proposal's subject, with
    // the kind the release before reads
    if (marked?.target === 'proposal') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_proposals')
        .set({ subject: marked.subject, kind: marked.subject === 'self' ? 'self' : 'fact' })
        .where('proposal_id', '=', marked.proposalID)
        .execute();

      return [marked.proposalID];
    }

    const parsed = parseProposalRecord(record);

    if (parsed === null) {
      return [];
    }

    await writeProposalChange(tx.$extendTables<MemoryTables>(), record, parsed);

    return [parsed.proposalID];
  },
};

// A merge's source sits in the merges projection, and here it only pushes the lapse time back.
async function writeProposalChange(
  db: Kysely<MemoryTables>,
  record: EnvelopeRecord,
  parsed: ProposalRecord,
): Promise<void> {
  if (parsed.kind === 'memory.proposed') {
    await writeProposalRow(db, record, parsed);

    return;
  }

  if (parsed.kind === 'memory.proposal_merged') {
    await db
      .updateTable('memory_proposals')
      .set((eb) => ({ lapse_at: eb.fn('max', ['lapse_at', eb.val(parsed.lapseAt)]) }))
      .where('proposal_id', '=', parsed.proposalID)
      .execute();

    return;
  }

  await db
    .updateTable('memory_proposals')
    .set({ status: statusAfter[parsed.kind], resolved_sequence: record.sequence })
    .where('proposal_id', '=', parsed.proposalID)
    .execute();
}

async function writeProposalRow(
  db: Kysely<MemoryTables>,
  record: EnvelopeRecord,
  parsed: Extract<ProposalRecord, { readonly kind: 'memory.proposed' }>,
): Promise<void> {
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
      ...(await readProposalSubject(db, parsed)),
    })
    .execute();
}

// a proposal for a change to an item takes that item's subject, whoever proposed it; a new item's
// proposal starts as owner, and a subject's mark that follows it changes that
async function readProposalSubject(
  db: Kysely<MemoryTables>,
  parsed: Extract<ProposalRecord, { readonly kind: 'memory.proposed' }>,
): Promise<Pick<MemoryTables['memory_proposals'], 'kind' | 'subject'>> {
  if (parsed.isNewItem) {
    return { kind: 'fact', subject: 'owner' };
  }

  const item = await db
    .selectFrom('memory_items')
    .select(['kind', 'subject'])
    .where('item_id', '=', parsed.itemID)
    .executeTakeFirst();

  return item === undefined
    ? { kind: 'fact', subject: 'owner' }
    : { kind: item.kind, subject: getRowSubject(item) };
}

const statusAfter = {
  'memory.approval_recorded': 'consumed',
  'memory.proposal_rejected': 'rejected',
  'memory.proposal_lapsed': 'lapsed',
} as const;
