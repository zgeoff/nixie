import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import {
  contactMarkedKnownCodec,
  findPlaceLink,
  placesActedCodec,
  placesRemovedCodec,
} from '@heynixie/policy';
import { sql } from 'kysely';
import { z } from 'zod';
import type { APITables } from '../types';
import { placeErasableKinds } from '../utils/place-erasable-kinds';

// The records that name their place in the payload: a contact's marking names it as its contact.
const openKinds = [...placeErasableKinds, contactMarkedKnownCodec.kind] as const;

// The records that name an address, phone or handle place only in their erasable fields.
const sealedKinds = [placesRemovedCodec.kind, placesActedCodec.kind] as const;
const placeIDOf = sql`coalesce(json_extract(payload, '$.placeID'), json_extract(payload, '$.contactID'))`;

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

// The key of each record of a place, as the place's records read now. An address place's removal
// or act joins the place only while its own fields are readable.
export async function readPlaceKeyIDs(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  placeID: string,
): Promise<readonly string[]> {
  const db = log.writer.db.$extendTables<APITables>();

  const open = await db
    .selectFrom('records')
    .select('key_id')
    .where('kind', 'in', openKinds)
    .where(placeIDOf, '=', placeID)
    .where('key_id', 'is not', null)
    .execute();

  const sealed = await db
    .selectFrom('records')
    .select(['sequence', 'key_id'])
    .where('kind', 'in', sealedKinds)
    .where('key_id', 'is not', null)
    .where(sql`json_extract(payload, '$.placeID')`, 'is', null)
    .orderBy('sequence')
    .execute();

  const linked = await readLinkedSequences(
    log,
    placeID,
    sealed.map((row) => row.sequence),
  );

  return [
    ...new Set([
      ...open.flatMap((row) => (row.key_id === null ? [] : [row.key_id])),
      ...sealed.flatMap((row) =>
        row.key_id !== null && linked.has(row.sequence) ? [row.key_id] : [],
      ),
    ]),
  ];
}

const openTargetSchema = z.union([
  z.object({ placeID: z.string() }).transform((payload) => payload.placeID),
  z.object({ contactID: z.string() }).transform((payload) => payload.contactID),
]);

function findTargetPlaceID(record: LogRecord): string | null {
  if (record.kind === placesRemovedCodec.kind || record.kind === placesActedCodec.kind) {
    return findPlaceLink(record)?.placeID ?? null;
  }

  const kinds: readonly string[] = openKinds;

  if (!kinds.includes(record.kind)) {
    return null;
  }

  const parsed = openTargetSchema.safeParse(record.payload);

  return parsed.success ? parsed.data : null;
}

const pageSize = 200;

async function readLinkedSequences(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  placeID: string,
  sequences: readonly number[],
): Promise<ReadonlySet<number>> {
  const linked = new Set<number>();

  for (let start = 0; start < sequences.length; start += pageSize) {
    const batch = sequences.slice(start, start + pageSize);

    const entries = await readRecords(log, { afterSequence: 0, sequences: batch, limit: pageSize });

    for (const entry of entries) {
      if (findPlaceLink(entry.record)?.placeID === placeID) {
        linked.add(entry.record.sequence);
      }
    }
  }

  return linked;
}
