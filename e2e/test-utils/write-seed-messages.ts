import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { startTestLog } from '../nixie/start-test-log';
import type { TestNixie } from './start-test-nixie';

export async function writeSeedMessages(
  nixie: Pick<TestNixie, 'dataDir' | 'deploymentKey'>,
  texts: readonly string[],
): Promise<readonly number[]> {
  const testLog = await startTestLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: buildTestClock(1_000_000),
  });

  try {
    const records = await writeRecords(
      testLog.context.log,
      texts.map((text) => ({
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text },
      })),
    );

    return records.map((record) => record.sequence);
  } finally {
    await testLog.writer.stop();
  }
}
