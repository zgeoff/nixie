import { removeRecordKey } from '@heynixie/log';
import { readForgetStarted } from '../forget/read-forget-started';
import type { APIContext, APITables } from '../types';
import { readPlaceCascadeKeyIDs } from './read-place-cascade-key-ids';

// A forget of one record of a place takes the key of every record of that place: the keys its start
// record found while the place was readable, and any record of the place written since. Does
// nothing for a record of any other kind.
export async function removePlaceKeys(context: APIContext, recordSequence: number): Promise<void> {
  const started = await readForgetStarted(context, recordSequence);

  const keyIDs = new Set([
    ...(started?.cascadeKeyIDs ?? []),
    ...(await readPlaceCascadeKeyIDs(context.log, recordSequence)),
  ]);

  const targetKeyID = await readTargetKeyID(context, recordSequence);

  // The forgotten record's key goes last, so a rerun after a crash can still read which place it
  // names.
  const ordered = [...keyIDs].toSorted(
    (left, right) => Number(left === targetKeyID) - Number(right === targetKeyID),
  );

  for (const keyID of ordered) {
    await removeRecordKey(context.log, keyID);
  }
}

async function readTargetKeyID(
  context: APIContext,
  recordSequence: number,
): Promise<string | null> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', recordSequence)
    .executeTakeFirst();

  return row?.key_id ?? null;
}
