import { expect, test } from 'bun:test';
import { readMockForgetPreview } from './read-mock-forget-preview';
import { store } from './store';

test('it reads the item with every version and counts each message that backed it once', async () => {
  const item = await store.memoryItems.create({
    versions: [
      { text: 'Keeps bees on the roof', evidence: { sequence: 4, start: 0, end: 10 } },
      {
        change: 'edited',
        text: 'Keeps two hives on the roof',
        evidence: { sequence: 4, start: 0, end: 10 },
      },
    ],
  });

  const read = readMockForgetPreview({ itemID: item.itemID, version: 2 });

  expect(read).toMatchObject({
    status: 'read',
    preview: {
      itemID: item.itemID,
      versions: [{ text: 'Keeps bees on the roof' }, { text: 'Keeps two hives on the roof' }],
      lost: { evidenceMessages: 1, proposals: 0 },
    },
  });
});

test("it counts every proposal stored for the item, whatever its status, and no other item's", async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });

  await store.memoryProposals.create({ itemID: item.itemID, targetVersion: 1 });
  await store.memoryProposals.create({ itemID: item.itemID, status: 'rejected', targetVersion: 1 });
  await store.memoryProposals.create({ itemID: item.itemID, status: 'lapsed', targetVersion: 1 });
  await store.memoryProposals.create({ itemID: 'e8a4d2c6-1f3b-4a7e-9c5d-0b6f2e8a1d47' });

  const read = readMockForgetPreview({ itemID: item.itemID, version: 1 });

  expect(read).toMatchObject({
    status: 'read',
    preview: { lost: { evidenceMessages: 0, proposals: 3 } },
  });
});

test('it refuses a version the item moved past', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Keeps bees on the roof' }, { change: 'retired', state: 'retired' }],
  });

  expect(readMockForgetPreview({ itemID: item.itemID, version: 1 })).toStrictEqual({
    status: 'stale',
  });
});

test('it refuses an item that a forget began', async () => {
  const item = await store.memoryItems.create({
    state: 'forgotten',
    versions: [{ text: 'Keeps bees on the roof' }],
  });

  expect(readMockForgetPreview({ itemID: item.itemID, version: 1 })).toStrictEqual({
    status: 'not_found',
  });
});

test('it refuses an item that does not exist', () => {
  expect(
    readMockForgetPreview({ itemID: 'b3c1f7e2-5a94-4d0e-8f6b-2c7d9e1a4b38', version: 1 }),
  ).toStrictEqual({ status: 'not_found' });
});
