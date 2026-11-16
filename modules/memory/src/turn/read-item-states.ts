import type { MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import type { ItemState } from './types';

export async function readItemStates(parts: StoreParts): Promise<readonly ItemState[]> {
  const now = parts.context.gate.clock.now();

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'version', 'is_pinned', 'kind', 'subject', 'until'])
    .where('state', '=', 'active')
    .execute();

  return rows.map((row) => ({
    itemID: row.item_id,
    version: row.version,
    isPinned: row.is_pinned === 1,
    isSelf: getRowSubject(row) === 'self',
    isLapsed: row.until !== null && row.until <= now,
  }));
}
