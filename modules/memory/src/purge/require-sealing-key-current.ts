import type { Log } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { readCurrentItemKey } from '../item-key/read-current-item-key';
import { ItemPurgingError } from '../utils/error/item-purging-error';

export interface SealingKey {
  readonly itemID: string;
  readonly keyID: string;
}

// A value sealed before a write transaction began is sealed under the key the item had then. A purge
// that closed that key in between leaves the value unreadable, so the write fails instead.
export async function requireSealingKeyCurrent(
  db: Kysely<unknown>,
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sealing: SealingKey,
): Promise<void> {
  const current = await readCurrentItemKey(log, sealing.itemID, db);

  if (current.status !== 'readable' || current.keyID !== sealing.keyID) {
    throw new ItemPurgingError(sealing.itemID);
  }
}
