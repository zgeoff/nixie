import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import type { RateToolOptions } from './build-rate-tool';
import { buildRateTool } from './build-rate-tool';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { createMemoryItem } from './test-utils/create-memory-item';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';

// A test memory, memory.rate under the names the config gives, in a registry, and the options a
// call runs under, which record each call and its result in the memory's log.
async function setupTest(config: RateToolOptions) {
  const memory = await startTestMemory();
  const tool = buildRateTool(memory.store, config);
  const registry = buildToolRegistry([tool]);

  return {
    memory,
    tool,
    toolCallOptions: {
      registry,

      // every call is allowed, so each reaches its tool
      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      // memory.rate runs direct, so nothing reaches the queue
      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it keeps the ratings of two items against the latest recall, and notes them for the owner', async () => {
  const ctx = await setupTest({ ownerName: 'Robin', agentName: 'Pip' });
  const [tram, jam] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' }),
    createMemoryItem(ctx.memory.store, { text: 'Makes plum jam each autumn' }),
  ]);

  await ctx.memory.store.recall({ itemIDs: [tram.itemID, jam.itemID], thread: 'conversation' });
  const ratings = [
    { item: await readItemShortID(ctx.memory.log, tram.itemID), verdict: 'helpful', note: 'yes' },
    { item: await readItemShortID(ctx.memory.log, jam.itemID), verdict: 'noise' },
  ];

  const outcome = await ctx.tool.run(
    { callID: 'call-1', tool: 'memory.rate', input: { ratings }, toolUseID: null },
    buildMockToolContext({ runID: 'run-1', thread: 'conversation' }),
  );
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(outcome).toStrictEqual({ status: 'ok', result: { message: 'Noted for Robin.' } });
  expect(records.map((entry) => entry.record).slice(-2)).toMatchObject([
    { kind: 'memory.recalled', sequence: expect.toBeNumber() },
    {
      kind: 'memory.rated',
      thread: 'conversation',
      payload: {
        recalledSequence: records.at(-2)?.record.sequence,
        runID: 'run-1',
        ratedBy: 'Pip',
        ratings: [
          { itemID: tram.itemID, version: 1, verdict: 'helpful', sealedNote: expect.toBeString() },
          { itemID: jam.itemID, version: 1, verdict: 'noise' },
        ],
      },
    },
  ]);
});

test('it refuses an item the latest recall did not deliver, with the reason, and keeps no rating', async () => {
  const ctx = await setupTest({ ownerName: 'Robin', agentName: 'Pip' });
  const [tram, jam] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' }),
    createMemoryItem(ctx.memory.store, { text: 'Makes plum jam each autumn' }),
  ]);

  await ctx.memory.store.recall({ itemIDs: [jam.itemID], thread: 'conversation' });
  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });
  const jamID = await readItemShortID(ctx.memory.log, jam.itemID);

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.rate',
      input: { ratings: [{ item: jamID, verdict: 'noise' }] },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'conversation' }),
  );
  const rated = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.rated'] });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `${jamID} was not among the memories you were given on the latest turn, so it can't be rated.`,
  });
  expect(rated).toStrictEqual([]);
});

test('it refuses a rating in a thread that was given no memories', async () => {
  const ctx = await setupTest({ ownerName: null, agentName: null });
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'task-7' });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.rate',
      input: { ratings: [{ item: tram.itemID, verdict: 'helpful' }] },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'conversation' }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'You have not been given any memories in this conversation yet, so there is nothing to rate.',
  });
});

test('it refuses an item rated twice in one call', async () => {
  const ctx = await setupTest({ ownerName: null, agentName: null });
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  const outcome = await ctx.tool.run(
    {
      callID: 'call-1',
      tool: 'memory.rate',
      input: {
        ratings: [
          { item: tram.itemID, verdict: 'helpful' },
          { item: tram.itemID, verdict: 'noise' },
        ],
      },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'conversation' }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `${tram.itemID} is rated twice; rate each item once.`,
  });
});

test('it refuses a note longer than one line', async () => {
  const ctx = await setupTest({ ownerName: null, agentName: null });
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  const result = await runToolCall(
    {
      tool: 'memory.rate',
      input: { ratings: [{ item: tram.itemID, verdict: 'misleading', note: 'one\ntwo' }] },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.rate'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({ isError: true });
});

test("it keeps the note out of the call's record", async () => {
  const ctx = await setupTest({ ownerName: null, agentName: null });
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.recall({ itemIDs: [tram.itemID], thread: 'conversation' });

  await runToolCall(
    {
      tool: 'memory.rate',
      input: { ratings: [{ item: tram.itemID, verdict: 'helpful', note: 'the tram mattered' }] },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.rate'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const [called] = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['tool_called'] });

  expect(called?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { input: { ratings: [{ item: tram.itemID, verdict: 'helpful' }] } },
  });
});

test('it answers a malformed call as invalid, and records only the IDs and verdicts it holds', async () => {
  const ctx = await setupTest({ ownerName: null, agentName: null });

  const result = await runToolCall(
    {
      tool: 'memory.rate',
      input: {
        ratings: [
          { item: 'k3x9m2p7qa', verdict: { note: 'a hidden note' }, note: 'a stray note' },
          { item: 'the tram stopped in May', verdict: 'noise' },
          'a stray line',
        ],
        aside: 'a stray key',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.rate'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const [called] = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['tool_called'] });

  expect(result).toMatchObject({ isError: true });
  expect(called?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { input: { ratings: [{ item: 'k3x9m2p7qa' }, { verdict: 'noise' }] } },
  });
});

test('it names the owner in its description, and the owner when the config names no one', () => {
  const named = buildRateTool(
    { rate: () => Promise.resolve() },
    {
      ownerName: 'Robin',
      agentName: null,
    },
  );
  const unnamed = buildRateTool(
    { rate: () => Promise.resolve() },
    {
      ownerName: null,
      agentName: null,
    },
  );

  expect(named.description).toBe(
    'Tell Robin how the memories you were given this turn worked. Use it when something stands ' +
      'out, not every turn. Nothing changes because of a rating; Robin sees it.',
  );
  expect(unnamed.description).toBe(
    'Tell the owner how the memories you were given this turn worked. Use it when something ' +
      'stands out, not every turn. Nothing changes because of a rating; the owner sees it.',
  );
});
