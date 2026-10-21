import { sql } from 'kysely';
import type { Migration } from './types';

export const memoryWriterMigration: Migration = {
  name: 'create the memory writer projection',
  up: async (tx) => {
    await sql`create table memory_writer (
      writer_id text primary key,
      cursor integer not null check (cursor >= 0),
      start_sequence integer not null check (start_sequence >= 0),
      caught_up_sequence integer references records (sequence),
      catch_up_applied integer not null check (catch_up_applied >= 0),
      pending_start integer,
      pending_end integer,
      batches integer not null check (batches >= 0),
      last_batch_at integer,
      failures integer not null check (failures >= 0),
      retry_at integer,
      last_error_code text,
      last_error_sequence integer references records (sequence),
      last_error_at integer,
      updated_sequence integer not null references records (sequence),
      check ((pending_start is null) = (pending_end is null))
    ) strict`.execute(tx);
  },
};
