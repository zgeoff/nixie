import type { Log, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import { devicePageEventCodec } from '../record/device-page-event-codec';

// How many times an hour one device's events may wake the conversation
export const wakesPerHour = 6;

// Whether the device may wake the conversation again: it has woken it fewer than 6 times in the
// last hour, counted from its page event records that kept their wake.
export async function probeWakeRoom(
  log: Pick<Log, 'writer'>,
  deviceID: string,
  nowMs: number,
): Promise<boolean> {
  const woken = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((builder) => builder.fn.countAll<number>().as('count'))
    .where('kind', '=', devicePageEventCodec.kind)
    .where('recorded_at', '>', nowMs - 3_600_000)
    .where(sql`json_extract(payload, '$.device')`, '=', deviceID)
    .where(sql`json_extract(payload, '$.wake')`, '=', 1)
    .executeTakeFirstOrThrow();

  return woken.count < wakesPerHour;
}
