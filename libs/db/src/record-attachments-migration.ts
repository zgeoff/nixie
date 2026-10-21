import { sql } from 'kysely';
import type { Migration } from './types';

export const recordAttachmentsMigration: Migration = {
  name: 'add the sealed attachments of a record',
  up: async (tx) => {
    await sql`create table if not exists record_attachments (
      sequence integer not null references records (sequence),
      position integer not null check (position >= 0),
      sealed blob not null,
      primary key (sequence, position)
    ) strict`.execute(tx);

    await sql`create trigger if not exists record_attachments_refuse_update
      before update on record_attachments
      begin select raise(abort, 'record attachments are append-only'); end`.execute(tx);

    await sql`create trigger if not exists record_attachments_refuse_delete
      before delete on record_attachments
      begin select raise(abort, 'record attachments are append-only'); end`.execute(tx);
  },
};
