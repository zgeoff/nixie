import { canMoveProposal, proposalLapseMs } from '@heynixie/proposals';
import type { RuleProposal } from './build-rule-proposal';
import type { RuleProposalState } from './read-rule-proposals';
import type { RuleProposalAnswer, RuleProposalRefusal } from './write-rule-proposal-answer';

type RuleProposalMove =
  | { readonly status: 'approved'; readonly proposal: RuleProposal }
  | { readonly status: 'rejected'; readonly proposal: RuleProposal; readonly reason: string }
  | { readonly status: 'refused'; readonly code: RuleProposalRefusal; readonly reason: string };

interface RuleProposalMoveInput {
  readonly proposals: readonly RuleProposalState[];
  readonly answer: RuleProposalAnswer;
  readonly seeded: ReadonlyMap<string, string>;
  readonly now: number;
}

// The proposal holds each rule's version from before the widening, so an approval applies only
// while the rules seeded from the definitions still hold those versions.
export function pickRuleProposalMove(input: RuleProposalMoveInput): RuleProposalMove {
  const answer = input.answer;
  const state = input.proposals.find((entry) => entry.proposal.proposalID === answer.proposalID);

  if (state === undefined) {
    return refuse('NOT_FOUND', `no rule change proposal has ID ${answer.proposalID}`);
  }

  const isPastLapse = state.proposedAt + proposalLapseMs <= input.now;
  const status = state.outcome ?? (isPastLapse ? 'lapsed' : 'pending');
  const next = answer.answer === 'approve' ? 'approved' : 'rejected';

  if (status === 'withdrawn' || !canMoveProposal(status, next)) {
    return refuse('CLOSED', `the rule change proposal ${answer.proposalID} is ${status}`);
  }

  if (answer.answer === 'reject') {
    return { status: 'rejected', proposal: state.proposal, reason: answer.reason };
  }

  const isCurrent = state.proposal.changes.every(
    (change) => (input.seeded.get(change.ruleID) ?? null) === (change.before?.hash ?? null),
  );

  return isCurrent
    ? { status: 'approved', proposal: state.proposal }
    : refuse(
        'STALE',
        `the rules changed since proposal ${answer.proposalID}, so the next seed proposes again`,
      );
}

function refuse(code: RuleProposalRefusal, reason: string): RuleProposalMove {
  return { status: 'refused', code, reason };
}
