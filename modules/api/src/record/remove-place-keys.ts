import { removeRecordKey } from '@heynixie/log';
import { contactMarkedKnownCodec } from '@heynixie/policy';
import { sql } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables } from '../types';
import { placeErasableKinds } from '../utils/place-erasable-kinds';

// A contact you marked is an entry of the directory whose ID is the contact's ID, and its marking
// record holds the contact's address in its erasable fields.
const placeKeyKinds = [...placeErasableKinds, contactMarkedKnownCodec.kind] as const;
const placeIDOf = sql`coalesce(json_extract(payload, '$.placeID'), json_extract(payload, '$.contactID'))`;

// A forget of one record of a place takes every record of that place that holds erasable fields,
// the marking record of a contact included, so no later change of its name keeps what the forget
// meant to erase. Does nothing for a record of any other kind.
export async function removePlaceKeys(context: APIContext, recordSequence: number): Promise<void> {
  const db = context.log.writer.db.$extendTables<APITables>();

  const forgotten = await db
    .selectFrom('records')
    .select(['kind', placeIDOf.as('place_id')])
    .where('sequence', '=', recordSequence)
    .where('kind', 'in', placeKeyKinds)
    .executeTakeFirst();

  if (forgotten === undefined) {
    return;
  }

  const placeID = z.string().parse(forgotten.place_id);

  const rows = await db
    .selectFrom('records')
    .select('key_id')
    .where('kind', 'in', placeKeyKinds)
    .where(placeIDOf, '=', placeID)
    .where('key_id', 'is not', null)
    .execute();

  for (const row of rows) {
    if (row.key_id !== null) {
      await removeRecordKey(context.log, row.key_id);
    }
  }
}
