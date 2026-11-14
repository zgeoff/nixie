export class MemoryItemNotFoundError extends Error {
  override readonly name = 'MemoryItemNotFoundError';

  readonly code = 'NOT_FOUND';

  constructor(itemID: string) {
    super(`no memory item ${itemID} to change`);
  }
}
