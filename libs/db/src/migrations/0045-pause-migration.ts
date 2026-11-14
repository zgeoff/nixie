import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const pauseMigration: Migration = {
  name: 'create the pause tables and the reader gate column',
  up: async (tx) => {
    await sql`create table if not exists nixie_pause (
      id integer primary key check (id = 1),
      cause text not null,
      recovery_id text,
      paused_sequence integer not null references records (sequence),
      check ((cause = 'restore') = (recovery_id is not null))
    ) strict`.execute(tx);

    await sql`create table if not exists pause_exemptions (
      task_id text primary key,
      exempt_sequence integer not null references records (sequence)
    ) strict`.execute(tx);

    await sql`create table if not exists recoveries (
      recovery_id text primary key,
      restored_at integer not null,
      backup_taken_at integer not null,
      started_sequence integer not null references records (sequence)
    ) strict`.execute(tx);

    const columns = await readQueryRows(
      sql`select name from pragma_table_info('schema_version') where name = 'open_oldest_reader'`,
      tx,
      z.object({ name: z.string() }),
    );

    if (columns.length === 0) {
      await sql`alter table schema_version add column open_oldest_reader integer`.execute(tx);
    }
  },
};
