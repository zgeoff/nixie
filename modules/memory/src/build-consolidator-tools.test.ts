import { expect, test } from 'bun:test';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildConsolidatorTools } from './build-consolidator-tools';
import { createConsolidationStaging } from './create-consolidation-staging';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();
  const staging = createConsolidationStaging();
  const registry = buildToolRegistry(buildConsolidatorTools(memory.store, staging, 5));

  return { memory, staging, registry };
}

test('it offers recall, which declares read, and consolidate, which declares note', async () => {
  const ctx = await setupTest();

  const effects = ['memory.recall', 'memory.consolidate'].map((name) => [
    name,
    ctx.registry.findTool(name)?.definition.declaration.effects,
  ]);

  expect(effects).toStrictEqual([
    ['memory.recall', ['read']],
    ['memory.consolidate', ['note']],
  ]);
});

test('it shows the session each item a recall returns, so a change to it binds to that version', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Keeps bees on the roof',
    origin: 'task',
    source: 'owner_data',
  });
  const recall = ctx.registry.findTool('memory.recall');
  const consolidate = ctx.registry.findTool('memory.consolidate');

  invariant(recall && consolidate);

  const run = ctx.staging.open(new Map(), 30);

  await recall.definition.run(
    { callID: 'call-1', tool: 'memory.recall', input: { query: 'bees' }, toolUseID: null },
    buildMockToolContext({ thread: 'memory-consolidator' }),
  );
  await consolidate.definition.run(
    {
      callID: 'call-2',
      tool: 'memory.consolidate',
      input: { changes: [{ kind: 'retire', itemIDs: [item.itemID], reason: 'Stale.' }] },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'memory-consolidator' }),
  );

  expect(run.close()).toStrictEqual([
    { kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner_data' },
  ]);
});

test('it returns each recalled item by the short ID the model reads', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });
  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);
  const shortID = shortIDs.get(item.itemID);
  const recall = ctx.registry.findTool('memory.recall');

  invariant(recall && shortID !== undefined);
  ctx.staging.open(new Map(), 30);

  const recalled = await recall.definition.run(
    { callID: 'call-1', tool: 'memory.recall', input: { query: 'bees' }, toolUseID: null },
    buildMockToolContext({ thread: 'memory-consolidator' }),
  );

  expect(recalled).toStrictEqual({
    status: 'ok',
    result: { items: [{ itemID: shortID, text: 'Keeps bees on the roof' }] },
  });
});

test('it stages the diff and returns how many changes it holds', async () => {
  const ctx = await setupTest();
  const consolidate = ctx.registry.findTool('memory.consolidate');

  invariant(consolidate);
  ctx.staging.open(
    new Map([
      [
        'item-1',
        { shortID: 'k3x9m2p7qa', version: 1, text: 'Keeps bees', source: 'owner', isPinned: false },
      ],
      [
        'item-2',
        { shortID: 'w8n4c6t1rb', version: 2, text: 'keeps bee', source: 'owner', isPinned: false },
      ],
    ]),
    30,
  );

  const outcome = await consolidate.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.consolidate',
      input: {
        changes: [
          {
            kind: 'merge',
            itemIDs: ['item-1', 'item-2'],
            text: 'Keeps bees',
            reason: 'Both items say the same.',
          },
        ],
      },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'memory-consolidator' }),
  );

  expect(outcome).toStrictEqual({ status: 'ok', result: { staged: 1 } });
});

test('it returns a refused diff to the model as an error', async () => {
  const ctx = await setupTest();
  const consolidate = ctx.registry.findTool('memory.consolidate');

  invariant(consolidate);
  ctx.staging.open(new Map(), 30);

  const outcome = await consolidate.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.consolidate',
      input: { changes: [{ kind: 'retire', itemIDs: ['item-7'], reason: 'Stale.' }] },
      toolUseID: null,
    },
    buildMockToolContext({ thread: 'memory-consolidator' }),
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'change 1: item item-7 is not one you were shown; find it with memory.recall first',
  });
});
