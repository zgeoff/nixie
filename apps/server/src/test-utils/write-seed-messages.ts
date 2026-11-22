import { writeRecords } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startDataLog } from './start-data-log';
import type { SpawnedNixie } from './start-spawned-nixie';

export async function writeSeedMessages(
  nixie: Pick<SpawnedNixie, 'dataDir' | 'deploymentKey'>,
  texts: readonly string[],
): Promise<readonly number[]> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: createFakeClock({ startMs: 1_000_000 }),
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
