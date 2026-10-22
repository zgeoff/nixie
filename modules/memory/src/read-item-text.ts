import { getRowSubject } from './get-row-subject';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readItemKey } from './read-item-key';
import { readVersion } from './read-version';
import { requireItem } from './require-item';
import type { MemorySubject, MemoryTables, StoreParts, VersionRef } from './types';

export interface ActiveItem {
  readonly text: string;
  readonly subject: MemorySubject;
  readonly isPinned: boolean;
  readonly until: number | null;
}

export async function readItemText(
  parts: StoreParts,
  target: VersionRef,
  operation: 'retire' | 'pin',
): Promise<ActiveItem> {
  const db = parts.context.log.writer.db.$extendTables<MemoryTables>();

  const item = await requireItem(db, { target, operation, states: ['active'] });
  const key = await readItemKey(parts.context.log, target.itemID);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(target.itemID);
  }

  const version = await readVersion(db, key, target);

  return {
    text: version.text.text,
    subject: getRowSubject(item),
    isPinned: item.is_pinned === 1,
    until: item.until,
  };
}
