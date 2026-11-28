import { sql } from 'kysely';
import type { Migration } from '../types';

// A record, an image and the conversation reset forget as an erasure of their own kinds, which the
// release before cannot finish, so it must not open a database that holds one. The index answers
// the lookup of the records that an erasure names.
export const erasureTargetIndexMigration: Migration = {
  name: 'index the targets of erasure.started and raise the oldest reader',
  up: async (tx) => {
    await sql`create index if not exists records_by_erasure_target
      on records (json_extract(payload, '$.targetID'))
      where kind = 'erasure.started'`.execute(tx);
  },
};
