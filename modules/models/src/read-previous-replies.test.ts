import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readPreviousReplies } from './read-previous-replies';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it reads the last turn replies, oldest first, each with the message before it', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It is on the porch.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Thanks.' },
    },
  ]);

  const replies = await readPreviousReplies(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 5,
  });

  expect(
    replies.map((turn) => ({
      reply: turn.record.sequence,
      answered: turn.answered?.sequence ?? null,
    })),
  ).toStrictEqual([
    { reply: 2, answered: 1 },
    { reply: 3, answered: 1 },
  ]);
});

test('it leaves out the replies of an earlier turn', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Good morning.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Not yet.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const replies = await readPreviousReplies(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: Number.MAX_SAFE_INTEGER,
  });

  expect(
    replies.map((turn) => ({
      reply: turn.record.sequence,
      answered: turn.answered?.sequence ?? null,
    })),
  ).toStrictEqual([{ reply: 4, answered: 3 }]);
});

test('it pairs a reply with the message before a pending one, which answers no reply', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'A message that lands during the turn.' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Not yet.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const replies = await readPreviousReplies(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 2,
  });

  expect(
    replies.map((turn) => ({
      reply: turn.record.sequence,
      answered: turn.answered?.sequence ?? null,
    })),
  ).toStrictEqual([{ reply: 3, answered: 1 }]);
});

test('it reads a reply with no message before it as answering none', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Good morning.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const replies = await readPreviousReplies(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: Number.MAX_SAFE_INTEGER,
  });

  expect(
    replies.map((turn) => ({
      reply: turn.record.sequence,
      answered: turn.answered?.sequence ?? null,
    })),
  ).toStrictEqual([{ reply: 1, answered: null }]);
});

test('it reads no reply when the last turn sent none', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Not yet.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Never mind.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const replies = await readPreviousReplies(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: Number.MAX_SAFE_INTEGER,
  });

  expect(replies).toStrictEqual([]);
});
