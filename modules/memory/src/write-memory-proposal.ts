import type { JSONObject } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildMergeRecord } from './build-merge-record';
import type { WriteGroup } from './build-write-group';
import { createSealedProposal } from './create-sealed-proposal';
import type { ReviewReason, WriteCaller } from './gate-types';
import { readMatchingProposal } from './read-matching-proposal';
import type {
  MemorySubject,
  MemoryTables,
  ProposalOperationKind,
  QuoteEvidence,
  StoreParts,
} from './types';
import type { PendingProposal } from './write-proposal-record';
import { writeProposalRecord } from './write-proposal-record';

export interface ProposalPlan {
  readonly operation: ProposalOperationKind;

  readonly target: { readonly itemID: string; readonly version: number } | null;
  readonly isPinned: boolean;
  readonly text: string;
  readonly quote: string | null;
  readonly reason: ReviewReason;
  readonly evidence: QuoteEvidence | null;
  readonly checks: JSONObject;
  readonly checkerReason: string | null;
  readonly caller: WriteCaller;
  readonly group: WriteGroup;

  readonly subject?: MemorySubject;

  readonly newSubject?: MemorySubject;

  readonly isSensitive?: boolean;

  readonly until?: number | null;
}

export interface WrittenProposal {
  readonly proposalID: string;
  readonly merged: boolean;
}

export async function writeMemoryProposal(
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<WrittenProposal> {
  const log = parts.context.log;

  const merged = await withWriteTransaction(log.writer, (tx) => writePendingMerge(tx, parts, plan));

  if (merged !== null) {
    return merged;
  }

  const sealed = await createSealedProposal(parts, plan);

  const written = await withWriteTransaction(log.writer, (tx) =>
    writeProposalOrMerge(tx, parts, { plan, sealed }),
  ).catch(async (error: unknown) => {
    if (plan.target === null) {
      await removeRecordKey(log, sealed.itemID);
    }

    throw error;
  });

  if (written.merged && plan.target === null) {
    await removeRecordKey(log, sealed.itemID);
  }

  return written;
}

async function writePendingMerge(
  tx: Transaction<unknown>,
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<WrittenProposal | null> {
  const match = await readMatchingProposal(tx.$extendTables<MemoryTables>(), parts, plan);

  if (match === null) {
    return null;
  }

  await writeRecordsInTransaction(tx, parts.context.log, [
    buildMergeRecord(parts, { proposal: match, plan }),
  ]);

  return { proposalID: match.proposal_id, merged: true };
}

async function writeProposalOrMerge(
  tx: Transaction<unknown>,
  parts: StoreParts,
  pending: PendingProposal,
): Promise<WrittenProposal> {
  const merged = await writePendingMerge(tx, parts, pending.plan);

  if (merged !== null) {
    return merged;
  }

  await writeProposalRecord(tx, parts, pending);

  return { proposalID: pending.sealed.proposalID, merged: false };
}
