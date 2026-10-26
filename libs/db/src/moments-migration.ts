import { sql } from 'kysely';
import type { Migration } from './types';

export const momentsMigration: Migration = {
  name: 'create the moments, their reflections, links and text records',
  up: async (tx) => {
    await sql`create table if not exists moments (
      moment_id text primary key,
      short_id text not null unique,
      thread text not null,
      first_sequence integer not null,
      last_sequence integer not null,
      state text not null check (state in ('active', 'retired', 'destroying', 'destroyed')),
      version integer not null,
      kept_by text not null check (kept_by in ('owner', 'model')),
      kept_thread text,
      kept_model text,
      kept_at integer not null,
      kept_sequence integer not null references records (sequence),
      title_sequence integer not null references records (sequence),
      note_sequence integer references records (sequence),
      edited_at integer,
      updated_sequence integer not null references records (sequence)
    ) strict`.execute(tx);

    await sql`create index if not exists moments_kept_at on moments (kept_at)`.execute(tx);

    await sql`create table if not exists moment_reflections (
      reflection_id text primary key,
      moment_id text not null references moments (moment_id),
      model text not null,
      text_sequence integer not null references records (sequence),
      created_at integer not null,
      updated_at integer not null,
      is_removed integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists moment_reflections_moment
      on moment_reflections (moment_id)`.execute(tx);

    await sql`create table if not exists moment_links (
      link_key text primary key,
      moment_id text not null references moments (moment_id),
      item_id text not null,
      linked_sequence integer not null references records (sequence)
    ) strict`.execute(tx);

    await sql`create index if not exists moment_links_item on moment_links (item_id)`.execute(tx);

    await sql`create index if not exists moment_links_moment on moment_links (moment_id)`.execute(
      tx,
    );

    await sql`create table if not exists moment_texts (
      sequence integer primary key references records (sequence),
      moment_id text not null references moments (moment_id)
    ) strict`.execute(tx);

    await sql`create index if not exists moment_texts_moment on moment_texts (moment_id)`.execute(
      tx,
    );
  },
};
