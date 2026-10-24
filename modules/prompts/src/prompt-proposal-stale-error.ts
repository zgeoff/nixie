export class PromptProposalStaleError extends Error {
  override readonly name = 'PromptProposalStaleError';

  readonly code = 'STALE_BASE';

  constructor(proposalID: string) {
    super(`the override in force moved past the one prompt proposal ${proposalID} replaces`);
  }
}
