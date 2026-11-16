import { createShortID } from '@heynixie/db';
import { createRecordKey } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import type { MemoryItemRow, StoreParts } from '../types';
import { getItemShortID } from '../utils/item/get-item-short-id';

export interface VersionKey {
  readonly itemID: string;
  readonly key: CryptoKey;
  readonly shortID: string;
}

export async function readVersionKey(
  parts: StoreParts,
  db: Kysely<unknown>,
  newItemID: string | undefined,
  item: MemoryItemRow | null,
): Promise<VersionKey> {
  const itemID = item?.item_id ?? newItemID ?? crypto.randomUUID();

  const key = await (item === null && newItemID === undefined
    ? createItemKey(parts, itemID)
    : requireKey(parts, db, itemID));

  return { itemID, key, shortID: item === null ? createShortID() : getItemShortID(item) };
}

async function createItemKey(parts: StoreParts, itemID: string): Promise<CryptoKey> {
  const created = await createRecordKey(parts.context.log, itemID);

  return created.key;
}

async function requireKey(
  parts: StoreParts,
  db: Kysely<unknown>,
  itemID: string,
): Promise<CryptoKey> {
  const current = await readCurrentItemKey(parts.context.log, itemID, db);

  if (current.status !== 'readable') {
    throw new Error(`memory item ${itemID} has no readable key`);
  }

  return current.key;
}
