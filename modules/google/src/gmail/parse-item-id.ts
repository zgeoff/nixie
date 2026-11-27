export interface ItemID {
  readonly connection: string;
  readonly id: string;
}

const itemIDPattern = /^(?<connection>[a-z0-9]+)\.(?<id>.+)$/u;

// Splits an item ID at its first dot. Null for text that holds no connection prefix.
export function parseItemID(text: string): ItemID | null {
  const match = itemIDPattern.exec(text);
  const connection = match?.groups?.['connection'];
  const id = match?.groups?.['id'];

  return connection === undefined || id === undefined ? null : { connection, id };
}
