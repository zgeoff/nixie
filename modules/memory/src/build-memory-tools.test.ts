import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildMemoryTools } from './build-memory-tools';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();
  const registry = buildToolRegistry(buildMemoryTools(memory.store));

  return { memory, registry };
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
    gate: { limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 1 } },
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

  const outcome = await tool.definition.run(call, context);

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
