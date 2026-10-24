import type { ProposalStatus } from '@heynixie/proposals';

export class PromptProposalClosedError extends Error {
  override readonly name = 'PromptProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  readonly outcome: ProposalStatus;

  constructor(proposalID: string, outcome: ProposalStatus) {
    super(`prompt proposal ${proposalID} is ${outcome}, so it takes no answer`);

    this.outcome = outcome;
  }
}
