import { canMoveProposal, proposalLapseMs } from '@heynixie/proposals';
import { PromptProposalClosedError } from './prompt-proposal-closed-error';
import { PromptProposalHashError } from './prompt-proposal-hash-error';
import { PromptProposalNotFoundError } from './prompt-proposal-not-found-error';
import { PromptProposalStaleError } from './prompt-proposal-stale-error';
import type { PromptProposalAnswer, PromptProposalState } from './types';

export interface PromptAnswerFacts {
  readonly answer: PromptProposalAnswer;
  readonly state: PromptProposalState | undefined;
  readonly now: number;
  readonly currentHash: string | null;
}

export type PromptAnswerRefusal =
  | PromptProposalNotFoundError
  | PromptProposalClosedError
  | PromptProposalHashError
  | PromptProposalStaleError;

export function findPromptAnswerRefusal(facts: PromptAnswerFacts): PromptAnswerRefusal | null {
  const answer = facts.answer;
  const state = facts.state;

  if (state === undefined) {
    return new PromptProposalNotFoundError(answer.proposalID);
  }

  const isPastLapse = state.proposedAt + proposalLapseMs <= facts.now;
  const status = state.outcome ?? (isPastLapse ? 'lapsed' : 'pending');
  const outcome = answer.answer === 'approve' ? 'approved' : 'rejected';

  if (!canMoveProposal(status, outcome)) {
    return new PromptProposalClosedError(answer.proposalID, status);
  }

  if (state.proposal.proposalHash !== answer.proposalHash) {
    return new PromptProposalHashError(answer.proposalID);
  }

  if (answer.answer === 'approve' && facts.currentHash !== state.proposal.baseHash) {
    return new PromptProposalStaleError(answer.proposalID);
  }

  return null;
}
