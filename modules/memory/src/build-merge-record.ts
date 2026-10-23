import type { RecordInput } from '@heynixie/log';
import { buildProposalLapseTime } from './build-proposal-lapse-time';
import type { MemoryProposalRow } from './gate-types';
import type { StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';

export interface ProposalMerge {
  readonly proposal: MemoryProposalRow;
  readonly plan: ProposalPlan;
}

export function buildMergeRecord(
  parts: Pick<StoreParts, 'context'>,
  merge: ProposalMerge,
): RecordInput {
  const plan = merge.plan;

  return {
    kind: 'memory.proposal_merged',
    definitions: parts.context.definitions(),
    thread: plan.caller.thread,
    payload: {
      mergeID: crypto.randomUUID(),
      proposalID: merge.proposal.proposal_id,
      itemID: merge.proposal.item_id,
      origin: plan.caller.origin,
      taskID: plan.caller.taskID,
      model: plan.caller.model,
      noticeKey: plan.group.noticeKey,
      lapseAt: buildProposalLapseTime(
        parts.context.gate.clock.now(),
        parts.context.gate.limits,
        plan.until,
      ),
    },
  };
}
