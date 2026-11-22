import { systemClock } from '@heynixie/clock';
import { makeTakeoverRecords } from '@heynixie/connectors';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// A hold that a device took on the desktop and no record ended, as a nixie that stopped mid-hold
// leaves it. No nixie may hold the data's writer lock.
export async function seedOpenTakeover(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<void> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const records = makeTakeoverRecords({
      log: testLog.context.log,
      definitions: testLog.context.definitions,
    });

    await records.writeStarted({ device: 'laptop' });
  } finally {
    await testLog.writer.stop();
  }
}
