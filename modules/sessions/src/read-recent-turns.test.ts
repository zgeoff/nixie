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

  expect(records.map((turn) => turn.record.sequence)).toStrictEqual([1, 2]);
});

test('it keeps a reply that committed after a message still pending, paired with the message before that one', async () => {
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

  expect(
    records.map((turn) => [turn.record.sequence, turn.answered?.sequence ?? null]),
  ).toStrictEqual([
    [1, null],
    [3, 1],
  ]);
});

test('it keeps only the newest turns that fit the token budget', async () => {
  const ctx = await setupTest();

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
    tokens: 60,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(records.map((turn) => turn.record.sequence)).toStrictEqual([2, 3]);
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
  expect(records.at(0)?.record.sequence).toBe(1);
});

test('it pairs each reply with the newest message before it, and a reply with none before it with nothing', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Good morning.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { timeZone: 'Asia/Tokyo' },
      erasable: { text: 'Where is the spare key?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Under the blue flowerpot.' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The side gate key is there too.' },
    },
  ]);

  const turns = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 5,
    tokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(
    turns.map((turn) => [turn.record.sequence, turn.answered?.sequence ?? null]),
  ).toStrictEqual([
    [1, null],
    [2, null],
    [3, 2],
    [4, 2],
  ]);
});

test('it pairs the oldest reply it keeps with the message it answers, though the budget leaves that message out', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { timeZone: 'Asia/Tokyo' },
      erasable: { text: `Where is the spare key? ${'x'.repeat(200)}` },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Under the blue flowerpot.' },
    },
  ]);

  const turns = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 3,
    tokens: 30,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(
    turns.map((turn) => [turn.record.sequence, turn.answered?.sequence ?? null]),
  ).toStrictEqual([[2, 1]]);
});

test('it leaves out every record that a summary covers', async () => {
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
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'And the side gate?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It has no lock.' },
    },
  ]);

  const turns = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 5,
    afterSequence: 2,
    tokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(turns.map((turn) => turn.record.sequence)).toStrictEqual([3, 4]);
});

test('it leaves out every record from before the newest reset of the conversation', async () => {
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
      kind: 'log_reset',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { resetAt: 1_760_000_000_000, lastSequence: 2, mode: 'conversations' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'And the side gate?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It has no lock.' },
    },
  ]);

  const turns = await readRecentTurns(ctx.tasks.context, {
    taskID: 'conversation',
    beforeSequence: 6,
    tokens: 30_000,
    times: { defaultZone: 'Australia/Sydney', now: new Date() },
  });

  expect(turns.map((turn) => turn.record.sequence)).toStrictEqual([4, 5]);
});
