import type { Projection } from '@heynixie/log';
import { phoneTextReceivedCodec } from '../record/phone-text-received-codec';
import type { PhoneTables } from '../types';

// One row per stored text. A second store of one provider message changes nothing.
export const phoneTextsProjection: Projection = {
  table: 'phone_texts',
  keyColumn: 'short_id',
  fold: async (tx, record) => {
    if (record.kind !== phoneTextReceivedCodec.kind) {
      return [];
    }

    const received = phoneTextReceivedCodec.decode(record.payload);

    await tx
      .$extendTables<PhoneTables>()
      .insertInto('phone_texts')
      .values({
        text_id: received.textID,
        short_id: received.shortID,
        message_id: received.messageID,
        received_at: received.receivedAt,
        record_sequence: record.sequence,
        updated_sequence: record.sequence,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return [received.shortID];
  },
};
