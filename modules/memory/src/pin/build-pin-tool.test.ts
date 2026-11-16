import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import type { TestMemoryOptions } from '../test-utils';
import { readItemShortID, startTestMemory } from '../test-utils';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildPinTool } from './build-pin-tool';

async function setupTest(config: TestMemoryOptions = {}) {
  const memory = await startTestMemory(config);

  const registry = buildToolRegistry([buildPinTool(memory.store)]);

  return {
    memory,
    toolCallOptions: {
      registry,

      decide: buildAllowingDecisionPoint(),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        readOpenRepeat: () => Promise.resolve(null),
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
      logThread: 'conversation',
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
      logThread: 'conversation',
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
      logThread: 'conversation',
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
