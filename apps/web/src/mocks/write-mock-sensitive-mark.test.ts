import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockSensitiveMark } from './write-mock-sensitive-mark';

test('it marks an item sensitive', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Lives at 14 Larkspur Lane, flat 3' }],
  });

  const result = await writeMockSensitiveMark({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    isSensitive: true,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(result).toBe('applied');
  expect(stored?.isSensitive).toBe(true);
});

test('it clears the mark of a sensitive item', async () => {
  const item = await store.memoryItems.create({
    isSensitive: true,
    versions: [{ text: 'Lives at 14 Larkspur Lane, flat 3' }],
  });

  await writeMockSensitiveMark({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    isSensitive: false,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(stored?.isSensitive).toBe(false);
});

test('it answers a retry with the same input as applied, and one with another input as reused', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Lives at 14 Larkspur Lane, flat 3' }],
  });

  await writeMockSensitiveMark({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    isSensitive: true,
  });

  const [same, other] = await Promise.all([
    writeMockSensitiveMark({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      itemID: item.itemID,
      isSensitive: true,
    }),
    writeMockSensitiveMark({
      clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      itemID: item.itemID,
      isSensitive: false,
    }),
  ]);

  expect(same).toBe('applied');
  expect(other).toBe('reused');
});

test('it refuses a forgotten item as not found', async () => {
  const item = await store.memoryItems.create({
    state: 'forgotten',
    versions: [{ text: 'Lives at 14 Larkspur Lane, flat 3' }],
  });

  const result = await writeMockSensitiveMark({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    isSensitive: true,
  });

  expect(result).toBe('not_found');
});
