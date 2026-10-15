import { expect, test } from 'bun:test';
import { readConsolidationItems } from './read-consolidation-items';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads every active item, oldest first, while they fit the budget', async () => {
  const ctx = await setupTest();

  const owner = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const bees = await ctx.memory.store.remember({ text: 'Keeps bees', provenance: owner });
  const choir = await ctx.memory.store.remember({ text: 'Sings in a choir', provenance: owner });
  const old = await ctx.memory.store.remember({ text: 'Lives on Elm Street', provenance: owner });

  await ctx.memory.store.retire({ target: old, provenance: owner });

  const listed = await readConsolidationItems(ctx.memory.store, {
    listTokens: 1000,
    thread: 'memory-consolidator',
  });

  expect(listed.isComplete).toBe(true);
  expect(listed.items.map((item) => item.itemID)).toStrictEqual([bees.itemID, choir.itemID]);
});

test('it stops at the item that passes the budget and says the list is not complete', async () => {
  const ctx = await setupTest();

  const owner = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const bees = await ctx.memory.store.remember({ text: 'Keeps bees', provenance: owner });

  await ctx.memory.store.remember({ text: 'Sings in a choir', provenance: owner });

  const listed = await readConsolidationItems(ctx.memory.store, {
    listTokens: 30,
    thread: 'memory-consolidator',
  });

  expect(listed.isComplete).toBe(false);
  expect(listed.items.map((item) => item.itemID)).toStrictEqual([bees.itemID]);
});

test('it counts each item quote against the budget', async () => {
  const ctx = await setupTest();

  const owner = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const bees = await ctx.memory.store.remember({ text: 'Keeps bees', provenance: owner });

  await ctx.memory.store.remember({
    text: 'Sings in a choir',
    evidenceQuote: 'I sing tenor in the Tuesday night choir!!',
    provenance: owner,
  });

  const listed = await readConsolidationItems(ctx.memory.store, {
    listTokens: 60,
    thread: 'memory-consolidator',
  });

  expect(listed.isComplete).toBe(false);
  expect(listed.items.map((item) => item.itemID)).toStrictEqual([bees.itemID]);
});
