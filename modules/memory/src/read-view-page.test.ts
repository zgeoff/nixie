import { expect, test } from 'bun:test';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it lists each active item with its text, origin, source and age', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'task-1',
      proposalID: null,
      checks: null,
    },
  });

  const page = await ctx.memory.store.view.readPage({ state: 'active' });

  expect(page).toStrictEqual({
    items: [
      {
        itemID: item.itemID,
        shortID: expect.toBeString(),
        state: 'active',
        isPinned: false,
        subject: 'owner',
        version: 1,
        origin: 'memory_writer',
        source: 'owner',
        createdAt: expect.toBeNumber(),
        changedAt: expect.toBeNumber(),
        forgottenAt: null,
        until: null,
        status: 'readable',
        text: 'Plays the cello on Thursdays',
      },
    ],
    next: null,
  });
});

test('it lists an edited item at its current text, with the age of its first version', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Plays the cello on Fridays',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const history = await ctx.memory.store.readHistory(item.itemID);
  const page = await ctx.memory.store.view.readPage({ state: 'active' });

  expect(page.items).toMatchObject([
    {
      version: 2,
      text: 'Plays the cello on Fridays',
      createdAt: history?.versions[0]?.recordedAt,
      changedAt: history?.versions[1]?.recordedAt,
    },
  ]);
});

test('it lists retired items apart from active ones', async () => {
  const ctx = await setupTest();

  const kept = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const ended = await ctx.memory.store.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: ended,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const active = await ctx.memory.store.view.readPage({ state: 'active' });
  const retired = await ctx.memory.store.view.readPage({ state: 'retired' });

  expect(active.items.map((item) => item.itemID)).toStrictEqual([kept.itemID]);

  expect(retired.items).toMatchObject([
    { itemID: ended.itemID, state: 'retired', version: 2, text: 'Rents a flat on Mill Lane' },
  ]);
});

test('it lists a forgotten item as a gap with the time its forget completed', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Owes Robin twenty pounds',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await ctx.memory.store.view.readPage({ state: 'forgotten' });

  expect(page.items).toStrictEqual([
    {
      itemID: item.itemID,
      shortID: expect.toBeString(),
      state: 'forgotten',
      isPinned: false,
      subject: 'owner',
      version: 1,
      origin: 'owner',
      source: 'owner',
      createdAt: expect.toBeNumber(),
      changedAt: expect.toBeNumber(),
      forgottenAt: expect.toBeNumber(),
      until: null,
      status: 'shredded',
    },
  ]);
});

test('it pages items in the order they were created', async () => {
  const ctx = await setupTest();

  const first = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.store.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const opening = await ctx.memory.store.view.readPage({ state: 'active', limit: 1 });

  const following = await ctx.memory.store.view.readPage({
    state: 'active',
    limit: 1,
    ...(opening.next === null ? {} : { after: opening.next }),
  });

  expect(opening.items.map((item) => item.itemID)).toStrictEqual([first.itemID]);
  expect(following).toMatchObject({ items: [{ itemID: second.itemID }], next: null });
});

test('it rejects a cursor that no page returned', async () => {
  const ctx = await setupTest();

  const page = ctx.memory.store.view.readPage({ state: 'active', after: 'page-two' });

  await page.catch(() => {});

  expect(page).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
});
