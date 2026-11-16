export class ItemPurgingError extends Error {
  override readonly name = 'ItemPurgingError';

  readonly code = 'ITEM_PURGING';

  constructor(itemID: string) {
    super(`memory item ${itemID} is changing while a removed message leaves it. Try again later`);
  }
}
