import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import {
  findPlaceLink,
  openPlaceKinds,
  placeIDOfOpenRecord,
  placesActedCodec,
  placesRemovedCodec,
} from '@heynixie/policy';
import { sql } from 'kysely';
import type { APITables } from '../types';

// The records that name an address, phone or handle place only in their erasable fields.
const sealedKinds = [placesRemovedCodec.kind, placesActedCodec.kind] as const;

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
    .where('kind', 'in', openPlaceKinds)
    .where(placeIDOfOpenRecord, '=', placeID)
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
