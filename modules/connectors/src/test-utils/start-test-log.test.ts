import { expect, test } from 'bun:test';
import { logProjections, readRecords, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { startTestLog } from './start-test-log';

test('it starts a log that writes and reads records, with the log projections', async () => {
  const log = await startTestLog();

  await writeRecords(log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' } },
  ]);

  const entries = await readRecords(log, { afterSequence: 0, limit: 10 });

  expect(entries.map((entry) => entry.record.kind)).toStrictEqual(['owner_message']);
  expect(log.projections).toBe(logProjections);
});

test("it starts the log's writer on the clock it is given", async () => {
  const log = await startTestLog(buildTestClock(Date.parse('2026-11-02T09:00:00.000Z')));

  expect(log.writer.clock.now()).toBe(Date.parse('2026-11-02T09:00:00.000Z'));
});
