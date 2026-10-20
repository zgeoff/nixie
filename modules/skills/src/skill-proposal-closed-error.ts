import type { SkillProposalOutcome } from './types';

// The skill proposal no longer waits for an answer: it was approved, rejected or lapsed, or its
// lapse time passed.
export class SkillProposalClosedError extends Error {
  override readonly name = 'SkillProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  readonly outcome: SkillProposalOutcome;

  constructor(proposalID: string, outcome: SkillProposalOutcome) {
    super(`skill proposal ${proposalID} is ${outcome}, so it takes no answer`);

    this.outcome = outcome;
  }
}
