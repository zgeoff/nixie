import { expect, test } from 'bun:test';
import { readRecords } from '../record/read-records';
import { seedRecord } from './seed-record';
import { startTestLog } from './start-test-log';

test('it writes a record of the kind and thread it is given and returns it with its sequence', async () => {
  const ctx = await startTestLog();
  const record = await seedRecord(ctx, { kind: 'turn_finished', thread: 'garden' });
  const [read] = await readRecords(ctx.log, { afterSequence: 0 });

  expect(record).toMatchObject({ kind: 'turn_finished', thread: 'garden', sequence: 1 });
  expect(read?.record.sequence).toBe(record.sequence);
});

test('it writes the record with the test definitions', async () => {
  const ctx = await startTestLog();
  const record = await seedRecord(ctx, { kind: 'owner_message' });

  expect(record).toMatchObject({ definitions: { snapshotHash: 'sha256:test' } });
});
