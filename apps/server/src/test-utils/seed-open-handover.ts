import { makeHandoverRecords } from '@heynixie/connectors';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

// An ask for a take-over that no record answered and whose time has passed by the time a nixie
// starts, as a nixie that stopped with an ask open leaves it. No nixie may hold the data's writer
// lock.
export async function seedOpenHandover(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<void> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: createFakeClock({ startMs: 1000 }),
  });

  try {
    const records = makeHandoverRecords({
      log: testLog.context.log,
      definitions: testLog.context.definitions,
    });

    await records.writeAsked({ reason: 'a CAPTCHA blocks the sign-in' });
  } finally {
    await testLog.writer.stop();
  }
}
