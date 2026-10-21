export class CloseMatchError extends Error {
  override readonly name = 'CloseMatchError';

  readonly code = 'CLOSE_MATCH';

  constructor(proposalID: string) {
    super(`an active item closely matches memory proposal ${proposalID}`);
  }
}
