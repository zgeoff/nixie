import { onTestFinished } from 'bun:test';
import type { Clock } from '@heynixie/clock';
import { startWriter } from '@heynixie/log';
import type { StoppableLog } from './start-test-log';

// Stops the log's writer and starts a new one over the same data directory, the way a restart of
// the server does. The old writer is closed, so nothing it held in memory reaches the new log.
export async function restartTestLog(log: StoppableLog, clock: Clock): Promise<StoppableLog> {
  await log.writer.stop();

  const writer = await startWriter({ dataDir: log.writer.dataDir, clock });

  onTestFinished(() => writer.stop());

  return { ...log, writer };
}
