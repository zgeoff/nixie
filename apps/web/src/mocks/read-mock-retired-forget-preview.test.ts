import { expect, test } from 'bun:test';
import { readMockRetiredForgetPreview } from './read-mock-retired-forget-preview';
import { store } from './store';

test('it lists each retired item with what its forget destroys, and leaves out the rest', async () => {
  const item = await store.memoryItems.create({
    state: 'retired',
    versions: [{ text: 'Owns a red canoe', evidence: { sequence: 4, start: 0, end: 10 } }],
  });

  await store.memoryItems.create({ versions: [{ text: 'Grows chillies' }] });
  await store.memoryProposals.create({ itemID: item.itemID, targetVersion: 1 });

  const preview = readMockRetiredForgetPreview();

  expect(preview).toMatchObject({
    hasMore: false,
    items: [
      {
        itemID: item.itemID,
        state: 'retired',
        text: 'Owns a red canoe',
        version: 1,
        lost: { evidenceMessages: 1, proposals: 1 },
      },
    ],
  });

  expect(preview.items).toHaveLength(1);
});

test('it lists at most 100 retired items and says more remain', async () => {
  await Promise.all(
    Array.from({ length: 101 }, (_, index) =>
      store.memoryItems.create({
        state: 'retired',
        versions: [{ text: `Owns canoe number ${String(index)}` }],
      }),
    ),
  );

  const preview = readMockRetiredForgetPreview();

  expect(preview.items).toHaveLength(100);
  expect(preview.hasMore).toBeTrue();
});
