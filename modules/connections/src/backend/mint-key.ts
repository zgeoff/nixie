import type { RecordKey } from '@heynixie/log';
import { createRecordKey, removeRecordKey, withWriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';

// Marks a key ID in the database, then makes the key in the key store. The two files commit apart, so
// a crash between them, or before a row names the key, leaves a mark for the sweep to find.
export async function mintKey(context: BackendContext): Promise<RecordKey> {
  const keyID = crypto.randomUUID();

  context.heldKeys.add(keyID);

  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<ConnectionTables>()
      .insertInto('key_marks')
      .values({ key_id: keyID, marked_at: context.now() })
      .execute(),
  );

  return createRecordKey(context.log, keyID);
}

// Deletes the key, then its mark. A crash between the two leaves a mark for a key that is gone, which
// the sweep clears.
export async function removeKey(context: BackendContext, keyID: string): Promise<void> {
  await removeRecordKey(context.log, keyID);

  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<ConnectionTables>()
      .deleteFrom('key_marks')
      .where('key_id', '=', keyID)
      .execute(),
  );

  context.heldKeys.delete(keyID);
}
