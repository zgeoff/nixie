import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { PolicyTables } from '../policy/policy-tables';
import { placesAddedCodec } from './places-added-codec';
import { placesChangedCodec } from './places-changed-codec';

const fieldSchema = z.string().nullable();

// true for a record of a site or mail domain place. Such a place keeps its key and its IDs in the
// payload, where no key can shred them, so a forget would erase nothing and could undo its removal.
export async function probeOpenPlaceRecord(
  db: Kysely<unknown>,
  sequence: number,
): Promise<boolean> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select([
      'kind',
      sql`json_extract(payload, '$.placeID')`.as('place_id'),
      sql`json_extract(payload, '$.kind')`.as('place_kind'),
    ])
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  const placeID = fieldSchema.parse(row?.place_id ?? null);

  if (row === undefined || placeID === null) {
    return false;
  }

  if (row.kind === placesAddedCodec.kind) {
    return isOpenKind(fieldSchema.parse(row.place_kind));
  }

  if (row.kind === placesChangedCodec.kind) {
    const place = await db
      .$extendTables<PolicyTables>()
      .selectFrom('places')
      .select(['kind', 'origin'])
      .where('place_id', '=', placeID)
      .executeTakeFirst();

    return place?.origin === 'added' && isOpenKind(place.kind);
  }

  // a removal or an act holds its place ID in the payload only for a site or a mail domain
  return row.kind === 'places.removed' || row.kind === 'places.acted';
}

function isOpenKind(kind: string | null): boolean {
  return kind === 'site' || kind === 'mail_domain';
}
