import type { Projection } from '@heynixie/log';
import { phoneSendClaimedCodec } from '../record/phone-send-claimed-codec';
import type { PhoneTables } from '../types';

// One row per send that settled on a provider message. The message ID is unique, so one message
// settles one send.
export const phoneSendClaimsProjection: Projection = {
  table: 'phone_send_claims',
  keyColumn: 'action_id',
  fold: async (tx, record) => {
    if (record.kind !== phoneSendClaimedCodec.kind) {
      return [];
    }

    const claimed = phoneSendClaimedCodec.decode(record.payload);

    await tx
      .$extendTables<PhoneTables>()
      .insertInto('phone_send_claims')
      .values({
        action_id: claimed.actionID,
        message_id: claimed.messageID,
        short_id: claimed.shortID,
        updated_sequence: record.sequence,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return [claimed.actionID];
  },
};
