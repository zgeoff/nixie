import type { Log } from '@heynixie/log';
import { readOpenTakeover } from './read-open-takeover';
import type { TakeoverRecords } from './types';

// A hold lives in memory, so one that was open when nixie stopped is over. Its end is written now,
// with no sites and no window, because nothing is left to read them from.
export async function endTakeoverCutByRestart(
  log: Pick<Log, 'writer'>,
  records: TakeoverRecords,
): Promise<void> {
  const startedAtMs = await readOpenTakeover(log.writer.db);

  if (startedAtMs === null) {
    return;
  }

  await records.writeEnded({
    by: 'restart',
    durationSeconds: Math.round((log.writer.clock.now() - startedAtMs) / 1000),
    read: null,
  });
}
