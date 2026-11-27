import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { phoneTextFieldsSchema, phoneTextReceivedCodec } from '../record/phone-text-received-codec';
import type { PhoneContext, PhoneTables, ProviderText } from '../types';

// Stores one provider text in a write transaction of its own and returns its short ID. A text that
// nixie stored already changes nothing, because the provider's message ID is unique, so a
// redelivery after a crash stores no copy.
export function writeReceivedText(context: PhoneContext, text: ProviderText): Promise<string> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const stored = await tx
      .$extendTables<PhoneTables>()
      .selectFrom('phone_texts')
      .select('short_id')
      .where('message_id', '=', text.messageID)
      .executeTakeFirst();

    if (stored !== undefined) {
      return stored.short_id;
    }

    const shortID = createShortID();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: phoneTextReceivedCodec.kind,
        definitions: context.definitions(),
        payload: phoneTextReceivedCodec.encode({
          textID: crypto.randomUUID(),
          shortID,
          messageID: text.messageID,
          receivedAt: text.receivedAt,
        }),
        erasable: phoneTextFieldsSchema.parse({ from: text.from, body: text.body }),
      },
    ]);

    return shortID;
  });
}
