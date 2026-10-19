import { findItemKey } from './find-item-key';
import { getRowSubject } from './get-row-subject';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readVersion } from './read-version';
import { requireItem } from './require-item';
import type { MemorySubject, MemoryTables, StoreParts, VersionRef } from './types';

// The text of the item a retirement names, with the item's subject.
export interface RetirableItem {
  readonly text: string;
  readonly subject: MemorySubject;
}

// Reads the text and kind of an active item at the version a retirement names. A missing item, a
// stale version or a retired item is refused.
export async function readItemText(parts: StoreParts, target: VersionRef): Promise<RetirableItem> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  const item = await requireItem(db, { target, operation: 'retire', states: ['active'] });
  const key = await findItemKey(parts.context.log, target.itemID);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(target.itemID);
  }

  const version = await readVersion(db, key, target);

  return { text: version.text.text, subject: getRowSubject(item) };
}
