import type { RecordInput } from '@heynixie/log';
import type { StoreParts } from './types';
import type { PendingProposal } from './write-proposal-record';

// The memory.proposed record of a sealed proposal, with its lapse time from the gate's clock. Its
// text stays sealed, so the record's own content source is untrusted. A new self-note's proposal
// takes a mark of its own after it, which the release before skips.
export function buildProposalRecords(
  parts: Pick<StoreParts, 'context'>,
  pending: PendingProposal,
): readonly RecordInput[] {
  const plan = pending.plan;
  const gate = parts.context.gate;

  const proposed: RecordInput = {
    kind: 'memory.proposed',
    definitions: parts.context.definitions(),
    thread: plan.caller.thread,
    contentSource: 'untrusted',
    payload: {
      ...pending.sealed,
      isNewItem: plan.target === null,
      operation: plan.operation,
      targetVersion: plan.target?.version ?? null,
      isPinned: plan.isPinned,
      reviewReason: plan.reason,
      evidence: plan.evidence === null ? null : { ...plan.evidence },
      origin: plan.caller.origin,
      source: 'untrusted',
      taskID: plan.caller.taskID,
      capGroup: plan.group.capGroup,
      checks: plan.checks,
      model: plan.caller.model,
      noticeKey: plan.group.noticeKey,
      lapseAt: gate.clock.now() + gate.limits.proposalLapseMs,
    },
  };

  if (plan.target !== null || plan.itemKind !== 'self') {
    return [proposed];
  }

  return [
    proposed,
    {
      kind: 'memory.proposal_self_noted',
      definitions: parts.context.definitions(),
      thread: plan.caller.thread,
      payload: { proposalID: pending.sealed.proposalID },
    },
  ];
}
