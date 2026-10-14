import { buildShortIDFromUUID } from '@heynixie/db';
import type { MemoryItemRow } from './types';

// The short ID the model reads an item by. An item that a release before short IDs made after the
// backfill holds none, and takes the one its UUID gives, as a rebuild would give it.
export function getItemShortID(row: Pick<MemoryItemRow, 'item_id' | 'short_id'>): string {
  return row.short_id ?? buildShortIDFromUUID(row.item_id);
}
