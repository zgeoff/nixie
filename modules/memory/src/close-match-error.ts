// An approval's write found, under the delivery lock, an active item that closely matches its text,
// such as one a concurrent approval created after this approval's first search.
export class CloseMatchError extends Error {
  override readonly name = 'CloseMatchError';

  readonly code = 'CLOSE_MATCH';

  constructor(proposalID: string) {
    super(`an active item closely matches memory proposal ${proposalID}`);
  }
}
