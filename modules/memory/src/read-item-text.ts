import { findItemKey } from './find-item-key';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readVersion } from './read-version';
import { requireItem } from './require-item';
import type { MemoryTables, StoreParts, VersionRef } from './types';

// Reads the text of an active item at the version a retirement names. A missing item, a stale
// version or a retired item is refused.
export async function readItemText(parts: StoreParts, target: VersionRef): Promise<string> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  await requireItem(db, { target, operation: 'retire', states: ['active'] });

  const key = await findItemKey(parts.context.log, target.itemID);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(target.itemID);
  }

  const version = await readVersion(db, key, target);

  return version.text.text;
}
