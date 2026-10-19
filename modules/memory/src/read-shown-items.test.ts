import { expect, test } from 'bun:test';
import { readShownItems } from './read-shown-items';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it shows every active item while their text fits the list budget', async () => {
  const ctx = await setupTest();

  const street = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const bees = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shown = await readShownItems(ctx.memory.store, {
    text: 'nothing that matches',
    listTokens: 100,
    topItems: 1,
    thread: 'memory-writer',
  });

  expect(shown.isComplete).toBeTrue();

  expect(shown.items).toIncludeSameMembers([
    { itemID: street.itemID, version: 1, subject: 'owner', text: 'Lives on Elm Street' },
    { itemID: bees.itemID, version: 1, subject: 'owner', text: 'Keeps bees on the roof' },
  ]);
});

test('it shows owner and shared items, and never a self-note', async () => {
  const ctx = await setupTest();

  const street = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const deal = await ctx.memory.store.remember({
    text: 'Sam and Wren swap a riddle every Monday',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'I like riddles with a twist',
    subject: 'self',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: null,
      proposalID: null,
      checks: null,
    },
  });

  const shown = await readShownItems(ctx.memory.store, {
    text: 'nothing that matches',
    listTokens: 100,
    topItems: 1,
    thread: 'memory-writer',
  });

  expect(shown.items).toIncludeSameMembers([
    { itemID: street.itemID, version: 1, subject: 'owner', text: 'Lives on Elm Street' },
    {
      itemID: deal.itemID,
      version: 1,
      subject: 'shared',
      text: 'Sam and Wren swap a riddle every Monday',
    },
  ]);
});

test('it shows the top items by keyword over your messages once the list passes its budget', async () => {
  const ctx = await setupTest();

  const street = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shown = await readShownItems(ctx.memory.store, {
    text: 'We repainted the fence on Elm Street.',
    listTokens: 20,
    topItems: 1,
    thread: 'memory-writer',
  });

  expect(shown).toStrictEqual({
    items: [{ itemID: street.itemID, version: 1, subject: 'owner', text: 'Lives on Elm Street' }],
    isComplete: false,
  });
});
