import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import { readWriterRow } from './read-writer-row';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it holds a planned batch as pending without moving the cursor', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 5, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_planned',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { start: 0, end: 3, mode: 'catch_up', at: 1_000_100 },
    },
  ]);

  const row = await readWriterRow(ctx.memory.log);

  expect(row).toMatchObject({ cursor: 0, pending_start: 0, pending_end: 3 });
});

test('it advances the cursor, clears the pending batch and counts catch-up items on a publish', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 5, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_planned',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { start: 0, end: 3, mode: 'catch_up', at: 1_030_000 },
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 3,
        mode: 'catch_up',
        at: 1_030_500,
        applied: [{ itemID: 'item-a', version: 1 }],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: null,
        profile: null,
        usage: null,
      },
    },
  ]);

  const row = await readWriterRow(ctx.memory.log);

  expect(row).toMatchObject({
    cursor: 3,
    pending_start: null,
    pending_end: null,
    batches: 1,
    last_batch_at: 1_030_500,
    catch_up_applied: 1,
    caught_up_sequence: null,
  });
});

test('it clears the failures and the retry time on a publish', async () => {
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
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 3,
        mode: 'live',
        at: 1_030_500,
        applied: [],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: null,
        profile: null,
        usage: null,
      },
    },
  ]);

  const row = await readWriterRow(ctx.memory.log);

  expect(row).toMatchObject({ failures: 0, retry_at: null, last_error_code: 'batch_failed' });
});

test('it leaves the catch-up count as it was on a live publish', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 4,
        mode: 'live',
        at: 1_000_500,
        applied: [{ itemID: 'item-a', version: 1 }],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: null,
        profile: null,
        usage: null,
      },
    },
  ]);

  const row = await readWriterRow(ctx.memory.log);

  expect(row.catch_up_applied).toBe(0);
});

test('it marks the catch-up ended at the sequence of the publish that ends it', async () => {
  const ctx = await setupTest();

  const [, published] = await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 1, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 1,
        mode: 'catch_up',
        at: 1_000_500,
        applied: [],
        proposed: 0,
        dropped: 0,
        catchUpEnded: true,
        model: null,
        profile: null,
        usage: null,
      },
    },
  ]);
  const row = await readWriterRow(ctx.memory.log);

  expect(row.caught_up_sequence).toBe(published?.sequence ?? -1);
});

test('it records a failure with its backoff, its code and its record', async () => {
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
      payload: { code: 'batch_failed', failures: 2, retryAt: 1_060_000, at: 1_000_000 },
      erasable: { message: 'the model timed out' },
    },
  ]);
  const row = await readWriterRow(ctx.memory.log);

  expect(row).toMatchObject({
    failures: 2,
    retry_at: 1_060_000,
    last_error_code: 'batch_failed',
    last_error_sequence: failed?.sequence,
    last_error_at: 1_000_000,
    updated_sequence: failed?.sequence,
  });
});

test('it rebuilds the same row as the live fold', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 2, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 2,
        mode: 'catch_up',
        at: 1_000_200,
        applied: [{ itemID: 'item-a', version: 1 }],
        proposed: 1,
        dropped: 0,
        catchUpEnded: true,
        model: 'claude-test-1',
        profile: 'writer-direct',
        usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
    {
      kind: 'memory.writer_failed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { code: 'batch_failed', failures: 1, retryAt: 1_030_300, at: 1_000_300 },
      erasable: { message: 'the model timed out' },
    },
  ]);

  const live = await readWriterRow(ctx.memory.log);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readWriterRow(ctx.memory.log);

  expect(live.batches).toBe(1);
  expect(rebuilt).toStrictEqual(live);
});
