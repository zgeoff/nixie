import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildMergeRecord } from './build-merge-record';
import { findMatchingProposal } from './find-matching-proposal';
import type { MemoryTables, StoreParts } from './types';
import type { GatedWrite } from './write-memory-batch';

export interface PublishedRecords {
  // the writes the batch kept once every source was read again
  readonly kept: readonly GatedWrite[];

  // the batch's own records, such as the advanced cursor and the notice
  readonly records: readonly RecordInput[];
}

// Writes a batch's proposals, then its own records, inside the publish transaction. A proposal that
// makes the same change as a pending one merges into it, one proposal at a time, so two proposals of
// one change in a batch make one. Release removes the key of a merged new item's proposal.
export async function writePublishedRecords(
  parts: StoreParts,
  tx: Transaction<unknown>,
  published: PublishedRecords,
): Promise<void> {
  for (const gated of published.kept) {
    await writeProposalRecords(parts, tx, gated);
  }

  await writeRecordsInTransaction(tx, parts.context.log, published.records);
}

async function writeProposalRecords(
  parts: StoreParts,
  tx: Transaction<unknown>,
  gated: GatedWrite,
): Promise<void> {
  const verdict = gated.verdict;

  if (verdict.outcome !== 'propose') {
    return;
  }

  const plan = verdict.plan;

  const match =
    plan === null
      ? null
      : await findMatchingProposal(tx.$extendTables<MemoryTables>(), parts, plan);

  const records =
    match === null || plan === null
      ? verdict.records
      : [buildMergeRecord(parts, { proposal: match, plan })];

  await writeRecordsInTransaction(tx, parts.context.log, records);
}
