import { removeRecordKey } from '@heynixie/log';
import { buildProposalRecords } from './build-proposal-records';
import { buildWriteGroup } from './build-write-group';
import { createSealedProposal } from './create-sealed-proposal';
import type { ContentGateResult, WriteCaller } from './gate-types';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';
import type { GateBatch, GateVerdict, StagedWrite } from './writer-types';

export interface ReviewedWrite {
  readonly write: StagedWrite;
  readonly review: Extract<ContentGateResult, { readonly status: 'review' }>;

  readonly text: string;

  readonly until?: number | null;
}

export interface BatchProposal {
  readonly verdict: Extract<GateVerdict, { readonly outcome: 'propose' }>;

  readonly newItemID: string | null;
}

export async function createBatchProposal(
  parts: StoreParts,
  reviewed: ReviewedWrite,
  batch: GateBatch,
): Promise<BatchProposal> {
  const plan = buildBatchProposalPlan(reviewed, batch);

  const sealed = await createSealedProposal(parts, plan);

  const newItemID = plan.target === null ? sealed.itemID : null;

  try {
    return {
      verdict: {
        outcome: 'propose',
        reason: plan.reason,
        records: buildProposalRecords(parts, { plan, sealed }),
        plan,
      },
      newItemID,
    };
  } catch (error) {
    if (newItemID !== null) {
      await removeRecordKey(parts.context.log, newItemID);
    }

    throw error;
  }
}

function buildBatchProposalPlan(reviewed: ReviewedWrite, batch: GateBatch): ProposalPlan {
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

  return {
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
    ...(reviewed.write.op === 'remember' && reviewed.write.target === null
      ? {
          subject: reviewed.write.subject,
          ...(reviewed.write.isSensitive === true ? { isSensitive: true } : {}),
        }
      : {}),
    ...(reviewed.until === undefined ? {} : { until: reviewed.until }),
  };
}
