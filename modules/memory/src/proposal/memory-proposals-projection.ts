import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { proposalsSettledCodec } from '@heynixie/proposals';
import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { parseLabelRecord } from '../utils/record/parse-label-record';
import type { ProposalRecord } from '../utils/record/parse-proposal-record';
import { parseProposalRecord } from '../utils/record/parse-proposal-record';
import { parseSubjectRecord } from '../utils/record/parse-subject-record';

export const memoryProposalsProjection: Projection = {
  table: 'memory_proposals',
  keyColumn: 'proposal_id',
  fold: async (tx, record) => {
    if (record.kind === proposalsSettledCodec.kind) {
      const settled = proposalsSettledCodec.decode(record.payload);

      if (settled.family !== 'memory') {
        return [];
      }

      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_proposals')
        .set({ resolved_sequence: record.sequence })
        .where('proposal_id', '=', settled.proposalID)
        .where('resolved_sequence', 'is', null)
        .execute();

      return [settled.proposalID];
    }

    const marked = parseSubjectRecord(record);

    if (marked?.target === 'proposal_change') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_proposals')
        .set({ new_subject: marked.subject })
        .where('proposal_id', '=', marked.proposalID)
        .execute();

      return [marked.proposalID];
    }

    if (marked?.target === 'proposal') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_proposals')
        .set({ subject: marked.subject, kind: marked.subject === 'self' ? 'self' : 'fact' })
        .where('proposal_id', '=', marked.proposalID)
        .execute();

      return [marked.proposalID];
    }

    const labelled = parseLabelRecord(record);

    if (labelled?.kind === 'memory.proposal_labelled') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_proposals')
        .set({
          sealed_labels: labelled.sealed,
          target_revision: labelled.targetRevision,
          is_label_only: labelled.isLabelOnly ? 1 : 0,
        })
        .where('proposal_id', '=', labelled.proposalID)
        .execute();

      return [labelled.proposalID];
    }

    const parsed = parseProposalRecord(record);

    if (parsed === null) {
      return [];
    }

    await writeProposalChange(tx.$extendTables<MemoryTables>(), record, parsed);

    return [parsed.proposalID];
  },
};

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
    return;
  }

  await db
    .updateTable('memory_proposals')
    .set({ resolved_sequence: record.sequence })
    .where('proposal_id', '=', parsed.proposalID)
    .where('resolved_sequence', 'is', null)
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
      resolved_sequence: null,
      new_subject: null,
      sealed_labels: null,
      target_revision: null,
      is_label_only: 0,
      ...(await readProposalSubject(db, parsed)),
    })
    .execute();
}

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
