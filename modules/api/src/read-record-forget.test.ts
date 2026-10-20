import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readRecordForget } from './read-record-forget';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it finds the first record of the kind that names the sequence', async () => {
  const ctx = await setupTest();

  const [first] = await writeRecords(ctx.context.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: 4 },
    },
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: 4 },
    },
  ]);

  invariant(first);

  const found = await readRecordForget(ctx.writer.db, {
    kind: 'record.forget_started',
    sequence: 4,
  });

  expect(found).toStrictEqual({ sequence: first.sequence, recordedAt: expect.toBeNumber() });
});

test('it finds none for a sequence that no record of the kind names', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'record.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { recordSequence: 4 },
    },
  ]);

  const found = await readRecordForget(ctx.writer.db, { kind: 'record.forgotten', sequence: 4 });

  expect(found).toBeNull();
});
