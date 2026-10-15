// No memory proposal has the ID the answer names.
export class MemoryProposalNotFoundError extends Error {
  override readonly name = 'MemoryProposalNotFoundError';

  readonly code = 'NOT_FOUND';

  constructor(proposalID: string) {
    super(`no memory proposal ${proposalID} exists`);
  }
}
