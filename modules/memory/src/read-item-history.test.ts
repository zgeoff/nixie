import { expect, test } from 'bun:test';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads every version of an item with its provenance, oldest first', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: null,
      proposalID: null,
      checks: null,
    },
  });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history).toStrictEqual({
    itemID: item.itemID,
    state: 'active',
    versions: [
      {
        version: 1,
        change: 'created',
        state: 'active',
        origin: 'owner',
        source: 'owner',
        recordedAt: expect.toBeNumber(),
        status: 'readable',
        text: 'Lives on Elm Street',
      },
      {
        version: 2,
        change: 'edited',
        state: 'active',
        origin: 'memory_writer',
        source: 'owner',
        recordedAt: expect.toBeNumber(),
        status: 'readable',
        text: 'Lives on Oak Avenue',
      },
    ],
  });
});

test('it reads the history of an item that does not exist as null', async () => {
  const ctx = await setupTest();
  const history = await ctx.memory.store.readHistory('no-such-item');

  expect(history).toBeNull();
});
