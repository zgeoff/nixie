export class LabelEditError extends Error {
  override readonly name = 'LabelEditError';

  readonly code = 'LABEL_EDIT';

  constructor(proposalID: string) {
    super(`memory proposal ${proposalID} changes labels only, so it takes no edited text`);
  }
}
