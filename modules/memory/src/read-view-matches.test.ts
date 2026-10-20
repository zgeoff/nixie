import { expect, test } from 'bun:test';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { startTestMemory } from './test-utils/start-test-memory';

test('it finds an active item by a word in its text, with its keyword score', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'Drinks oat milk',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const found = await memory.store.view.readMatchingItems('cello');

  expect(found).toStrictEqual({
    items: [
      {
        itemID: item.itemID,
        shortID: expect.toBeString(),
        state: 'active',
        isPinned: false,
        subject: 'owner',
        version: 1,
        origin: 'owner',
        source: 'owner',
        createdAt: expect.toBeNumber(),
        changedAt: expect.toBeNumber(),
        forgottenAt: null,
        status: 'readable',
        text: 'Plays the cello on Thursdays',
        score: expect.toBeNumber(),
      },
    ],
    searchMode: 'keyword',
  });
});

test('it finds an item by meaning with its similarity once the encoder runs', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([
        ['cello', 'music'],
        ['flat', 'home'],
      ]),
      onError: () => {},
    },
  });

  const item = await memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.waitForSemanticIndex();

  const found = await memory.store.view.readMatchingItems('music');

  expect(found).toMatchObject({
    items: [{ itemID: item.itemID, similarity: expect.toBeNumber() }],
    searchMode: 'hybrid',
  });
});

test('it leaves a retired item out of a search', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const found = await memory.store.view.readMatchingItems('cello');

  expect(found.items).toStrictEqual([]);
});

test('it writes no recall record for a search', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.view.readMatchingItems('cello');

  const recalls = await memory.writer.db
    .$extendTables<{ records: { kind: string } }>()
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'memory.recalled')
    .execute();

  expect(recalls).toStrictEqual([]);
});
