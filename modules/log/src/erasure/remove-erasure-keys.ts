import { writeKeyStoreCheckpoint } from '../key/write-key-store-checkpoint';
import { removeRecordKeyFamily } from '../record/remove-record-key-family';
import { removeThreadKeys } from '../record/remove-thread-keys';
import type { WriteTransaction } from '../record/with-write-transaction';
import { withWriteTransaction } from '../record/with-write-transaction';
import type { KeyStoreTables, Log } from '../types';
import type { ErasureCapture } from './erasure-capture-schema';

const chunkSize = 500;

// Deletes the keys that a capture names, then checkpoints the key store. Each delete finds nothing
// the second time, so a repeat after a crash is safe. A store that spares keys has them read and
// the rest deleted in one write transaction, so no write commits in between.
export async function removeErasureKeys(
  log: Pick<Log, 'writer'>,
  capture: Pick<ErasureCapture, 'keys' | 'cleanupKeys'>,
  readSpared?: (tx: WriteTransaction) => Promise<readonly string[]>,
): Promise<void> {
  const keys = log.writer.keys.$extendTables<KeyStoreTables>();

  const named =
    'ids' in capture.keys ? [...capture.keys.ids, ...capture.cleanupKeys] : capture.cleanupKeys;

  await withWriteTransaction(log.writer, async (tx) => {
    const sparedIDs = await (readSpared?.(tx) ?? Promise.resolve([]));

    const spared = new Set(sparedIDs);

    const doomed = named.filter((keyID) => !spared.has(keyID));

    for (let start = 0; start < doomed.length; start += chunkSize) {
      await keys
        .deleteFrom('record_keys')
        .where('key_id', 'in', doomed.slice(start, start + chunkSize))
        .execute();
    }
  });

  if ('family' in capture.keys) {
    await removeRecordKeyFamily(log, capture.keys.family);
  }

  if ('thread' in capture.keys) {
    await removeThreadKeys(log, capture.keys.thread);
  }

  await writeKeyStoreCheckpoint(log, null);
}
