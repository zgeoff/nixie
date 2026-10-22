import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildUnpinTool } from './build-unpin-tool';
import { readItemShortID, startTestMemory } from './test-utils';
import { buildMockProvenance } from './test-utils/build-mock-provenance';

async function setupTest() {
  const memory = await startTestMemory();

  const registry = buildToolRegistry([buildUnpinTool(memory.store)]);

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

test('it unpins the item at once, with a pinned record that names the thread of the call', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks oat milk in coffee',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.unpin', input: { itemID: shortID }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.unpin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const core = await ctx.memory.store.readPinnedCore();
  const pending = await ctx.memory.store.proposals.listPending();

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.pinned'],
  });

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 1,
  });

  expect(core).toStrictEqual([]);
  expect(pending).toStrictEqual([]);

  expect(records.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    [null, { itemID: item.itemID, isPinned: true }],
    ['conversation', { itemID: item.itemID, isPinned: false }],
  ]);
});

test('it answers an unpin of an item outside the pinned core with an error, and writes nothing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks oat milk in coffee',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.unpin', input: { itemID: shortID }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.unpin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.pinned'],
  });

  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: `memory item ${shortID} is not in the pinned core, so unpin does not apply`,
      },
    ],
  });

  expect(records).toStrictEqual([]);
});

test('it answers an unpin of an item that does not exist with an error', async () => {
  const ctx = await setupTest();

  const result = await runToolCall(
    { tool: 'memory.unpin', input: { itemID: 'k3v8q2m7xz' }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.unpin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: 'no memory item k3v8q2m7xz to change' }],
  });
});
