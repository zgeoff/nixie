import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildMergeRecord } from './build-merge-record';
import { readMatchingProposal } from './read-matching-proposal';
import type { MemoryTables, StoreParts } from './types';
import type { GatedWrite } from './write-memory-batch';

export interface PublishedRecords {
  readonly kept: readonly GatedWrite[];

  readonly records: readonly RecordInput[];
}

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
      : await readMatchingProposal(tx.$extendTables<MemoryTables>(), parts, plan);

  const records =
    match === null || plan === null
      ? verdict.records
      : [buildMergeRecord(parts, { proposal: match, plan })];

  await writeRecordsInTransaction(tx, parts.context.log, records);
}
