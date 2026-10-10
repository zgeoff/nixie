import { expect, test } from 'bun:test';
import { readRecords } from './read-records';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

test('it returns every record after the sequence with the rows as of that record', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    {
      kind: 'turn_finished',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'second' },
    },
    { kind: 'definitions_seeded', definitions: { snapshotHash: 'sha256:dd44' } },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:dd44' }, thread: 'conversation' },
  ]);

  const read = await readRecords(ctx.log, { afterSequence: 1 });

  // the rows as of each record, never the current rows under an older sequence
  expect(read).toMatchObject([
    {
      record: { sequence: 2, erasable: { status: 'readable', fields: { text: 'second' } } },
      changes: [
        {
          projection: 'threads',
          key: 'conversation',
          row: { first_sequence: 1, last_sequence: 2, record_count: 2 },
        },
      ],
    },
    { record: { sequence: 3, erasable: { status: 'none' } }, changes: [] },
    {
      record: { sequence: 4, erasable: { status: 'none' } },
      changes: [
        {
          projection: 'threads',
          key: 'conversation',
          row: { first_sequence: 1, last_sequence: 4, record_count: 3 },
        },
      ],
    },
  ]);
  expect(read).toHaveLength(3);
});

test('it returns no records after the newest sequence', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const read = await readRecords(ctx.log, { afterSequence: 1 });

  expect(read).toStrictEqual([]);
});

test('it returns only the records of the thread asked for, up to the limit', async () => {
  const ctx = await startTestLog();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'task_created', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'task-backlog' },
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
  ]);

  const read = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: 'conversation',
    limit: 2,
  });

  expect(read.map((entry) => entry.record.sequence)).toStrictEqual([1, 3]);
});
