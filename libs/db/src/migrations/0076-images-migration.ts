import { sql } from 'kysely';
import type { Migration } from '../types';

export const imagesMigration: Migration = {
  name: 'create the images table of the image tools',
  up: async (tx) => {
    await sql`create table if not exists images (
      image_id text primary key,
      uuid text not null unique,
      sequence integer not null references records (sequence),
      position integer not null,
      parent_id text references images (image_id),
      source text not null check (source in ('draw', 'file', 'photo')),
      source_seq integer,
      is_pinned integer not null default 0,
      profile text,
      model text,
      media_type text not null,
      size text not null,
      byte_count integer not null,
      created_at integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists images_parent on images (parent_id)`.execute(tx);
    await sql`create index if not exists images_created on images (created_at desc)`.execute(tx);
  },
};
