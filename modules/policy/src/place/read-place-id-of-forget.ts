import type { Log, LogRecord, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import { contactMarkedKnownCodec } from '../contact/contact-marked-known-codec';
import { findPlaceLink } from './find-place-link';
import { placesActedCodec } from './places-acted-codec';
import { placesAddedCodec } from './places-added-codec';
import { placesChangedCodec } from './places-changed-codec';
import { placesRemovedCodec } from './places-removed-codec';

// The records that name their place in the payload: a contact's marking names it as its contact.
export const openPlaceKinds = [
  placesAddedCodec.kind,
  placesChangedCodec.kind,
  contactMarkedKnownCodec.kind,
] as const;

export const placeIDOfOpenRecord = sql`coalesce(json_extract(payload, '$.placeID'), json_extract(payload, '$.contactID'))`;

// The place that one record names. Null for a record of any other kind, and for a removal or an act
// whose fields are gone, so run it while the record is readable.
export async function readPlaceIDOfRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  recordSequence: number,
): Promise<string | null> {
  const [target] = await readRecords(log, {
    afterSequence: recordSequence - 1,
    sequences: [recordSequence],
    limit: 1,
  });

  return target === undefined ? null : findTargetPlaceID(target.record);
}

// The place of a forget that stored none, such as one an earlier release began: the record's own
// place while it still reads, else the place of an open record that the forget captured by key.
export async function readPlaceIDOfForget(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  recordSequence: number,
  keyIDs: readonly string[],
): Promise<string | null> {
  const own = await readPlaceIDOfRecord(log, recordSequence);

  if (own !== null || keyIDs.length === 0) {
    return own;
  }

  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(placeIDOfOpenRecord.as('place_id'))
    .where('kind', 'in', openPlaceKinds)
    .where('key_id', 'in', keyIDs.slice(0, 500))
    .execute();

  const found = rows.map((row) => z.string().nullable().parse(row.place_id));

  return found.find((id) => id !== null) ?? null;
}

const openTargetSchema = z.union([
  z.object({ placeID: z.string() }).transform((payload) => payload.placeID),
  z.object({ contactID: z.string() }).transform((payload) => payload.contactID),
]);

function findTargetPlaceID(record: LogRecord): string | null {
  if (record.kind === placesRemovedCodec.kind || record.kind === placesActedCodec.kind) {
    return findPlaceLink(record)?.placeID ?? null;
  }

  const kinds: readonly string[] = openPlaceKinds;

  if (!kinds.includes(record.kind)) {
    return null;
  }

  const parsed = openTargetSchema.safeParse(record.payload);

  return parsed.success ? parsed.data : null;
}
