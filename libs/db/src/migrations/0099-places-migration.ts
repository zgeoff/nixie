import { sql } from 'kysely';
import { z } from 'zod';
import { buildShortIDFromUUID } from '../build-short-id-from-uuid';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const placesMigration: Migration = {
  name: 'create the directory of trusted places, with the known contacts folded in',
  up: async (tx) => {
    await sql`create table if not exists places (
      place_id text primary key,
      short_id text not null,
      origin text not null check (origin in ('added', 'contact')),
      kind text not null,
      trust text not null check (trust in ('blocked', 'known', 'read', 'act', 'self')),
      added_by text not null,
      name text,
      domain text,
      subdomains integer,
      added_sequence integer not null,
      removed_sequence integer,
      name_sequence integer,
      last_used_at integer
    ) strict`.execute(tx);

    await sql`create index if not exists places_by_short_id on places (short_id)`.execute(tx);

    // A known contact is a place at known. Its kind comes from its erasable destination, which a
    // migration cannot read, so the row waits as a contact until the directory reads it.
    const contacts = await readQueryRows(
      sql`select contact_id, marked_sequence, unmarked_sequence from known_contacts`,
      tx,
      z.object({
        contact_id: z.string(),
        marked_sequence: z.number(),
        unmarked_sequence: z.number().nullable(),
      }),
    );

    for (const contact of contacts) {
      await sql`insert or ignore into places (
        place_id, short_id, origin, kind, trust, added_by, added_sequence, removed_sequence
      ) values (
        ${contact.contact_id}, ${buildShortIDFromUUID(contact.contact_id)}, 'contact', 'contact',
        'known', 'you', ${contact.marked_sequence}, ${contact.unmarked_sequence}
      )`.execute(tx);
    }
  },
};
