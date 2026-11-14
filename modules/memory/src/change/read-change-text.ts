import type { Log } from '@heynixie/log';
import { decodeChangeText } from '../utils/change/decode-change-text';
import type { ChangeText } from '../utils/codec/sealed-codec';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { readItemKey } from '../utils/item/read-item-key';
import type { ConsolidationChangeRow } from '../utils/memory-consolidations';

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
