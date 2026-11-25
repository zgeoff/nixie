import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startCredentialTestLog } from './start-credential-test-log';

test('it reopens the data of a log that stopped', async () => {
  const clock = createFakeClock({ startMs: Date.parse('2026-10-16T09:00:00Z') });

  const first = await startCredentialTestLog({ clock });

  await writeRecords(first.log, [
    {
      kind: 'credential.refresh_lost',
      payload: { credentialID: 'a', attemptID: 'b' },
      definitions: { snapshotHash: 'test-snapshot' },
    },
  ]);

  await first.stop();

  const second = await startCredentialTestLog({ clock, dataDir: first.dataDir });
  const records = await readRecords(second.log, { afterSequence: 0 });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual(['credential.refresh_lost']);
});
