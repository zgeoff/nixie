import type { JSONObject } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { buildMergeRecord } from './build-merge-record';
import type { WriteGroup } from './build-write-group';
import { createSealedProposal } from './create-sealed-proposal';
import { findMatchingProposal } from './find-matching-proposal';
import type { ReviewReason, WriteCaller } from './gate-types';
import type { MemorySubject, MemoryTables, QuoteEvidence, StoreParts } from './types';
import type { PendingProposal } from './write-proposal-record';
import { writeProposalRecord } from './write-proposal-record';

export interface ProposalPlan {
  readonly operation: 'remember' | 'retire';

  // the item to edit or retire and the version the caller read, or null for a new item
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

  // the subject of the item the proposal creates or changes, owner when unset
  readonly subject?: MemorySubject;
}

// The proposal a write made, or the pending one it merged into.
export interface WrittenProposal {
  readonly proposalID: string;
  readonly merged: boolean;
}

// Writes a memory proposal bound to its exact operation, sealed under its item's key; a new item's
// proposal creates that item's key. A write of the same change as a pending proposal merges into
// it, before any key exists and again inside the proposal's transaction for a race.
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
    // a new item's key seals nothing but this proposal, so a proposal that never landed drops it
    if (plan.target === null) {
      await removeRecordKey(log, sealed.itemID);
    }

    throw error;
  });

  // a merge that raced in leaves the new item's key sealing nothing
  if (written.merged && plan.target === null) {
    await removeRecordKey(log, sealed.itemID);
  }

  return written;
}

// merges the write into a pending proposal of the same change, or returns null when none waits
async function writePendingMerge(
  tx: Transaction<unknown>,
  parts: StoreParts,
  plan: ProposalPlan,
): Promise<WrittenProposal | null> {
  const match = await findMatchingProposal(tx.$extendTables<MemoryTables>(), parts, plan);

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
