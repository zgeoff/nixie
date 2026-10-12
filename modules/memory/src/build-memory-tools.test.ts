import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildMemoryTools } from './build-memory-tools';
import { startTestMemory } from './test-utils/start-test-memory';

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

test('it remembers a fact with the provenance of the run, never of the arguments', async () => {
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
        thread: 'task-9',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );
  invariant(outcome.status === 'ok' && typeof outcome.result['itemID'] === 'string');

  const history = await ctx.memory.store.readHistory(outcome.result['itemID']);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { itemID: expect.toBeString(), version: 1 },
  });
  expect(history?.versions).toMatchObject([{ origin: 'task', source: 'untrusted' }]);
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

test('it retires an item the model names', async () => {
  const ctx = await setupTest();
  const tool = ctx.registry.findTool('memory.retire');
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.retire',
      input: { itemID: item.itemID, version: 1 },
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
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(outcome).toStrictEqual({ status: 'ok', result: { itemID: item.itemID, version: 2 } });
  expect(history?.versions.at(-1)).toMatchObject({ change: 'retired', origin: 'conversation' });
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
  ['a recall with an unknown argument', 'memory.recall', { everything: true }],
  ['a recall with a cursor no page returned', 'memory.recall', { after: 'abc' }],
])('it refuses %s', async (_label, name, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput(input);

  expect(check).toMatchObject({ isValid: false });
});
