import { removeRecordKey } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables } from '../types';
import { placeErasableKinds } from '../utils/place-erasable-kinds';

// A forget of one record of a place takes every record of that place that holds erasable fields,
// so no later change of its name keeps what the forget meant to erase. Does nothing for a record of
// any other kind.
export async function removePlaceKeys(context: APIContext, recordSequence: number): Promise<void> {
  const db = context.log.writer.db.$extendTables<APITables>();

  const forgotten = await db
    .selectFrom('records')
    .select(['kind', sql`json_extract(payload, '$.placeID')`.as('place_id')])
    .where('sequence', '=', recordSequence)
    .where('kind', 'in', placeErasableKinds)
    .executeTakeFirst();

  if (forgotten === undefined) {
    return;
  }

  const placeID = z.string().parse(forgotten.place_id);

  const rows = await db
    .selectFrom('records')
    .select('key_id')
    .where('kind', 'in', placeErasableKinds)
    .where(sql`json_extract(payload, '$.placeID')`, '=', placeID)
    .where('key_id', 'is not', null)
    .execute();

  for (const row of rows) {
    if (row.key_id !== null) {
      await removeRecordKey(context.log, row.key_id);
    }
  }
}
