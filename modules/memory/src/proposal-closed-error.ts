// The proposal no longer waits for an answer: it was approved, rejected or lapsed, or its lapse
// time passed.
export class ProposalClosedError extends Error {
  override readonly name = 'ProposalClosedError';

  readonly code = 'PROPOSAL_CLOSED';

  constructor(proposalID: string, status: string) {
    super(`memory proposal ${proposalID} is ${status}, so it takes no answer`);
  }
}
