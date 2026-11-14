export class RetirementEditError extends Error {
  override readonly name = 'RetirementEditError';

  readonly code = 'RETIREMENT_EDIT';

  constructor(proposalID: string) {
    super(`memory proposal ${proposalID} retires an item, so it takes no edited text`);
  }
}
