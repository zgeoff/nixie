import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readRecentTurns } from './read-recent-turns';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it reads the messages and replies before the first inbox record, oldest first, leaving out other kinds', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Where is the spare key?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Under the blue flowerpot.' },
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
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'And the side gate?' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'A message that lands during the turn.' },
    },
  ]);

  const records = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 5,
    tokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(records.map((record) => record.sequence)).toStrictEqual([1, 2]);
});

test('it keeps a reply that committed after a message still pending', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Where is the spare key?' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'A message past the batch the turn took.' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { messageID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' },
      erasable: { text: 'Under the blue flowerpot.' },
    },
  ]);

  const records = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 2,
    tokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(records.map((record) => record.sequence)).toStrictEqual([1, 3]);
});

test('it keeps only the newest turns that fit the token budget', async () => {
  const ctx = await setupTest();

  // each line renders as 99 or 100 characters, by how many digits the day of the month has, so 25
  // tokens
  await writeRecords(
    ctx.tasks.context.log,
    ['first', 'secnd', 'third'].map((word) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `${word} ${'x'.repeat(59)}` },
    })),
  );

  const records = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 4,
    tokens: 50,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(records.map((record) => record.sequence)).toStrictEqual([2, 3]);
});

test('it reads back past a page of records', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.tasks.context.log,
    Array.from({ length: 250 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Message ${index + 1}.` },
    })),
  );

  const records = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 251,
    tokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(records).toHaveLength(250);
  expect(records.at(0)?.sequence).toBe(1);
});
