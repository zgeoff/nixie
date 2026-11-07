import { canMoveProposal, proposalLapseMs } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
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

// A pending proposal still holds the seeded version of each rule it widens: every write that moves
// one either withdraws the proposal in the same transaction or touches only a rule it never holds.
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

  invariant(
    state.proposal.changes.every(
      (change) => (input.seeded.get(change.ruleID) ?? null) === (change.before?.hash ?? null),
    ),
    `the seeded rules moved past the pending proposal ${answer.proposalID}`,
  );

  return { status: 'approved', proposal: state.proposal };
}

function refuse(code: RuleProposalRefusal, reason: string): RuleProposalMove {
  return { status: 'refused', code, reason };
}
