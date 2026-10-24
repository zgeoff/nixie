export class PromptProposalNotFoundError extends Error {
  override readonly name = 'PromptProposalNotFoundError';

  readonly code = 'NOT_FOUND';

  constructor(proposalID: string) {
    super(`no prompt proposal ${proposalID} exists`);
  }
}
