import { buildProposalRecord } from './build-proposal-record';
import { buildWriteGroup } from './build-write-group';
import { createSealedProposal } from './create-sealed-proposal';
import type { ContentGateResult, WriteCaller } from './gate-types';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { StoreParts } from './types';
import type { GateBatch, GateVerdict, StagedWrite } from './writer-types';

export interface ReviewedWrite {
  readonly write: StagedWrite;
  readonly review: Extract<ContentGateResult, { readonly status: 'review' }>;

  // the text the proposal holds: the staged text, or the item's text for a retirement
  readonly text: string;
}

export interface BatchProposal {
  readonly verdict: Extract<GateVerdict, { readonly outcome: 'propose' }>;

  // the new item whose key the proposal created, or null for a change to an existing item
  readonly newItemID: string | null;
}

// Seals a batch write's proposal and builds its record, which the batch publishes. The proposal
// names the writer as its caller and groups by the batch's bounds for the cap and the notice.
export async function createBatchProposal(
  parts: StoreParts,
  reviewed: ReviewedWrite,
  batch: GateBatch,
): Promise<BatchProposal> {
  const batchID = `${String(batch.bounds.start)}-${String(batch.bounds.end)}`;
  const caller: WriteCaller = {
    origin: 'memory_writer',
    thread: memoryWriterTaskID,
    taskID: memoryWriterTaskID,
    runID: batchID,
    model: batch.model,
    batchID,
  };
  const review = reviewed.review;
  const plan = {
    operation: reviewed.write.op,
    target: reviewed.write.target,
    isPinned: false,
    text: reviewed.text,
    quote: reviewed.write.quote,
    reason: review.reason,
    evidence: review.evidence,
    checks: review.checks,
    checkerReason: review.checkerReason,
    caller,
    group: buildWriteGroup(caller, null),
  };
  const sealed = await createSealedProposal(parts, plan);

  return {
    verdict: {
      outcome: 'propose',
      reason: review.reason,
      records: [buildProposalRecord(parts, { plan, sealed })],
    },
    newItemID: plan.target === null ? sealed.itemID : null,
  };
}
