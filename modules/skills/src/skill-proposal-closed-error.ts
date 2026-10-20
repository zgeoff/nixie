import type { SkillProposalStatus } from './types';

// The skill proposal no longer waits for an answer: it was approved, rejected or lapsed, or its
// lapse time passed.
export class SkillProposalClosedError extends Error {
  override readonly name = 'SkillProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  // where the proposal stands, which takes no further close
  readonly outcome: SkillProposalStatus;

  constructor(proposalID: string, outcome: SkillProposalStatus) {
    super(`skill proposal ${proposalID} is ${outcome}, so it takes no answer`);

    this.outcome = outcome;
  }
}
