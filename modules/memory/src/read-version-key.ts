import { createShortID } from '@heynixie/db';
import { createRecordKey } from '@heynixie/log';
import { getItemShortID } from './get-item-short-id';
import { readItemKey } from './read-item-key';
import type { MemoryItemRow, StoreParts } from './types';

// The item a version goes to: its ID, its key, and the short ID the model reads it by.
export interface VersionKey {
  readonly itemID: string;
  readonly key: CryptoKey;
  readonly shortID: string;
}

// An existing item, or a new one whose key a proposal already made (newItemID), uses its key; any
// other new item gets a fresh ID and key. A new item gets a fresh short ID.
export async function readVersionKey(
  parts: StoreParts,
  newItemID: string | undefined,
  item: MemoryItemRow | null,
): Promise<VersionKey> {
  const itemID = item?.item_id ?? newItemID ?? crypto.randomUUID();

  const key = await (item === null && newItemID === undefined
    ? createItemKey(parts, itemID)
    : requireKey(parts, itemID));

  return { itemID, key, shortID: item === null ? createShortID() : getItemShortID(item) };
}

async function createItemKey(parts: StoreParts, itemID: string): Promise<CryptoKey> {
  const created = await createRecordKey(parts.context.log, itemID);

  return created.key;
}

async function requireKey(parts: StoreParts, itemID: string): Promise<CryptoKey> {
  const key = await readItemKey(parts.context.log, itemID);

  if (key === null || key === undefined) {
    throw new Error(`memory item ${itemID} has no readable key`);
  }

  return key;
}
