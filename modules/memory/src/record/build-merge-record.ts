import type { RecordInput } from '@heynixie/log';
import type { MemoryProposalRow } from '../gate/gate-context';
import type { ProposalPlan } from '../memory/write-memory-proposal';
import { buildProposalLapseTime } from '../proposal/build-proposal-lapse-time';
import type { StoreParts } from '../types';

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
