import type { Projection } from '@heynixie/log';
import { mailMarkedReadCodec } from '../record/mail-marked-read-codec';
import { mailReceivedCodec } from '../record/mail-received-codec';
import { mailSentCodec } from '../record/mail-sent-codec';
import type { MailTables } from '../types';

// One row per stored mail. A second store of one host mail changes nothing.
export const mailMessagesProjection: Projection = {
  table: 'mail_messages',
  keyColumn: 'short_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<MailTables>();

    if (record.kind === mailMarkedReadCodec.kind) {
      const marked = mailMarkedReadCodec.decode(record.payload);

      await db
        .updateTable('mail_messages')
        .set({ unread: 0, updated_sequence: record.sequence })
        .where('short_id', '=', marked.shortID)
        .execute();

      return [marked.shortID];
    }

    if (record.kind === mailReceivedCodec.kind) {
      const received = mailReceivedCodec.decode(record.payload);

      await db
        .insertInto('mail_messages')
        .values({
          message_id: received.messageID,
          short_id: received.shortID,
          thread_short_id: received.threadShortID,
          host_message_id: received.hostMessageID,
          direction: 'in',
          received_at: received.receivedAt,
          unread: 1,
          header_hash: received.headerHash,
          record_sequence: record.sequence,
          updated_sequence: record.sequence,
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      return [received.shortID];
    }

    if (record.kind !== mailSentCodec.kind) {
      return [];
    }

    const sent = mailSentCodec.decode(record.payload);

    await db
      .insertInto('mail_messages')
      .values({
        message_id: sent.messageID,
        short_id: sent.shortID,
        thread_short_id: sent.threadShortID,
        host_message_id: sent.hostMessageID,
        direction: 'out',
        received_at: sent.sentAt,
        unread: 0,
        header_hash: sent.headerHash,
        record_sequence: record.sequence,
        updated_sequence: record.sequence,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    return [sent.shortID];
  },
};
