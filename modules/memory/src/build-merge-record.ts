import type { RecordInput } from '@heynixie/log';
import type { MemoryProposalRow } from './gate-types';
import type { StoreParts } from './types';
import type { ProposalPlan } from './write-memory-proposal';

// A pending proposal, and the plan of a later write that proposes the same change.
export interface ProposalMerge {
  readonly proposal: MemoryProposalRow;
  readonly plan: ProposalPlan;
}

// The memory.proposal_merged record of a write that proposed the same change as a pending proposal,
// in the second proposer's thread and notice. It names the proposal and who proposed the change
// again, and holds no text, so the proposal stays one card with a second source.
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
    },
  };
}
