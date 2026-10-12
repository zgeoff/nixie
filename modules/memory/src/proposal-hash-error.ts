// The answer names an action hash that is not the proposal's, so the screen it came from showed
// another operation, and nothing applies.
export class ProposalHashError extends Error {
  override readonly name = 'ProposalHashError';
  readonly code = 'PROPOSAL_HASH';

  constructor(proposalID: string) {
    super(`the answer to memory proposal ${proposalID} names another action hash`);
  }
}
