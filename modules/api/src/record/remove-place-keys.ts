import { removeRecordKey } from '@heynixie/log';
import { readForgetStarted } from '../forget/read-forget-started';
import type { APIContext } from '../types';
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

  for (const keyID of keyIDs) {
    await removeRecordKey(context.log, keyID);
  }
}
