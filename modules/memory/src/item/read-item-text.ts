import type { MemorySubject, MemoryTables, StoreParts, VersionRef } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { requireItem } from '../utils/item/require-item';
import { readVersion } from '../version/read-version';

export interface ActiveItem {
  // the text version, which the records and the read check hold
  readonly version: number;
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

  const version = await readVersion(parts.context.log, parts.context.log.writer.db, {
    itemID: target.itemID,
    version: item.version,
  });

  return {
    version: item.version,
    text: version.text.text,
    subject: getRowSubject(item),
    isPinned: item.is_pinned === 1,
    until: item.until,
  };
}
