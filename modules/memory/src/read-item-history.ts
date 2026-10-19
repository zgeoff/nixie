import { decodeVersionText } from './decode-version-text';
import { findItemKey } from './find-item-key';
import { getRowSubject } from './get-row-subject';
import type { MemoryTables, MemoryVersionRow, StoreParts } from './types';
import type { HistoryVersion, ItemHistory } from './view-types';

// Reads an item's state and every version, oldest first, for the memory view. A version whose key
// is gone reads as shredded, so a forgotten item shows as a dated gap, and one whose key or
// ciphertext fails reads as unreadable. It delivers nothing to a task, so it takes no lock.
export async function readItemHistory(
  parts: StoreParts,
  itemID: string,
): Promise<ItemHistory | null> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  const item = await db
    .selectFrom('memory_items')
    .select(['state', 'kind', 'subject'])
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  if (item === undefined) {
    return null;
  }

  const rows = await db
    .selectFrom('memory_versions')
    .selectAll()
    .where('item_id', '=', itemID)
    .orderBy('version')
    .execute();

  const key = await findItemKey(parts.context.log, itemID);
  const versions = await Promise.all(rows.map((row) => readHistoryVersion(row, key)));

  return { itemID, state: item.state, subject: getRowSubject(item), versions };
}

async function readHistoryVersion(
  row: MemoryVersionRow,
  key: CryptoKey | null | undefined,
): Promise<HistoryVersion> {
  const base = {
    version: row.version,
    change: row.change,
    state: row.state,
    origin: row.origin,
    source: row.source,
    recordedAt: row.recorded_at,
  };

  if (key === undefined) {
    return { ...base, status: 'shredded' };
  }

  if (key === null) {
    return { ...base, status: 'unreadable' };
  }

  try {
    const text = await decodeVersionText(
      key,
      { itemID: row.item_id, version: row.version },
      row.sealed,
    );

    return { ...base, status: 'readable', text: text.text };
  } catch {
    return { ...base, status: 'unreadable' };
  }
}
