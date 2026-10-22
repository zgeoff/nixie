import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildPinTool } from './build-pin-tool';
import type { TestMemoryOptions } from './test-utils';
import { makeToolAllowRule, readItemShortID, startTestMemory } from './test-utils';
import { buildMockProvenance } from './test-utils/build-mock-provenance';

async function setupTest(config: TestMemoryOptions = {}) {
  const memory = await startTestMemory(config);

  const registry = buildToolRegistry([buildPinTool(memory.store)]);

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

test("it proposes a pin of the item a short ID names, for the owner's review", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks the coast path on bank holidays',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.pin', input: { itemID: shortID, version: 1 }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const pending = await ctx.memory.store.proposals.listPending();

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason: expect.toBeString(),
    merged: false,
  });

  expect(pending).toMatchObject([{ operation: 'pin', itemID: item.itemID, targetVersion: 1 }]);
});

test('it pins the item at once under an allow rule that names memory.pin', async () => {
  const ctx = await setupTest({ gate: { findAllowRule: makeToolAllowRule('memory.pin') } });

  const item = await ctx.memory.store.remember({
    text: 'Walks the coast path on bank holidays',
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.pin', input: { itemID: shortID, version: 1 }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const core = await ctx.memory.store.readPinnedCore();

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 1,
  });

  expect(core).toMatchObject([{ itemID: item.itemID }]);
});

test('it answers a pin of a retired item with an error that names its short ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: buildMockProvenance(),
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.pin', input: { itemID: shortID, version: retired.version }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: `memory item ${shortID} is retired, so pin does not apply` }],
  });
});

test('it answers a pin of a version the item moved past with an error, and writes nothing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Walks the coast path on bank holidays',
    provenance: buildMockProvenance(),
  });

  const revised = await ctx.memory.store.remember({
    text: 'Walks the coast path on summer weekends',
    target: item,
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'Walks the coast path on autumn weekends',
    target: revised,
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.pin', input: { itemID: shortID, version: 2 }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const pending = await ctx.memory.store.proposals.listPending();
  const records = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.pinned'] });

  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: `memory item ${shortID} is at version 3, not the version 2 the caller read`,
      },
    ],
  });

  expect(pending).toStrictEqual([]);
  expect(records).toStrictEqual([]);
});

test('it answers a pin under an allow rule that takes the core past its budget with an error', async () => {
  const ctx = await setupTest({ gate: { findAllowRule: makeToolAllowRule('memory.pin') } });

  await ctx.memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const item = await ctx.memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    provenance: buildMockProvenance(),
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.pin', input: { itemID: shortID, version: 1 }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pin'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: expect.toStartWith(`pinning memory item ${shortID} takes`) }],
  });
});
