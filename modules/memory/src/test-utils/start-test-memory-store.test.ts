import { expect, mock, test } from 'bun:test';
import { startTestSessionHost } from '@heynixie/sessions/test-utils';
import { memoryProjections } from '../memory-projections';
import { startTestMemoryStore } from './start-test-memory-store';

// a session host whose log folds the memory projections, which the store runs on
async function setupTest() {
  const host = await startTestSessionHost({ projections: memoryProjections });

  return { context: host.context };
}

test('it starts a store that remembers and recalls an item', async () => {
  const ctx = await setupTest();
  const store = await startTestMemoryStore(ctx.context, () => Promise.resolve());

  const item = await store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await store.recall({ itemIDs: [item.itemID] });

  expect(result.items).toMatchObject([
    { itemID: item.itemID, text: 'The spare key sits under the blue flowerpot' },
  ]);
});

test('it runs the session cleanup it was given on a forget', async () => {
  const ctx = await setupTest();

  const cleanupSessions = mock(() => Promise.resolve());

  const store = await startTestMemoryStore(ctx.context, cleanupSessions);

  const item = await store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith({ itemID: item.itemID });
});

test('it gives the store a stub encoder over the topics the test passes', async () => {
  const ctx = await setupTest();

  const store = await startTestMemoryStore(ctx.context, () => Promise.resolve(), [
    ['sister', 'sibling'],
  ]);

  const item = await store.remember({
    text: 'Ana is my sister',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await store.waitForSemanticIndex();

  const result = await store.recall({ query: 'who is my sibling' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});
