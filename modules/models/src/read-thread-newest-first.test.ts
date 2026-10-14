import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readThreadNewestFirst } from './read-thread-newest-first';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it reads the thread records of the kinds given, newest first, leaving out other threads and kinds', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Is the bakery open on Sunday?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Only until noon.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-backlog',
      erasable: { text: 'A message on another thread.' },
    },
  ]);

  const records = await Array.fromAsync(
    readThreadNewestFirst(ctx.tasks.context, 'conversation', ['owner_message', 'model.reply']),
  );

  expect(records.map((record) => record.sequence)).toStrictEqual([2, 1]);
});

test('it reads on past a full page to the oldest record', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.tasks.context.log,
    Array.from({ length: 201 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Message ${index + 1}.` },
    })),
  );

  const records = await Array.fromAsync(
    readThreadNewestFirst(ctx.tasks.context, 'conversation', ['owner_message']),
  );

  expect(records.map((record) => record.sequence)).toStrictEqual(
    Array.from({ length: 201 }, (_, index) => 201 - index),
  );
});
