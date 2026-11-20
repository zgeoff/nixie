import { sql } from 'kysely';
import type { Migration } from '../types';

export const voidedReplyIndexMigration: Migration = {
  name: 'index the replies that a void names',
  up: async (tx) => {
    await sql`create index if not exists records_by_voided_reply_sequence
      on records (json_extract(payload, '$.replySequence'))
      where kind = 'model.reply_voided'`.execute(tx);
  },
};
