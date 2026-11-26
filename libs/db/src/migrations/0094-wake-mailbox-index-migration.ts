import { sql } from 'kysely';
import type { Migration } from '../types';

export const wakeMailboxIndexMigration: Migration = {
  name: 'index the wakes of each mailbox, so a forget of a Gmail connection finds its wakes',
  up: async (tx) => {
    await sql`create index if not exists records_by_mail_woke_mailbox
      on records (json_extract(payload, '$.mailbox'))
      where kind = 'trigger.mail_woke'`.execute(tx);
  },
};
