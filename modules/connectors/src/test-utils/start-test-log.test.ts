import { expect, test } from 'bun:test';
import { logProjections, readRecords, writeRecords } from '@heynixie/log';
import { startTestLog } from './start-test-log';

test('it starts a log that writes and reads records, with the log projections', async () => {
  const log = await startTestLog();

  await writeRecords(log, [{ kind: 'note.added', definitions: { snapshotHash: 'sha256:test' } }]);

  const entries = await readRecords(log, { afterSequence: 0, limit: 10 });

  expect(entries.map((entry) => entry.record.kind)).toStrictEqual(['note.added']);
  expect(log.projections).toBe(logProjections);
});
