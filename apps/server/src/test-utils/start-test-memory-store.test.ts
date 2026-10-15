import { expect, mock, test } from 'bun:test';
import { startTestMemoryStore } from './start-test-memory-store';
import { startTestServer } from './start-test-server';

test('it starts a store that remembers and recalls an item', async () => {
  const server = await startTestServer();
  const store = await startTestMemoryStore(server.context, () => Promise.resolve());

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
  const server = await startTestServer();

  const cleanupSessions = mock(() => Promise.resolve());

  const store = await startTestMemoryStore(server.context, cleanupSessions);

  const item = await store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(cleanupSessions).toHaveBeenCalledExactlyOnceWith(item.itemID);
});
