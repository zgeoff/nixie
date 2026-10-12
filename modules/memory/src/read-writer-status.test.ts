import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readWriterStatus } from './read-writer-status';
import { removeMessageKey } from './test-utils/remove-message-key';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reports every message of yours as backlog before the writer first starts', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
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

  const status = await readWriterStatus(ctx.memory.log);

  expect(status).toStrictEqual({
    cursor: 0,
    backlog: 2,
    startSequence: 0,
    isCatchingUp: true,
    batches: 0,
    failures: 0,
    retryAt: null,
    lastError: null,
  });
});

test('it counts only your messages after the cursor as backlog', async () => {
  const ctx = await setupTest();
  const [first] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  invariant(first);
  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: first.sequence, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: first.sequence,
        mode: 'catch_up',
        at: 1_000_100,
        applied: [],
        proposed: 0,
        dropped: 0,
        catchUpEnded: true,
        model: null,
        profile: null,
        usage: null,
      },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The hive is called Marigold.' },
    },
  ]);

  const status = await readWriterStatus(ctx.memory.log);

  expect(status).toMatchObject({ cursor: first.sequence, backlog: 1, isCatchingUp: false });
});

test('it leaves replies out of the backlog', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Noted.' },
    },
  ]);

  const status = await readWriterStatus(ctx.memory.log);

  expect(status.backlog).toBe(1);
});

test('it reports the last error with its text', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
    {
      kind: 'memory.writer_failed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { code: 'batch_failed', failures: 1, retryAt: 1_030_000, at: 1_000_000 },
      erasable: { message: 'the model timed out' },
    },
  ]);

  const status = await readWriterStatus(ctx.memory.log);

  expect(status).toMatchObject({
    failures: 1,
    retryAt: 1_030_000,
    lastError: { code: 'batch_failed', message: 'the model timed out', at: 1_000_000 },
  });
});

test('it reports the last error with no text once its text is forgotten', async () => {
  const ctx = await setupTest();
  const [, failed] = await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
    {
      kind: 'memory.writer_failed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { code: 'batch_failed', failures: 1, retryAt: 1_030_000, at: 1_000_000 },
      erasable: { message: 'the model timed out' },
    },
  ]);

  await removeMessageKey(ctx.memory.log, failed?.sequence ?? -1);

  const status = await readWriterStatus(ctx.memory.log);

  expect(status.lastError).toStrictEqual({ code: 'batch_failed', message: null, at: 1_000_000 });
});
