import { expect, test } from 'bun:test';
import { createMemoryItem, startTestMemory } from '@heynixie/memory/test-utils';
import { createRouterClient } from '@orpc/server';
import invariant from 'tiny-invariant';
import { buildHostItemProcedures } from './build-host-item-procedures';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, client: createRouterClient(buildHostItemProcedures(() => memory.store)) };
}

test('#read shows an item with its state and every version, oldest first', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Drinks oat milk' });
  const history = await ctx.memory.store.readHistory(item.itemID);

  invariant(history?.versions[0]);

  const shown = await ctx.client.read({ itemID: item.itemID });

  expect(shown).toStrictEqual({
    itemID: item.itemID,
    state: 'active',
    versions: [
      {
        version: 1,
        change: 'created',
        state: 'active',
        origin: 'owner',
        source: 'owner',
        recordedAt: new Date(history.versions[0].recordedAt),
        status: 'readable',
        text: 'Drinks oat milk',
      },
    ],
  });
});

test('#read refuses an item that does not exist with NOT_FOUND', async () => {
  const ctx = await setupTest();

  const shown = ctx.client.read({ itemID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f' });

  await shown.catch(() => {});

  expect(shown).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
    message: 'no memory item has that ID',
  });
});

test('#edit answers with the version the edit added', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Likes jaz' });
  const ref = await ctx.client.edit({ itemID: item.itemID, version: 1, text: 'Likes jazz' });

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 2 });
});

test('#edit refuses a version the item has moved past with STALE_VERSION, and adds none', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Likes jaz' });

  await ctx.client.edit({ itemID: item.itemID, version: 1, text: 'Likes jazz' });

  const edited = ctx.client.edit({ itemID: item.itemID, version: 1, text: 'Likes blues' });

  await edited.catch(() => {});

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(edited).rejects.toMatchObject({ code: 'STALE_VERSION', status: 409 });
  expect(history?.versions).toHaveLength(2);
});

test('#edit refuses blank text as a bad request', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Likes jaz' });

  const edited = ctx.client.edit({ itemID: item.itemID, version: 1, text: '  ' });

  await edited.catch(() => {});

  expect(edited).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
});

test('#retire answers with the version the retirement added', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lives in Lisbon' });
  const ref = await ctx.client.retire({ itemID: item.itemID, version: 1 });

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 2 });
});

test('#restore answers with the version the restore added', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lives in Lisbon' });

  await ctx.client.retire({ itemID: item.itemID, version: 1 });

  const ref = await ctx.client.restore({ itemID: item.itemID, version: 2 });

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 3 });
});

test('#restore refuses an item that is not retired with WRONG_STATE', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lives in Lisbon' });

  const restored = ctx.client.restore({ itemID: item.itemID, version: 1 });

  await restored.catch(() => {});

  expect(restored).rejects.toMatchObject({ code: 'WRONG_STATE', status: 409 });
});

test('#pin answers with the pin it set', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });
  const pinned = await ctx.client.pin({ itemID: item.itemID, isPinned: true });

  expect(pinned).toStrictEqual({ itemID: item.itemID, isPinned: true });
});

test('#pin unpins an item, which leaves the pinned core', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });

  await ctx.client.pin({ itemID: item.itemID, isPinned: true });
  await ctx.client.pin({ itemID: item.itemID, isPinned: false });

  const core = await ctx.memory.store.readPinnedCore();

  expect(core).toStrictEqual([]);
});

test('#pin refuses an item that does not exist with NOT_FOUND', async () => {
  const ctx = await setupTest();

  const pinned = ctx.client.pin({ itemID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f', isPinned: true });

  await pinned.catch(() => {});

  expect(pinned).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
});
