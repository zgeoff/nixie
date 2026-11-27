import { expect, test } from 'bun:test';
import { startTestSessionHost } from '@heynixie/sessions/test-utils';
import { memoryProjections } from '../moment/projection/memory-projections';
import { startTestMemoryStore } from './start-test-memory-store';

async function setupTest() {
  const host = await startTestSessionHost({ projections: memoryProjections });

  return { context: host.context };
}

test('it starts a store that remembers and recalls an item', async () => {
  const ctx = await setupTest();
  const store = await startTestMemoryStore(ctx.context);

  const item = await store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await store.recall({ itemIDs: [item.itemID] });

  expect(result.items).toMatchObject([
    { itemID: item.itemID, text: 'The spare key sits under the blue flowerpot' },
  ]);
});

test('it gives the store a stub encoder over the topics the test passes', async () => {
  const ctx = await setupTest();
  const store = await startTestMemoryStore(ctx.context, [['sister', 'sibling']]);

  const item = await store.remember({
    text: 'Ana is my sister',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await store.waitForSemanticIndex();

  const result = await store.recall({ query: 'who is my sibling' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});
