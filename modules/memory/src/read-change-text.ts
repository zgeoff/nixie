import type { Log } from '@heynixie/log';
import { decodeChangeText } from './decode-change-text';
import type { ConsolidationChangeRow } from './memory-consolidations';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { readItemKey } from './read-item-key';
import type { ChangeText } from './sealed-codec';

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
