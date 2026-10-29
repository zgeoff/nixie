import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildSensitiveTool } from './build-sensitive-tool';
import { readItemShortID, startTestMemory } from './test-utils';
import { buildMockProvenance } from './test-utils/build-mock-provenance';

async function setupTest() {
  const memory = await startTestMemory();

  const registry = buildToolRegistry([buildSensitiveTool(memory.store)]);

  return {
    memory,
    toolCallOptions: {
      registry,

      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it marks the item sensitive at once, with a record that names the thread of the call', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The owner banks with Harbour Mutual, account ending 4417',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    {
      tool: 'memory.mark_sensitive',
      input: { itemID: shortID, isSensitive: true },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.mark_sensitive'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const page = await ctx.memory.store.view.readPage({ state: 'active' });
  const pending = await ctx.memory.store.proposals.listPending();

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.sensitive_marked'],
  });

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 1,
  });

  expect(page.items).toMatchObject([{ itemID: item.itemID, isSensitive: true }]);
  expect(pending).toStrictEqual([]);

  expect(records.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    ['conversation', { itemID: item.itemID, isSensitive: true }],
  ]);
});

test('it clears the mark of a sensitive item when the call sets isSensitive false', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The owner banks with Harbour Mutual, account ending 4417',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  await runToolCall(
    {
      tool: 'memory.mark_sensitive',
      input: { itemID: shortID, isSensitive: false },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.mark_sensitive'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const page = await ctx.memory.store.view.readPage({ state: 'active' });

  expect(page.items).toMatchObject([{ itemID: item.itemID, isSensitive: false }]);
});

test('it answers a mark of an item that does not exist with an error', async () => {
  const ctx = await setupTest();

  const result = await runToolCall(
    {
      tool: 'memory.mark_sensitive',
      input: { itemID: 'zz9zz9zz9z', isSensitive: true },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.mark_sensitive'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.sensitive_marked'],
  });

  expect(result).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: 'no memory item zz9zz9zz9z to change' }],
  });

  expect(records).toStrictEqual([]);
});
