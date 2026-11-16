import { writeKeyStoreCheckpoint } from '../key/write-key-store-checkpoint';
import type { KeyStoreTables, Log } from '../types';
import { withWriteTransaction } from './with-write-transaction';

// Removes the key with this ID and every key whose ID starts with it and a `/`, after the writer
// epoch check that removeRecordKey makes. A text range selects the family, because '0' is the
// character after '/', and no pattern can read an ID's own characters as wildcards.
export async function removeRecordKeyFamily(
  log: Pick<Log, 'writer'>,
  rootID: string,
): Promise<void> {
  await withWriteTransaction(log.writer, () => Promise.resolve());

  await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .deleteFrom('record_keys')
    .where((eb) =>
      eb.or([
        eb('key_id', '=', rootID),
        eb.and([eb('key_id', '>=', `${rootID}/`), eb('key_id', '<', `${rootID}0`)]),
      ]),
    )
    .execute();

  await writeKeyStoreCheckpoint(log, rootID);
}
