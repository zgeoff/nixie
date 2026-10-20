import { readRecordKeys } from '@heynixie/log';
import type { Log } from '@heynixie/log';

// Reads an item's key from the key store: undefined when the key is gone, as after a forget, and
// null when it fails to unwrap, such as a key wrapped by another deployment key.
export async function readItemKey(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  itemID: string,
): Promise<CryptoKey | null | undefined> {
  const keys = await readRecordKeys(log, [itemID]);

  return keys.get(itemID);
}
