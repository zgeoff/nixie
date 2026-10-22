import type { ProposalStatus } from '@heynixie/proposals';

export class SkillProposalClosedError extends Error {
  override readonly name = 'SkillProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  readonly outcome: ProposalStatus;

  constructor(proposalID: string, outcome: ProposalStatus) {
    super(`skill proposal ${proposalID} is ${outcome}, so it takes no answer`);

    this.outcome = outcome;
  }
}
