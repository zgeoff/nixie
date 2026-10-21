import { expect, test } from 'bun:test';
import { countTextTokens } from '@heynixie/compaction';
import { removeRecordKey } from '@heynixie/log';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads a pinned item whose key is gone as a gap that takes no tokens', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Is allergic to peanuts',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await removeRecordKey(ctx.memory.log, item.itemID);

  const core = await ctx.memory.store.view.readPinnedCore();

  expect(core).toMatchObject({
    items: [{ itemID: item.itemID, isPinned: true, status: 'shredded' }],
    tokens: 0,
  });
});

test("it counts a second subject's heading, with the owner's name in it, in the core size", async () => {
  const ownerName = 'Bartholomew '.repeat(20).trim();

  const oneSubject = await startTestMemory({ gate: { ownerName } });
  const twoSubjects = await startTestMemory({ gate: { ownerName } });

  await Promise.all([
    oneSubject.store.remember({
      text: 'Is allergic to peanuts',
      isPinned: true,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
    oneSubject.store.remember({
      text: 'Calls the garden shed the cabin',
      isPinned: true,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
    twoSubjects.store.remember({
      text: 'Is allergic to peanuts',
      isPinned: true,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
    twoSubjects.store.remember({
      text: 'Calls the garden shed the cabin',
      subject: 'shared',
      isPinned: true,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  ]);

  const [single, double] = await Promise.all([
    oneSubject.store.view.readPinnedCore(),
    twoSubjects.store.view.readPinnedCore(),
  ]);

  expect(double.tokens - single.tokens).toBeGreaterThanOrEqual(countTextTokens(ownerName));
});

test('it reads the pinned items in pin order with the core size against its budget', async () => {
  const ctx = await setupTest();

  const later = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const earlier = await ctx.memory.store.remember({
    text: 'Is allergic to peanuts',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: later.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const core = await ctx.memory.store.view.readPinnedCore();

  expect(core).toMatchObject({
    items: [
      { itemID: earlier.itemID, isPinned: true, text: 'Is allergic to peanuts' },
      { itemID: later.itemID, isPinned: true, text: 'Goes by Sam' },
    ],
    tokens: expect.toBeWithin(1, 2000),
    budget: 2000,
  });
});

test('it reads an empty core as no items and no tokens', async () => {
  const ctx = await setupTest();
  const core = await ctx.memory.store.view.readPinnedCore();

  expect(core).toStrictEqual({ items: [], tokens: 0, budget: 2000 });
});
