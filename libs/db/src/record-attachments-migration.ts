import { sql } from 'kysely';
import type { Migration } from './types';

// Gives a record a place for the bytes it carries beside its erasable fields, such as the images of
// your message: each one sealed under the record's own key, which lives in keys.db, so a forget
// leaves every copy of them unreadable, backups included. Each step is safe to run again.
export const recordAttachmentsMigration: Migration = {
  name: 'add the sealed attachments of a record',
  up: async (tx) => {
    await sql`create table if not exists record_attachments (
      sequence integer not null references records (sequence),
      position integer not null check (position >= 0),
      sealed blob not null,
      primary key (sequence, position)
    ) strict`.execute(tx);

    // an attachment is part of its record, which no code path updates or deletes
    await sql`create trigger if not exists record_attachments_refuse_update
      before update on record_attachments
      begin select raise(abort, 'record attachments are append-only'); end`.execute(tx);

    await sql`create trigger if not exists record_attachments_refuse_delete
      before delete on record_attachments
      begin select raise(abort, 'record attachments are append-only'); end`.execute(tx);
  },
};
