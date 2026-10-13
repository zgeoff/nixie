import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildMemoryTools } from './build-memory-tools';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import type { TestMemoryOptions } from './test-utils/start-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

// a test memory with the gate the config gives, the memory tools' registry, and the options a tool
// call runs under, which record each call and its result in the memory's log
async function setupTest(config: TestMemoryOptions = {}) {
  const memory = await startTestMemory(config);
  const registry = buildToolRegistry(buildMemoryTools(memory.store));

  return {
    memory,
    registry,
    toolCallOptions: {
      registry,

      // every call is allowed, so each reaches its tool
      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      // the memory tools run direct, so nothing reaches the queue
      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it declares read for recall and note for remember and retire', async () => {
  const ctx = await setupTest();

  const effects = ['memory.recall', 'memory.remember', 'memory.retire'].map((name) => [
    name,
    ctx.registry.findTool(name)?.definition.declaration.effects,
  ]);

  expect(effects).toStrictEqual([
    ['memory.recall', ['read']],
    ['memory.remember', ['note']],
    ['memory.retire', ['note']],
  ]);
});

test('it applies a backed fact with the caller and model of the run, never of the arguments', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });
  const tool = buildToolRegistry(buildMemoryTools(memory.store)).findTool('memory.remember');

  invariant(tool);
  await writeOwnerMessageRecord(memory.log, {
    thread: 'task-9',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'Allergic to hazelnuts', quote: "I'm allergic to hazelnuts" },
      toolUseID: null,
    },
    buildMockToolContext({
      thread: 'task-9',
      model: { model: 'test-model', profile: 'standard' },
    }),
  );

  invariant(outcome.status === 'ok' && typeof outcome.result['itemID'] === 'string');

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select(['origin', 'source', 'task_id', 'model'])
    .where('item_id', '=', outcome.result['itemID'])
    .executeTakeFirstOrThrow();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: expect.toBeString(), version: 1 },
  });
  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
  expect(row).toStrictEqual({
    origin: 'task',
    source: 'owner',
    task_id: 'task-9',
    model: 'test-model',
  });
});

test('it returns a proposal, not an error, for a fact with no quote', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'Allergic to hazelnuts' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');
  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason: 'no_quote',
    merged: false,
  });
  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test('it returns a stale edit to the model as an error', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.remember');
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  invariant(tool);
  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'Lives on Oak Avenue', itemID: item.itemID, version: 1 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.toInclude('is at version 2'),
  });
});

test('it retires an item the model read and you asked to retire', async () => {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });
  const tool = buildToolRegistry(buildMemoryTools(memory.store)).findTool('memory.retire');
  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  invariant(tool);
  await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'I moved out of Elm Street',
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });
  await memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.retire',
      input: { itemID: item.itemID, version: 1, intentQuote: 'I moved out of Elm Street' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );
  const history = await memory.store.readHistory(item.itemID);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: item.itemID, version: 2 },
  });
  expect(history?.versions.at(-1)).toMatchObject({ change: 'retired', origin: 'conversation' });
});

test('it returns a full proposal cap to the model as an error', async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 1, closeMatchScore: 0.6 },
    },
  });
  const tool = buildToolRegistry(buildMemoryTools(memory.store)).findTool('memory.remember');
  const call = {
    callID: 'call-1',
    tool: 'memory.remember',
    input: { text: 'Likes jazz' },
    toolUseID: null,
  };
  const context = {
    run: {
      runID: 'run-1',
      thread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  };

  invariant(tool);
  await tool.definition.run(call, context);

  const outcome = await tool.definition.run(
    { ...call, callID: 'call-2', input: { text: 'Likes opera' } },
    context,
  );

  expect(outcome).toMatchObject({ status: 'error', message: expect.toInclude('memory proposals') });
});

test('it recalls items with a result that its output schema accepts', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.recall');

  invariant(tool);
  await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.recall',
      input: { query: 'hazelnuts', includeHistory: true },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');
  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
  expect(outcome.result).toMatchObject({
    items: [{ text: 'Allergic to hazelnuts', history: [{ version: 1 }] }],
    next: null,
  });
});

test('it tells the model when to reach for recall', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.recall');

  expect(tool?.definition.description).toInclude(
    'Use it when you half-remember something said, or when a detail from before would change your answer.',
  );
});

test('it recalls a version with its quote, its model and a readable date', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 1, 9, 30)));
  onTestFinished(() => {
    setSystemTime();
  });
  const item = await ctx.memory.store.remember({
    text: 'Keeps a sourdough starter called Gerald',
    evidenceQuote: 'Gerald the starter needs feeding again',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
      model: 'test-model-1',
    },
  });

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: item.itemID,
        isPinned: false,
        version: 1,
        change: 'created',
        state: 'active',
        origin: 'conversation',
        source: 'owner',
        recordedAt: '2026-10-01 09:30 UTC',
        text: 'Keeps a sourdough starter called Gerald',
        quote: 'Gerald the starter needs feeding again',
        model: 'test-model-1',
      },
    ],
    next: null,
  });
});

test('it recalls a version with no quote or model without them', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 8, 14, 18, 5)));
  onTestFinished(() => {
    setSystemTime();
  });
  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: item.itemID,
        isPinned: false,
        version: 1,
        change: 'created',
        state: 'active',
        origin: 'owner',
        source: 'owner',
        recordedAt: '2026-09-14 18:05 UTC',
        text: 'Plays the cello on Sundays',
        model: null,
      },
    ],
    next: null,
  });
});

test('it gives the model a recalled item and leaves no readable copy once the item is forgotten', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Sister Ada lives in Leeds',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await runToolCall(
    { tool: 'memory.recall', input: { query: 'Ada lives in Leeds' }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: item.itemID, text: 'Sister Ada lives in Leeds' }],
  });
  expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: { result: { items: [{ itemID: item.itemID, version: 1 }], next: null } },
    },
  });
  expect(JSON.stringify(entries)).not.toInclude('Leeds');
});

test('it applies a remembered fact and leaves no readable copy of its text once it is forgotten', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Allergic to hazelnuts', quote: "I'm allergic to hazelnuts" },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const content = result.structuredContent;

  invariant(
    typeof content === 'object' &&
      content !== null &&
      'itemID' in content &&
      typeof content.itemID === 'string',
    'the remember applied no item',
  );
  const itemID = content.itemID;

  await ctx.memory.store.forget({
    target: { itemID, version: 1 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  // the owner's own message keeps its words, and only the item's text is gone
  expect(result.structuredContent).toStrictEqual({ status: 'applied', itemID, version: 1 });
  expect(JSON.stringify(entries)).not.toInclude('Allergic to hazelnuts');
});

test('it records a remember call with neither its text nor its quote, which the gate has not checked', async () => {
  const ctx = await setupTest();

  await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Sister Ada lives in Leeds', quote: 'Sister Ada lives in Leeds', pin: false },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_called')?.record).toMatchObject({
    erasable: { status: 'readable', fields: { input: { pin: false } } },
  });
});

test.each([
  ['a remember with an itemID and no version', 'memory.remember', { text: 'x', itemID: 'item-a' }],
  ['a remember with no text', 'memory.remember', { itemID: 'item-a', version: 1 }],
  ['a retire with no version', 'memory.retire', { itemID: 'item-a' }],
  ['a remember with an empty quote', 'memory.remember', { text: 'x', quote: '' }],
  ['a recall with an unknown argument', 'memory.recall', { everything: true }],
  ['a recall with a cursor no page returned', 'memory.recall', { after: 'abc' }],
])('it refuses %s', async (_label, name, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput(input);

  expect(check).toMatchObject({ isValid: false });
});
