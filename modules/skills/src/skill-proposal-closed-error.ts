import type { SkillProposalStatus } from './types';

export class SkillProposalClosedError extends Error {
  override readonly name = 'SkillProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  readonly outcome: SkillProposalStatus;

  constructor(proposalID: string, outcome: SkillProposalStatus) {
    super(`skill proposal ${proposalID} is ${outcome}, so it takes no answer`);

    this.outcome = outcome;
  }
}
