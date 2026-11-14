export class ProposalHashError extends Error {
  override readonly name = 'ProposalHashError';

  readonly code = 'PROPOSAL_HASH';

  constructor(proposalID: string) {
    super(`the answer to memory proposal ${proposalID} names another action hash`);
  }
}
