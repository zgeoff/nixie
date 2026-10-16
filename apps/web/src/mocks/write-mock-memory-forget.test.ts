import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockMemoryForget } from './write-mock-memory-forget';

test('it forgets an item at the version the preview showed, which keeps its dates and leaves the core', async () => {
  const item = await store.memoryItems.create({
    isPinned: true,
    versions: [{ text: 'The shed padlock code is 2291' }],
  });

  const result = await writeMockMemoryForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(result).toStrictEqual({ status: 'applied' });

  expect(stored).toMatchObject({
    forgottenAt: expect.toBeValidDate(),
    isPinned: false,
    state: 'forgotten',
    versions: [{ text: 'The shed padlock code is 2291' }],
  });
});

test('it answers a retry with the same ID and input as applied, and forgets once', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Rents a flat on Mill Lane' }],
  });

  const input = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  };

  await writeMockMemoryForget(input);

  const retried = await writeMockMemoryForget(input);

  expect(retried).toStrictEqual({ status: 'applied' });
});

test('it refuses an ID another action used', async () => {
  const [first, second] = await Promise.all([
    store.memoryItems.create({ versions: [{ text: 'Rents a flat on Mill Lane' }] }),
    store.memoryItems.create({ versions: [{ text: 'Waters the ferns on Sundays' }] }),
  ]);

  await writeMockMemoryForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: first.itemID,
    version: 1,
  });

  const result = await writeMockMemoryForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: second.itemID,
    version: 1,
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses a version the item moved past, and forgets nothing', async () => {
  const item = await store.memoryItems.create({
    versions: [
      { text: 'Rents a flat on Mill Lane' },
      { change: 'edited', text: 'Rents a flat on Quay Street' },
    ],
  });

  const result = await writeMockMemoryForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(result).toStrictEqual({ status: 'stale' });
  expect(stored?.state).toBe('active');
});

test('it refuses an item a forget began', async () => {
  const item = await store.memoryItems.create({
    state: 'forgetting',
    versions: [{ text: 'Rents a flat on Mill Lane' }],
  });

  const result = await writeMockMemoryForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});
