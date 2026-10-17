import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockMemoryChange } from './write-mock-memory-change';

test('it retires an active item with a version of your own that keeps its text', async () => {
  const item = await store.memoryItems.create({
    isPinned: true,
    versions: [{ origin: 'memory_writer', text: 'Rents a flat on Mill Lane' }],
  });

  const result = await writeMockMemoryChange({
    change: 'retire',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(result).toStrictEqual({ status: 'applied' });

  expect(stored).toMatchObject({
    isPinned: false,
    state: 'retired',
    versions: [
      { origin: 'memory_writer' },
      { change: 'retired', origin: 'owner', state: 'retired', text: 'Rents a flat on Mill Lane' },
    ],
  });
});

test('it restores a retired item', async () => {
  const item = await store.memoryItems.create({
    state: 'retired',
    versions: [{ text: 'Rents a flat on Mill Lane' }, { change: 'retired', state: 'retired' }],
  });

  await writeMockMemoryChange({
    change: 'restore',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 2,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(stored?.state).toBe('active');
});

test('it pins an active item without adding a version', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Is allergic to peanuts' }] });

  await writeMockMemoryChange({
    change: 'pin',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    isPinned: true,
    itemID: item.itemID,
    version: 1,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(stored).toMatchObject({ isPinned: true, versions: [{ change: 'created' }] });
});

test('it answers a retry as applied and changes the item once', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Rents a flat' }] });

  const change = {
    change: 'retire',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  } as const;

  await writeMockMemoryChange(change);

  const retried = await writeMockMemoryChange(change);

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(retried).toStrictEqual({ status: 'applied' });
  expect(stored?.versions).toHaveLength(2);
});

test('it refuses an ID that another change used', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Rents a flat' }] });

  await writeMockMemoryChange({
    change: 'retire',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const result = await writeMockMemoryChange({
    change: 'restore',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 2,
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses a version the item moved past, and changes nothing', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Rents a flat' }, { change: 'edited', text: 'Rents a house' }],
  });

  const result = await writeMockMemoryChange({
    change: 'retire',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const stored = store.memoryItems.findFirst((query) => query.where({ itemID: item.itemID }));

  expect(result).toStrictEqual({ status: 'stale' });
  expect(stored?.state).toBe('active');
});

test('it refuses a restore of an active item', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Rents a flat' }] });

  const result = await writeMockMemoryChange({
    change: 'restore',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  expect(result).toStrictEqual({ status: 'wrong_state' });
});

test('it refuses a change to a forgotten item as missing', async () => {
  const item = await store.memoryItems.create({ state: 'forgotten', versions: [{}] });

  const result = await writeMockMemoryChange({
    change: 'retire',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it refuses a pin that takes the core past its budget', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'x'.repeat(8004) }] });

  const result = await writeMockMemoryChange({
    change: 'pin',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    isPinned: true,
    itemID: item.itemID,
    version: 1,
  });

  expect(result).toStrictEqual({ status: 'core_full' });
});

test('it refuses a pin of a self-note as the wrong state', async () => {
  const item = await store.memoryItems.create({
    kind: 'self',
    versions: [{ origin: 'conversation', text: 'Enjoys a slow morning question' }],
  });

  const result = await writeMockMemoryChange({
    change: 'pin',
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    isPinned: true,
    itemID: item.itemID,
    version: 1,
  });

  expect(result).toStrictEqual({ status: 'wrong_state' });
});
