import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// A snapshot from before the directory of places, which listed the IDs of its known contacts under
// `contacts` and no places. It turns the empty place list of a seeded snapshot into those contacts.
export async function seedLegacySnapshotContacts(
  db: Kysely<unknown>,
  contactIDs: readonly string[],
): Promise<void> {
  await sql`update definition_snapshots set form = replace(form, '"places":[]', ${`"contacts":${JSON.stringify(contactIDs)}`})`.execute(
    db,
  );
}
