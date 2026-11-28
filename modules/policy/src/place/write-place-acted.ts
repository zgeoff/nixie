import type { Log, LogTables } from '@heynixie/log';
import { removeRecordKey, writeRecords } from '@heynixie/log';
import { sql } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';
import type { PlaceContext } from './place-context';
import { placesActedCodec } from './places-acted-codec';

export interface PlaceActed {
  readonly placeID: string;
  readonly shortID: string;
  readonly callID: string;
  readonly tool: string;

  // the thread of the call
  readonly thread: string;
}

// One record for a call that an act place allowed. It makes no new definitions snapshot. The IDs of
// an address, phone or handle sit in the erasable fields, so a forget of the place takes them. The
// key of an act of a place whose forget has begun goes as the record lands.
export async function writePlaceActed(
  context: Pick<PlaceContext, 'log' | 'definitions'>,
  acted: PlaceActed,
): Promise<void> {
  const row = await context.log.writer.db
    .$extendTables<PolicyTables>()
    .selectFrom('places')
    .select(['kind', 'origin'])
    .where('place_id', '=', acted.placeID)
    .executeTakeFirst();

  const isOpen = row?.origin === 'added' && (row.kind === 'site' || row.kind === 'mail_domain');
  const link = { placeID: acted.placeID, shortID: acted.shortID };
  const call = { callID: acted.callID, tool: acted.tool };

  const [written] = await writeRecords(context.log, [
    isOpen
      ? {
          kind: placesActedCodec.kind,
          definitions: context.definitions(),
          thread: acted.thread,
          payload: placesActedCodec.encode({ ...link, ...call }),
        }
      : {
          kind: placesActedCodec.kind,
          definitions: context.definitions(),
          thread: acted.thread,
          payload: placesActedCodec.encode(call),
          erasable: link,
        },
  ]);

  if (isOpen || written === undefined) {
    return;
  }

  const isForgotten = await probeForgottenPlace(context.log, acted.placeID);

  if (isForgotten) {
    await removeKeyOfRecord(context.log, written.sequence);
  }
}

async function probeForgottenPlace(log: Pick<Log, 'writer'>, placeID: string): Promise<boolean> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'erasure.started')
    .where(sql`json_extract(payload, '$.kind')`, '=', 'record')
    .where(sql`json_extract(payload, '$.capture.placeID')`, '=', placeID)
    .executeTakeFirst();

  return row !== undefined;
}

async function removeKeyOfRecord(log: Pick<Log, 'writer'>, sequence: number): Promise<void> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  if (row?.key_id) {
    await removeRecordKey(log, row.key_id);
  }
}
