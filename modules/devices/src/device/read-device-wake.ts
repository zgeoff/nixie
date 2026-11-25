import type { Log, LogTables } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import { sql } from 'kysely';
import { deviceWatchSetCodec } from '../record/device-watch-set-codec';

type WakeChange = ReturnType<typeof deviceWatchSetCodec.decode>['wake'][number];

// The changes of a device that wake the model, from the newest devices.watch call for it. A device
// that no call named wakes the model on none.
export async function readDeviceWake(
  log: Pick<Log, 'writer'>,
  deviceID: string,
): Promise<readonly WakeChange[]> {
  const newest = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', deviceWatchSetCodec.kind)
    .where(sql`json_extract(payload, '$.device')`, '=', deviceID)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return newest === undefined
    ? []
    : deviceWatchSetCodec.decode(parseJSONObject(newest.payload)).wake;
}
