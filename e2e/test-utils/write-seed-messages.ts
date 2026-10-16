import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { startTestLog } from '../nixie/start-test-log';
import type { TestNixie } from './start-test-nixie';

// Records your messages on the conversation thread before nixie first starts, as a past
// conversation left them, so memory's first start finds them for its catch-up. It returns their
// sequences, and lets go of the data directory before nixie takes it.
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
