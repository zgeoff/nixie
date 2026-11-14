import { readRecordKeys } from '@heynixie/log';
import type { Log } from '@heynixie/log';

export async function readItemKey(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemID: string,
): Promise<CryptoKey | null | undefined> {
  const keys = await readRecordKeys(log, [itemID]);

  return keys.get(itemID);
}
