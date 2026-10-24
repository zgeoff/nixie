export class PromptProposalHashError extends Error {
  override readonly name = 'PromptProposalHashError';

  readonly code = 'PROPOSAL_HASH';

  constructor(proposalID: string) {
    super(`the answer to prompt proposal ${proposalID} names another proposal hash`);
  }
}
