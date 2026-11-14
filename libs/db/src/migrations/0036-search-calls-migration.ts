import { sql } from 'kysely';
import type { Migration } from '../types';

export const searchCallsMigration: Migration = {
  name: "create the search tool's count of calls a day",
  up: async (tx) => {
    await sql`create table if not exists search_calls (
      day text primary key check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      count integer not null check (count > 0)
    ) strict`.execute(tx);
  },
};
