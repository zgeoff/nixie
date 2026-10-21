import { canMoveSkillProposal } from './can-move-skill-proposal';
import { SkillProposalClosedError } from './skill-proposal-closed-error';
import { SkillProposalHashError } from './skill-proposal-hash-error';
import { skillProposalLapseMs } from './skill-proposal-lapse-ms';
import { SkillProposalNotFoundError } from './skill-proposal-not-found-error';
import { SkillProposalStaleError } from './skill-proposal-stale-error';
import type { SkillProposalAnswer, SkillProposalState } from './types';

export interface AnswerFacts {
  readonly answer: SkillProposalAnswer;
  readonly state: SkillProposalState | undefined;
  readonly now: number;
  readonly currentHash: string | null;
}

export type AnswerRefusal =
  | SkillProposalNotFoundError
  | SkillProposalClosedError
  | SkillProposalHashError
  | SkillProposalStaleError;

export function findAnswerRefusal(facts: AnswerFacts): AnswerRefusal | null {
  const answer = facts.answer;
  const state = facts.state;

  if (state === undefined) {
    return new SkillProposalNotFoundError(answer.proposalID);
  }

  const isPastLapse = state.proposedAt + skillProposalLapseMs <= facts.now;
  const status = state.outcome ?? (isPastLapse ? 'lapsed' : 'pending');
  const outcome = answer.answer === 'approve' ? 'approved' : 'rejected';

  if (!canMoveSkillProposal(status, outcome)) {
    return new SkillProposalClosedError(answer.proposalID, status);
  }

  if (state.proposal.skillHash !== answer.skillHash) {
    return new SkillProposalHashError(answer.proposalID);
  }

  if (facts.currentHash !== state.proposal.baseHash) {
    return new SkillProposalStaleError(answer.proposalID);
  }

  return null;
}
