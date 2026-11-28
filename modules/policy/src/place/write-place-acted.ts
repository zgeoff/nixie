import type { Log, LogTables } from '@heynixie/log';
import {
  erasureStartedCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { sql } from 'kysely';
import type { PolicyTables } from '../policy/policy-tables';
import type { PlaceContext } from './place-context';
import { placesActedCodec } from './places-acted-codec';
import { readPlaceIDOfForget } from './read-place-id-of-forget';

export interface PlaceActed {
  readonly placeID: string;
  readonly shortID: string;
  readonly callID: string;
  readonly tool: string;

  // the thread of the call
  readonly thread: string;
}

// One record for a call that an act place allowed. It makes no new definitions snapshot. When a
// forget of the place has begun, the record lands with no erasable fields, in the transaction that
// checks for the forget, so no such act is ever readable.
export async function writePlaceActed(
  context: Pick<PlaceContext, 'log' | 'definitions'>,
  acted: PlaceActed,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const row = await tx
      .$extendTables<PolicyTables>()
      .selectFrom('places')
      .select(['kind', 'origin'])
      .where('place_id', '=', acted.placeID)
      .executeTakeFirst();

    const isOpen = row?.origin === 'added' && (row.kind === 'site' || row.kind === 'mail_domain');
    const link = { placeID: acted.placeID, shortID: acted.shortID };
    const call = { callID: acted.callID, tool: acted.tool };

    if (isOpen) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: placesActedCodec.kind,
          definitions: context.definitions(),
          thread: acted.thread,
          payload: placesActedCodec.encode({ ...link, ...call }),
        },
      ]);

      return;
    }

    const txLog = { ...context.log, writer: { ...context.log.writer, db: tx } };

    const isForgotten = await probeForgottenPlace(txLog, acted.placeID);

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: placesActedCodec.kind,
        definitions: context.definitions(),
        thread: acted.thread,
        payload: placesActedCodec.encode(call),
        ...(isForgotten ? {} : { erasable: link }),
      },
    ]);
  });
}

// A record forget names its place in its stored capture. A forget that an earlier release began
// stored none, so its place comes from the target or from the open records it captured by key.
async function probeForgottenPlace(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  placeID: string,
): Promise<boolean> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['payload', sql`json_extract(payload, '$.capture.placeID')`.as('place_id')])
    .where('kind', '=', erasureStartedCodec.kind)
    .where(sql`json_extract(payload, '$.kind')`, '=', 'record')
    .execute();

  if (rows.some((row) => row.place_id === placeID)) {
    return true;
  }

  for (const row of rows.filter((entry) => entry.place_id === null)) {
    const started = erasureStartedCodec.decode(JSON.parse(row.payload));
    const keyIDs = 'ids' in started.capture.keys ? started.capture.keys.ids : [];

    const forgotten = await readPlaceIDOfForget(log, Number(started.targetID), keyIDs);

    if (forgotten === placeID) {
      return true;
    }
  }

  return false;
}
