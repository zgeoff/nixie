import type { RecordInput } from '@heynixie/log';
import type { StoreParts } from '../types';
import { buildProposalLapseTime } from './build-proposal-lapse-time';
import type { PendingProposal } from './write-proposal-record';

const proposalMarkKinds = {
  self: 'memory.proposal_self_noted',
  shared: 'memory.proposal_shared_noted',
} as const;

export function buildProposalRecords(
  parts: Pick<StoreParts, 'context'>,
  pending: PendingProposal,
): readonly RecordInput[] {
  const plan = pending.plan;
  const gate = parts.context.gate;
  const { sealedLabels, ...sealed } = pending.sealed;

  const proposed: RecordInput = {
    kind: 'memory.proposed',
    definitions: parts.context.definitions(),
    thread: plan.caller.thread,
    contentSource: 'untrusted',
    payload: {
      ...sealed,
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
      lapseAt: buildProposalLapseTime(gate.clock.now(), gate.limits, plan.until),
    },
  };

  const labelled: readonly RecordInput[] =
    sealedLabels === undefined
      ? []
      : [
          {
            kind: 'memory.proposal_labelled',
            definitions: parts.context.definitions(),
            thread: plan.caller.thread,
            contentSource: 'untrusted',
            payload: {
              proposalID: sealed.proposalID,
              itemID: sealed.itemID,
              sealed: sealedLabels,
              targetRevision: plan.targetRevision ?? null,
              isLabelOnly: plan.isLabelOnly === true,
            },
          },
        ];

  if (plan.target !== null) {
    return plan.newSubject === undefined
      ? [proposed, ...labelled]
      : [
          proposed,
          {
            kind: 'memory.proposal_subject_changed',
            definitions: parts.context.definitions(),
            thread: plan.caller.thread,
            payload: { proposalID: pending.sealed.proposalID, subject: plan.newSubject },
          },
          ...labelled,
        ];
  }

  const subject = plan.subject ?? 'owner';

  const markKinds = [
    ...(subject === 'owner' ? [] : [proposalMarkKinds[subject]]),
    ...(plan.isSensitive === true ? ['memory.proposal_sensitive_noted' as const] : []),
  ];

  return [
    proposed,
    ...labelled,
    ...markKinds.map((kind) => ({
      kind,
      definitions: parts.context.definitions(),
      thread: plan.caller.thread,
      payload: { proposalID: pending.sealed.proposalID },
    })),
  ];
}
