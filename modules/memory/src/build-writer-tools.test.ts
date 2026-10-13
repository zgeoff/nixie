import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildWriterTools } from './build-writer-tools';
import { createWriterStaging } from './create-writer-staging';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();
  const staging = createWriterStaging();
  const registry = buildToolRegistry(buildWriterTools(memory.store, staging, 5));

  return { memory, staging, registry };
}

test('it declares read for recall and note for remember, edit and retire', async () => {
  const ctx = await setupTest();

  const effects = ['memory.recall', 'memory.remember', 'memory.edit', 'memory.retire'].map(
    (name) => [name, ctx.registry.findTool(name)?.definition.declaration.effects],
  );

  expect(effects).toStrictEqual([
    ['memory.recall', ['read']],
    ['memory.remember', ['note']],
    ['memory.edit', ['note']],
    ['memory.retire', ['note']],
  ]);
});

test('it stages a new item that cites your message in the batch', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([[12, { sequence: 12, text: 'I keep bees on the roof.', spans: [] }]]),
    shown: new Map(),
  });
  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'You keep bees.', quote: 'I keep bees', sourceID: 12 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { staged: true } });
  expect(staged.close()).toStrictEqual([
    {
      op: 'remember',
      text: 'You keep bees.',
      quote: 'I keep bees',
      sourceSequence: 12,
      target: null,
    },
  ]);
});

test('it returns a write that cites a message outside the batch to the model as an error', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);
  ctx.staging.open({
    sources: new Map([[12, { sequence: 12, text: 'I keep bees on the roof.', spans: [] }]]),
    shown: new Map(),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'You keep bees.', quote: 'I keep bees', sourceID: 40 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: "sourceID 40 is not one of the owner's messages in this batch",
  });
});

test('it stages a retirement bound to the version the session was shown', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.retire');

  invariant(tool);

  const staged = ctx.staging.open({
    sources: new Map([[12, { sequence: 12, text: 'I gave the bees away.', spans: [] }]]),
    shown: new Map([['item-bees', 3]]),
  });

  await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.retire',
      input: { itemID: 'item-bees', quote: 'I gave the bees away', sourceID: 12 },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(staged.close()).toStrictEqual([
    {
      op: 'retire',
      quote: 'I gave the bees away',
      sourceSequence: 12,
      target: { itemID: 'item-bees', version: 3 },
    },
  ]);
});

test('it delivers the items a recall finds', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.recall');
  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  invariant(tool);

  const outcome = await tool.definition.run(
    { callID: 'call-1', tool: 'memory.recall', input: { query: 'bees' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { items: [{ itemID: item.itemID, text: 'Keeps bees on the roof' }] },
  });
});

test('it binds an edit to the version a recall showed', async () => {
  const ctx = await setupTest();
  const recall = ctx.registry.findTool('memory.recall');
  const edit = ctx.registry.findTool('memory.edit');
  const item = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  invariant(recall && edit);

  const staged = ctx.staging.open({
    sources: new Map([[12, { sequence: 12, text: 'The bees are in the garden now.', spans: [] }]]),
    shown: new Map(),
  });
  const run = {
    runID: 'run-1',
    thread: 'memory-writer',
    tools: [],
    model: { model: 'm', profile: 'p' },
  };

  await recall.definition.run(
    { callID: 'call-1', tool: 'memory.recall', input: { query: 'bees' }, toolUseID: null },
    { run },
  );
  await edit.definition.run(
    {
      callID: 'call-2',
      tool: 'memory.edit',
      input: {
        itemID: item.itemID,
        text: 'Keeps bees in the garden',
        quote: 'in the garden',
        sourceID: 12,
      },
      toolUseID: null,
    },
    { run },
  );

  expect(staged.close()).toMatchObject([{ target: { itemID: item.itemID, version: 1 } }]);
});

test('it returns an edit of an item the session was never shown to the model as an error', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.edit');

  invariant(tool);
  ctx.staging.open({
    sources: new Map([[12, { sequence: 12, text: 'The bees are in the garden now.', spans: [] }]]),
    shown: new Map(),
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: {
        itemID: 'item-bees',
        text: 'Keeps bees in the garden',
        quote: 'in the garden',
        sourceID: 12,
      },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'memory-writer',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'item item-bees is not one you were shown; find it with memory.recall first',
  });
});

test.each([
  [
    'a remember with an itemID',
    'memory.remember',
    { text: 'x', quote: 'x', sourceID: 1, itemID: 'item-a' },
  ],
  ['a remember with no sourceID', 'memory.remember', { text: 'x', quote: 'x' }],
  ['an edit with no itemID', 'memory.edit', { text: 'x', quote: 'x', sourceID: 1 }],
  ['an edit with no quote', 'memory.edit', { itemID: 'item-a', text: 'x', sourceID: 1 }],
  [
    'an edit with a version',
    'memory.edit',
    { itemID: 'item-a', version: 1, text: 'x', quote: 'x', sourceID: 1 },
  ],
])('it refuses %s', async (_label, name, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput(input);

  expect(check).toMatchObject({ isValid: false });
});
