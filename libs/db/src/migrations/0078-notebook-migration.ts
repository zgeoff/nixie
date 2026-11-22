import { sql } from 'kysely';
import type { Migration } from '../types';

export const notebookMigration: Migration = {
  name: 'create the notes, their versions and their links',
  up: async (tx) => {
    await sql`create table if not exists notebook_notes (
      note_id text primary key,
      short_id text not null unique,
      state text not null check (state in ('active', 'forgetting', 'forgotten')),
      version integer not null,
      text_seq integer not null references records (sequence),
      is_private integer not null check (is_private in (0, 1)),
      created_at integer not null,
      edited_at integer not null,
      read_at integer,
      owner_opened_at integer
    ) strict`.execute(tx);

    await sql`create index if not exists notebook_notes_edited
      on notebook_notes (edited_at, note_id)`.execute(tx);

    await sql`create table if not exists notebook_versions (
      note_id text not null references notebook_notes (note_id),
      version integer not null,
      seq integer not null unique references records (sequence),
      writer text not null,
      model text not null,
      chars integer not null,
      created_at integer not null,
      primary key (note_id, version)
    ) strict`.execute(tx);

    await sql`create table if not exists notebook_links (
      link_key text not null unique,
      from_note_id text not null references notebook_notes (note_id),
      target_kind text not null check (target_kind in ('note', 'memory', 'moment', 'event')),
      target_id text not null,
      type text not null check (type in ('supersedes', 'disputes', 'part-of', 'cites', 'related')),
      reason_seq integer references records (sequence),
      created_at integer not null,
      primary key (from_note_id, target_kind, target_id, type)
    ) strict`.execute(tx);

    await sql`create index if not exists notebook_links_target
      on notebook_links (target_kind, target_id)`.execute(tx);
  },
};
