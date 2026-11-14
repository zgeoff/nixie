export class ProposalClosedError extends Error {
  override readonly name = 'ProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  readonly status: string;

  constructor(proposalID: string, status: string) {
    super(`memory proposal ${proposalID} is ${status}, so it takes no answer`);

    this.status = status;
  }
}
