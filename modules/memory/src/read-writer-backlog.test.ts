import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readWriterBacklog } from './read-writer-backlog';
import { removeMessageKey } from './test-utils/remove-message-key';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads your messages and the replies after the sequence, oldest first', async () => {
  const ctx = await setupTest();
  const [before, message, reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hello there.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'See ⟦a recipe⟧.', spans: [{ start: 4, end: 14, source: 'paste' }] },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It needs two eggs.' },
    },
  ]);

  invariant(before && message && reply);

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: before.sequence,
    ownerLimit: 10,
    through: null,
  });

  expect(backlog).toStrictEqual([
    {
      sequence: message.sequence,
      role: 'owner',
      text: 'See ⟦a recipe⟧.',
      spans: [{ start: 4, end: 14, source: 'paste' }],
      recordedAt: message.recordedAt.getTime(),
      arrivedAt: null,
    },
    {
      sequence: reply.sequence,
      role: 'assistant',
      text: 'It needs two eggs.',
      spans: [],
      recordedAt: reply.recordedAt.getTime(),
      arrivedAt: null,
    },
  ]);
});

test('it leaves out conversation records that are neither a message nor a reply', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {},
    },
  ]);

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: 0,
    ownerLimit: 10,
    through: null,
  });

  expect(backlog).toStrictEqual([]);
});

test('it reads a forgotten message with no text', async () => {
  const ctx = await setupTest();
  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'My locker code is 4417.' },
    },
  ]);

  await removeMessageKey(ctx.memory.log, message?.sequence ?? -1);

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: 0,
    ownerLimit: 10,
    through: null,
  });

  expect(backlog).toMatchObject([{ role: 'owner', text: null, spans: [] }]);
});

test('it takes a message arrival time from the first wake recorded for it', async () => {
  const ctx = await setupTest();
  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  invariant(message);
  await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { messageSequence: message.sequence, at: 1_000_000 },
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { messageSequence: message.sequence, at: 1_090_000 },
    },
  ]);

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: 0,
    ownerLimit: 10,
    through: null,
  });

  expect(backlog).toMatchObject([{ sequence: message.sequence, arrivedAt: 1_000_000 }]);
});

test('it stops at the last sequence to read', async () => {
  const ctx = await setupTest();
  const [first] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The hive is called Marigold.' },
    },
  ]);

  invariant(first);

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: 0,
    ownerLimit: 10,
    through: first.sequence,
  });

  expect(backlog).toMatchObject([{ sequence: first.sequence }]);
});

test('it stops after the page that takes the backlog past the owner limit', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.memory.log,
    Array.from({ length: 150 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Note number ${String(index)}.` },
    })),
  );

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: 0,
    ownerLimit: 3,
    through: null,
  });

  expect(backlog).toHaveLength(100);
});

test('it reads past the first page while the backlog stays within the owner limit', async () => {
  const ctx = await setupTest();

  await writeRecords(
    ctx.memory.log,
    Array.from({ length: 150 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Note number ${String(index)}.` },
    })),
  );

  const backlog = await readWriterBacklog(ctx.memory.log, {
    after: 0,
    ownerLimit: 200,
    through: null,
  });

  expect(backlog).toHaveLength(150);
});
