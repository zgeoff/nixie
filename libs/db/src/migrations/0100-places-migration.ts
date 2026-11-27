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

    // the removal of each address, phone or handle entry, whose place ID only an erasable field holds
    await sql`create table if not exists place_removals (
      place_id text primary key,
      removed_sequence integer not null
    ) strict`.execute(tx);

    // A known contact is a place at known. Its key comes from its erasable destination, which the
    // directory reads from the record, so the row keeps the kind contact.
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

      for (const change of buildContactChanges(contact)) {
        await sql`insert into projection_changes (sequence, projection, row_key, row)
          values (${change.sequence}, 'places', ${contact.contact_id}, ${change.row})`.execute(tx);
      }
    }
  },
};

interface ContactRow {
  readonly contact_id: string;
  readonly marked_sequence: number;
  readonly unmarked_sequence: number | null;
}

interface PlaceChange {
  readonly sequence: number;
  readonly row: string;
}

// The change rows that the places fold writes for a contact's marking and unmarking, in the
// column order of the table, so a rebuild finds the rows that the migration wrote.
function buildContactChanges(contact: ContactRow): readonly PlaceChange[] {
  const marked = {
    place_id: contact.contact_id,
    short_id: buildShortIDFromUUID(contact.contact_id),
    origin: 'contact',
    kind: 'contact',
    trust: 'known',
    added_by: 'you',
    name: null,
    domain: null,
    subdomains: null,
    added_sequence: contact.marked_sequence,
    removed_sequence: null,
    name_sequence: null,
    last_used_at: null,
  };

  return [
    { sequence: contact.marked_sequence, row: JSON.stringify(marked) },
    ...(contact.unmarked_sequence === null
      ? []
      : [
          {
            sequence: contact.unmarked_sequence,
            row: JSON.stringify({ ...marked, removed_sequence: contact.unmarked_sequence }),
          },
        ]),
  ];
}
