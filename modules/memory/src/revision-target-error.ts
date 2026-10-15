// An answer asked to apply a proposal as a revision of another item, which only a proposal for a
// new item can become.
export class RevisionTargetError extends Error {
  override readonly name = 'RevisionTargetError';

  readonly code = 'REVISION_TARGET';

  constructor(proposalID: string) {
    super(
      `memory proposal ${proposalID} changes an existing item, so it applies only to that item`,
    );
  }
}
