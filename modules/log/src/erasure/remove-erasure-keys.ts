import { writeKeyStoreCheckpoint } from '../key/write-key-store-checkpoint';
import { removeRecordKeyFamily } from '../record/remove-record-key-family';
import { removeThreadKeys } from '../record/remove-thread-keys';
import { withWriteTransaction } from '../record/with-write-transaction';
import type { KeyStoreTables, Log } from '../types';
import type { ErasureCapture } from './erasure-capture-schema';

const chunkSize = 500;

// Deletes the keys that a capture names, then checkpoints the key store, and returns how many keys
// it deleted. Each delete finds nothing the second time, so a repeat after a crash is safe.
export async function removeErasureKeys(
  log: Pick<Log, 'writer'>,
  capture: Pick<ErasureCapture, 'keys' | 'cleanupKeys'>,
): Promise<number> {
  await withWriteTransaction(log.writer, () => Promise.resolve());

  const keys = log.writer.keys.$extendTables<KeyStoreTables>();
  const removed = { count: 0 };

  const named =
    'ids' in capture.keys ? [...capture.keys.ids, ...capture.cleanupKeys] : capture.cleanupKeys;

  for (let start = 0; start < named.length; start += chunkSize) {
    const deleted = await keys
      .deleteFrom('record_keys')
      .where('key_id', 'in', named.slice(start, start + chunkSize))
      .executeTakeFirst();

    removed.count += Number(deleted.numDeletedRows);
  }

  if ('family' in capture.keys) {
    const rootID = capture.keys.family;

    const family = await keys
      .selectFrom('record_keys')
      .select((eb) => eb.fn.countAll().as('count'))
      .where((eb) =>
        eb.or([
          eb('key_id', '=', rootID),
          eb.and([eb('key_id', '>=', `${rootID}/`), eb('key_id', '<', `${rootID}0`)]),
        ]),
      )
      .executeTakeFirst();

    removed.count += Number(family?.count ?? 0);

    await removeRecordKeyFamily(log, rootID);
  }

  if ('thread' in capture.keys) {
    removed.count += await removeThreadKeys(log, capture.keys.thread);
  }

  await writeKeyStoreCheckpoint(log, null);

  return removed.count;
}
