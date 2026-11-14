export class NotPinnedError extends Error {
  override readonly name = 'NotPinnedError';

  readonly code = 'NOT_PINNED';

  constructor(itemID: string) {
    super(`memory item ${itemID} is not in the pinned core, so unpin does not apply`);
  }
}
