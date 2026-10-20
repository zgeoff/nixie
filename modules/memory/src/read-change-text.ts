import type { Log } from '@heynixie/log';
import type { ConsolidationChangeRow } from './consolidation-types';
import { decodeChangeText } from './decode-change-text';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readItemKey } from './read-item-key';
import type { ChangeText } from './sealed-types';

// Opens a consolidation change's text under its first input's key, and throws when a forget of
// that item took the key, because nothing is left to apply.
export async function readChangeText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  row: Pick<ConsolidationChangeRow, 'change_id' | 'item_id' | 'sealed'>,
): Promise<ChangeText> {
  const key = await readItemKey(log, row.item_id);

  if (key === null || key === undefined) {
    throw new MemoryItemNotFoundError(row.item_id);
  }

  return decodeChangeText(key, row.change_id, row.sealed);
}
