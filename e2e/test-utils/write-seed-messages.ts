import { writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import type { SpawnedNixie } from './start-spawned-nixie';
import { startTestLog } from './start-test-log';

export async function writeSeedMessages(
  nixie: Pick<SpawnedNixie, 'dataDir' | 'deploymentKey'>,
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
        erasable: { text, spans: [{ start: 0, end: text.length, source: 'typed' }] },
      })),
    );

    return records.map((record) => record.sequence);
  } finally {
    await testLog.writer.stop();
  }
}
