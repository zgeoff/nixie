import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createMemoryItem } from './test-utils/create-memory-item';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it shows the item with every version, and what the forget destroys beyond its text', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  const edited = await ctx.memory.store.remember({
    text: 'Keeps two hives of bees on the roof',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await createProposal(ctx.memory.store, { text: 'Keeps three hives of bees', target: edited });

  const preview = await ctx.memory.store.view.readForgetPreview(edited);

  expect(preview).toMatchObject({
    itemID: item.itemID,
    state: 'active',
    version: 2,
    text: 'Keeps two hives of bees on the roof',
    versions: [
      { version: 1, change: 'created', text: 'Keeps bees on the roof' },
      { version: 2, change: 'edited', text: 'Keeps two hives of bees on the roof' },
    ],
    lost: { evidenceMessages: 0, proposals: 1 },
  });
});

test('it refuses a preview bound to a version the item has moved past, and writes nothing', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const before = await readRecords(ctx.memory.log, { afterSequence: 0 });

  const preview = ctx.memory.store.view.readForgetPreview(item);

  await preview.catch(() => {});

  const after = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(preview).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(after).toStrictEqual(before);
});

test('it refuses a preview of an item a forget began', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = ctx.memory.store.view.readForgetPreview(item);

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
