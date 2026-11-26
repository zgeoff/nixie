import { sql } from 'kysely';
import type { Migration } from '../types';

// A provider trip stops every route of its provider, so the stop, the tasks it holds and the day's
// raise of a provider each get a table beside the route tables. The release before ignores all 3,
// and a provider trip pauses nothing.
export const spendProvidersMigration: Migration = {
  name: 'add the provider stops, the provider holds and the provider raises of the spending stop',
  up: async (tx) => {
    await sql`create table if not exists spend_provider_stops (
      provider_id text primary key,
      period text not null,
      limit_amount real not null,
      spent_amount real not null,
      at integer not null,
      resets_at integer not null,
      routes text not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_provider_holds (
      task_id text primary key,
      provider_id text not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_provider_raises (
      provider_id text primary key,
      start text not null,
      dollars real not null,
      raised_by text not null,
      at integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);
  },
};
