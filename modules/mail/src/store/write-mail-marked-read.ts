import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { mailMarkedReadCodec } from '../record/mail-marked-read-codec';
import type { MailContext } from '../types';

// Marks a stored mail read. A mail that is read already writes nothing.
export function writeMailMarkedRead(context: MailContext, shortID: string): Promise<void> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mailMarkedReadCodec.kind,
        definitions: context.definitions(),
        payload: mailMarkedReadCodec.encode({ shortID }),
      },
    ]);
  });
}
