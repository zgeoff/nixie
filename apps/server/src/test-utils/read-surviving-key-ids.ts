import { systemClock } from '@heynixie/clock';
import { readRecordKeys } from '@heynixie/log';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// Which of these key IDs the key store of a stopped nixie still holds, read through the log
// module's key reader.
export async function readSurvivingKeyIDs(
  files: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
  keyIDs: readonly string[],
): Promise<readonly string[]> {
  const data = await startDataLog({
    dataDir: files.dataDir,
    deploymentKey: files.deploymentKey,
    clock: systemClock,
  });

  try {
    const keys = await readRecordKeys(data.context.log, keyIDs);

    return [...keys.keys()];
  } finally {
    await data.writer.stop();
  }
}
