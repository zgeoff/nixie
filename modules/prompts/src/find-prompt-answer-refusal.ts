import { canMoveProposal, proposalLapseMs } from '@heynixie/proposals';
import type { PromptAnswerRefusal, PromptProposalAnswer, PromptProposalState } from './types';

export interface PromptAnswerFacts {
  readonly answer: PromptProposalAnswer;
  readonly state: PromptProposalState | undefined;
  readonly now: number;
  readonly currentHash: string | null;
}

export function findPromptAnswerRefusal(facts: PromptAnswerFacts): PromptAnswerRefusal | null {
  const answer = facts.answer;
  const state = facts.state;
  const proposalID = answer.proposalID;

  if (state === undefined) {
    return buildRefusal(proposalID, 'NOT_FOUND', `no prompt proposal ${proposalID} exists`);
  }

  const isPastLapse = state.proposedAt + proposalLapseMs <= facts.now;
  const status = state.outcome ?? (isPastLapse ? 'lapsed' : 'pending');
  const outcome = answer.answer === 'approve' ? 'approved' : 'rejected';

  if (!canMoveProposal(status, outcome)) {
    return buildRefusal(
      proposalID,
      'PROPOSAL_CLOSED',
      `prompt proposal ${proposalID} is ${status}, so it takes no answer`,
    );
  }

  if (state.proposal.proposalHash !== answer.proposalHash) {
    return buildRefusal(
      proposalID,
      'PROPOSAL_HASH',
      `the answer to prompt proposal ${proposalID} names another proposal hash`,
    );
  }

  if (answer.answer === 'approve' && facts.currentHash !== state.proposal.baseHash) {
    return buildRefusal(
      proposalID,
      'STALE_BASE',
      `the override in force moved past the one prompt proposal ${proposalID} replaces`,
    );
  }

  return null;
}

function buildRefusal(
  proposalID: string,
  code: PromptAnswerRefusal['code'],
  reason: string,
): PromptAnswerRefusal {
  return { status: 'refused', proposalID, code, reason, problems: [] };
}
