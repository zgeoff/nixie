export class PinEditError extends Error {
  override readonly name = 'PinEditError';

  readonly code = 'PIN_EDIT';

  constructor(proposalID: string) {
    super(`memory proposal ${proposalID} pins an item, so it takes no edited text`);
  }
}
