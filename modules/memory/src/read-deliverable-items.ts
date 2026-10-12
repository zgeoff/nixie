import { findRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { decodeVersionText } from './decode-version-text';
import type {
  MemoryItemRow,
  MemoryState,
  MemoryTables,
  MemoryVersionRow,
  RecalledItem,
  RecalledVersion,
  StoreParts,
} from './types';

export interface DeliverableQuery {
  readonly itemIDs: readonly string[];
  readonly states: readonly MemoryState[];
  readonly includeHistory: boolean;

  // the connection to read through, such as a write transaction's; the writer's when unset
  readonly db?: Kysely<MemoryTables>;
}

// Reads the current version of each item in the order given, decrypted, and leaves out any item that
// is not in one of the states, whose key is gone or whose text fails to decrypt. A caller holds the
// delivery lock, so no forget runs between this check and the delivery.
export async function readDeliverableItems(
  parts: StoreParts,
  query: DeliverableQuery,
): Promise<readonly RecalledItem[]> {
  if (query.itemIDs.length === 0) {
    return [];
  }
  const db = query.db ?? parts.context.log.writer.db.$extendTables<MemoryTables>();
  const rows = await db
    .selectFrom('memory_items')
    .selectAll()
    .where('item_id', 'in', query.itemIDs)
    .where('state', 'in', query.states)
    .execute();
  const keys = await findRecordKeys(
    parts.context.log,
    rows.map((row) => row.item_id),
  );
  const byID = new Map(rows.map((row) => [row.item_id, row]));
  const items = await Promise.all(
    query.itemIDs.map((itemID) => {
      const row = byID.get(itemID);
      const key = keys.get(itemID);

      return row === undefined || key === undefined || key === null
        ? Promise.resolve(null)
        : readItem(db, { row, key, includeHistory: query.includeHistory });
    }),
  );

  return items.filter((item) => item !== null);
}

interface ItemToRead {
  readonly row: MemoryItemRow;
  readonly key: CryptoKey;
  readonly includeHistory: boolean;

  // the connection to read through, such as a write transaction's; the writer's when unset
  readonly db?: Kysely<MemoryTables>;
}

// an item whose text fails to decrypt is left out, never delivered as a gap
async function readItem(db: Kysely<MemoryTables>, item: ItemToRead): Promise<RecalledItem | null> {
  const versions = await db
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', item.row.item_id)
    .$if(!item.includeHistory, (query) => query.where('version', '=', item.row.version))
    .orderBy('version')
    .execute();

  try {
    const readable = await Promise.all(versions.map((version) => readVersion(item.key, version)));
    const current = readable.find((version) => version.version === item.row.version);

    if (current === undefined) {
      return null;
    }
    return {
      itemID: item.row.item_id,
      isPinned: item.row.is_pinned === 1,
      ...current,
      ...(item.includeHistory ? { history: readable } : {}),
    };
  } catch {
    return null;
  }
}

async function readVersion(key: CryptoKey, row: MemoryVersionRow): Promise<RecalledVersion> {
  const text = await decodeVersionText(
    key,
    { itemID: row.item_id, version: row.version },
    row.sealed,
  );

  return {
    version: row.version,
    change: row.change,
    state: row.state,
    origin: row.origin,
    source: row.source,
    recordedAt: row.recorded_at,
    text: text.text,
  };
}
