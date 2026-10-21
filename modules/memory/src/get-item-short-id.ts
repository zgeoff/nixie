import { buildShortIDFromUUID } from '@heynixie/db';
import type { MemoryItemRow } from './types';

export function getItemShortID(row: Pick<MemoryItemRow, 'item_id' | 'short_id'>): string {
  return row.short_id ?? buildShortIDFromUUID(row.item_id);
}
