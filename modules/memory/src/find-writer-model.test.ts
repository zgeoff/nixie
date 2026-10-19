import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { findWriterModel } from './find-writer-model';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    readVersionRow: (itemID: string) =>
      memory.log.writer.db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_versions')
        .selectAll()
        .where('item_id', '=', itemID)
        .executeTakeFirstOrThrow(),
  };
}

test('it finds the model the version holds', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
      model: 'claude-writer-2',
    },
  });

  const row = await ctx.readVersionRow(item.itemID);
  const model = await findWriterModel(ctx.memory.log, row);

  expect(model).toBe('claude-writer-2');
});

test('it finds the model of the batch that applied a writer version that holds none', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
      thread: 'memory-writer',
    },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 1,
        mode: 'catch_up',
        at: 1_000_000,
        applied: [{ itemID: item.itemID, version: 1 }],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: 'claude-writer-1',
        profile: 'writer-direct',
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
  ]);

  const row = await ctx.readVersionRow(item.itemID);
  const model = await findWriterModel(ctx.memory.log, row);

  expect(model).toBe('claude-writer-1');
});

test('it finds no model for a writer version the next batch did not apply', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
      thread: 'memory-writer',
    },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 1,
        mode: 'catch_up',
        at: 1_000_000,
        applied: [],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: 'claude-writer-1',
        profile: 'writer-direct',
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
  ]);

  const row = await ctx.readVersionRow(item.itemID);
  const model = await findWriterModel(ctx.memory.log, row);

  expect(model).toBeNull();
});

test('it finds no model for a writer version with no batch published after it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
      thread: 'memory-writer',
    },
  });

  const row = await ctx.readVersionRow(item.itemID);
  const model = await findWriterModel(ctx.memory.log, row);

  expect(model).toBeNull();
});
